import { MATERIALITY_THRESHOLD_PCT } from './config.js';
import { supabase } from './supabaseClient.js';
import {
  POISSON_LOOKBACK_DAYS,
  POISSON_MIN_TRAINING_MATCHES,
  defenceRating,
  expectedGoals as modelExpectedGoals,
  fitPoisson,
  outcomeProbabilities,
  type PoissonFit,
  type TrainingMatch,
} from './poissonModel.js';
import { appendPredictionHistory, detectHistorySchema, historyRowFrom, isModelSwitch, modelVersion } from './predictionHistory.js';

// `matchesCount` is the whole point of Intelligence 6.1: it's the one thing that tells a
// caller whether `pointsPerGame`/`avgGoalsFor`/`avgGoalsAgainst` are real, team-specific
// evidence or the neutral-baseline placeholder below. Before this field existed, nothing
// downstream could tell the two apart — see buildPrediction's own comment for exactly
// where that mattered.
type FormStats = { pointsPerGame: number; avgGoalsFor: number; avgGoalsAgainst: number; matchesCount: number };

// Intelligence 7.0 §t: a safe, non-breaking code-version proxy — plain string constant, no
// schema column, no stored/persisted value anywhere. `predictions.factors` has a documented
// jsonb shape consumed by both the mobile app and Vera's service/analysis.ts, so embedding a
// version marker inside that column would be a breaking contract change; this constant is
// the deliberately lightweight alternative (the real audit trail is git history).
// v2 (Nov 2026): the goal model in poissonModel.ts. v1 (the formula in buildPrediction) stays
// as the fallback when there are too few finished matches to fit v2 on.
export const ENGINE_VERSION = 'v2';

const RECENT_FORM_MATCHES = 5;
// Historical baseline split for top-division matches before any team-specific adjustment.
const BASE_HOME = 45;
const BASE_DRAW = 27;
const BASE_AWAY = 28;

// The draw prior is measured, not assumed. The read-only evaluation (npm run evaluate, Nov
// 2026: 563 finished, pre-kickoff-predicted matches) showed the fixed 27% draw share
// over-predicting draws by ~6 points (actual 21.1%) on every single match. The prior is now
// the real draw rate of recently finished football matches, used only once the sample is
// large enough; below that the old 27% stays. Home and away keep their 45:28 ratio and share
// what the draw prior leaves, so nothing else in the formula changes meaning.
const DRAW_RATE_LOOKBACK_DAYS = 365;
const DRAW_RATE_MIN_SAMPLE = 200;

export type BasePriors = { home: number; draw: number; away: number };
export const DEFAULT_PRIORS: BasePriors = { home: BASE_HOME, draw: BASE_DRAW, away: BASE_AWAY };

/** Pure: base priors from finished-match scores. Falls back to DEFAULT_PRIORS on a small sample. */
export function priorsFromResults(results: { home_score: number | null; away_score: number | null }[]): BasePriors {
  const scored = results.filter((r) => r.home_score !== null && r.away_score !== null);
  if (scored.length < DRAW_RATE_MIN_SAMPLE) return DEFAULT_PRIORS;
  const draw = (scored.filter((r) => r.home_score === r.away_score).length / scored.length) * 100;
  const rest = 100 - draw;
  return { home: (rest * BASE_HOME) / (BASE_HOME + BASE_AWAY), draw, away: (rest * BASE_AWAY) / (BASE_HOME + BASE_AWAY) };
}

/** `latestInputAt`: kickoff of the newest finished match the model could see (input_data_timestamp). */
type History = { priors: BasePriors; fit: PoissonFit | null; latestInputAt: string | null };

/** Finished football matches of the last POISSON_LOOKBACK_DAYS: the v2 fit and the v1 draw prior. */
async function loadHistory(now: number): Promise<History> {
  const since = new Date(now - Math.max(POISSON_LOOKBACK_DAYS, DRAW_RATE_LOOKBACK_DAYS) * 86_400_000).toISOString();
  const rows: { home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null; kickoff_at: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id, home_score, away_score, kickoff_at')
      .eq('sport', 'football')
      .eq('status', 'finished')
      .gte('kickoff_at', since)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const training: TrainingMatch[] = rows
    .filter((r) => r.home_score !== null && r.away_score !== null)
    .map((r) => ({ home_team_id: r.home_team_id, away_team_id: r.away_team_id, home_score: r.home_score!, away_score: r.away_score!, t: new Date(r.kickoff_at).getTime() }))
    .filter((r) => r.t < now);
  const drawSince = now - DRAW_RATE_LOOKBACK_DAYS * 86_400_000;
  const priors = priorsFromResults(rows.filter((r) => new Date(r.kickoff_at).getTime() >= drawSince));
  const fit = fitPoisson(training, now);
  const latest = training.reduce((max, r) => Math.max(max, r.t), 0);
  return { priors, fit: fit.n >= POISSON_MIN_TRAINING_MATCHES ? fit : null, latestInputAt: latest > 0 ? new Date(latest).toISOString() : null };
}

async function getFormStats(teamId: string): Promise<FormStats> {
  const { data, error } = await supabase
    .from('team_form')
    .select('result, goals_for, goals_against')
    .eq('team_id', teamId)
    .order('match_date', { ascending: false })
    .limit(RECENT_FORM_MATCHES);
  if (error) throw error;

  if (!data || data.length === 0) {
    // No recent data yet (new team or not enough history synced) — a neutral baseline so
    // the match still gets a valid, stable win/draw/away probability (see buildPrediction:
    // a genuinely unknown team is modelled as a league-average one for THAT purpose, which
    // is a defensible, always-necessary modelling choice, not evidence about this team).
    // `matchesCount: 0` is what stops this same placeholder from being displayed to the
    // user as if it were real evidence — see Intelligence 6.1's audit for the live case
    // this was found from (Feyenoord Rotterdam showing a specific "37% recent form" with
    // zero real matches behind it).
    return { pointsPerGame: 1.3, avgGoalsFor: 1.3, avgGoalsAgainst: 1.3, matchesCount: 0 };
  }

  const points = data.reduce((sum, m) => sum + (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0), 0);
  const goalsFor = data.reduce((sum, m) => sum + m.goals_for, 0);
  const goalsAgainst = data.reduce((sum, m) => sum + m.goals_against, 0);

  return {
    pointsPerGame: points / data.length,
    avgGoalsFor: goalsFor / data.length,
    avgGoalsAgainst: goalsAgainst / data.length,
    matchesCount: data.length,
  };
}

function clampSplit(homeShare: number): { home: number; away: number } {
  const home = Math.round(Math.min(75, Math.max(25, homeShare)));
  return { home, away: 100 - home };
}

// Each raw share is floored at 1 before normalizing — a large enough formDelta/xgDelta
// swing (e.g. a team on a perfect run against a winless one) can otherwise push
// `BASE_AWAY - formDelta - xgDelta` negative, and dividing a negative share into the
// total produces a negative percentage in the final output. computeBasketballPredictions.ts
// already guards its own split the same way (Math.min/Math.max clamp); this is the
// three-way (home/draw/away) equivalent for football's split.
//
// Uses the largest-remainder method rather than three independent Math.round calls —
// confirmed live (backend/src/computePredictions.test.ts) that independently rounding
// three shares can sum to 99 or 101 instead of 100 for ~9% of realistic form/xG inputs
// (e.g. home 44 / draw 27 / away 30 = 101), a real, user-visible correctness bug for a
// distribution the UI displays as a 100%-wide bar. Flooring each share and handing the
// 0-2 leftover points to whichever share(s) lost the most to flooring guarantees the
// three percentages always sum to exactly 100.
export function normalizeOutcomes(home: number, draw: number, away: number) {
  const safeHome = Math.max(1, home);
  const safeDraw = Math.max(1, draw);
  const safeAway = Math.max(1, away);
  const total = safeHome + safeDraw + safeAway;

  const shares = [
    { key: 'home' as const, exact: (safeHome / total) * 100 },
    { key: 'draw' as const, exact: (safeDraw / total) * 100 },
    { key: 'away' as const, exact: (safeAway / total) * 100 },
  ];
  const floored = shares.map((s) => ({ key: s.key, base: Math.floor(s.exact), remainder: s.exact - Math.floor(s.exact) }));
  const leftover = 100 - floored.reduce((sum, s) => sum + s.base, 0);

  const result: Record<'home' | 'draw' | 'away', number> = { home: 0, draw: 0, away: 0 };
  for (const s of floored) result[s.key] = s.base;
  const byRemainderDesc = [...floored].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < leftover; i++) result[byRemainderDesc[i % byRemainderDesc.length].key] += 1;

  return result;
}

/**
 * v1 prediction model: a transparent statistical formula over recent form and scoring
 * rate, blended with a historical home-advantage prior. This is NOT a trained ML model —
 * there isn't enough historical result data synced yet to train one. Once several months
 * of results have accumulated in `team_form`/`matches`, replace this with a model trained
 * offline on that data (e.g. gradient boosting) while keeping the same output shape.
 *
 * Pure (no I/O) so it's directly unit-testable with synthetic FormStats — see
 * computePredictions.test.ts's zero/limited/trusted-form cases. Split out from
 * computeForMatch specifically for Intelligence 6.1's fix (below); the win/draw/away
 * probability math is UNCHANGED from before that fix — see the comment on
 * `bothTeamsHaveForm` for exactly what changed and, just as importantly, what didn't.
 */
export function buildPrediction(home: FormStats, away: FormStats, priors: BasePriors = DEFAULT_PRIORS) {
  const xgHome = Number(((home.avgGoalsFor + away.avgGoalsAgainst) / 2).toFixed(1));
  const xgAway = Number(((away.avgGoalsFor + home.avgGoalsAgainst) / 2).toFixed(1));

  const formDelta = (home.pointsPerGame - away.pointsPerGame) * 6; // scale PPG diff (-3..3) to pct points
  const xgDelta = (xgHome - xgAway) * 5;

  // DELIBERATELY UNCHANGED (Intelligence 6.1 §7/§19/§20): the win/draw/away probability
  // still uses getFormStats' neutral-baseline fallback for a team with zero real matches,
  // exactly as before this fix. A valid, stable 3-way probability is required regardless
  // of data availability, and quietly changing what it means for a genuinely brand-new
  // team would be a prediction-algorithm change — this sprint's own stop condition,
  // deferred to a real product decision rather than made unilaterally (see the final
  // report's "Decision" section for the full reasoning and measured before/after impact).
  const outcomes = normalizeOutcomes(priors.home + formDelta + xgDelta, priors.draw, priors.away - formDelta - xgDelta);

  const recentForm = clampSplit(50 + (home.pointsPerGame - away.pointsPerGame) * 12);
  const expectedGoals = clampSplit(50 + (xgHome - xgAway) * 10);
  const homeAdvantage = { home: 62, away: 38 }; // fixed prior, not team-specific with current data
  // Lower recent goals-against = stronger defence — derived from the same team_form data
  // already fetched above, not a new signal.
  const defensivePerformance = clampSplit(50 + (away.avgGoalsAgainst - home.avgGoalsAgainst) * 10);

  // CHANGED (Intelligence 6.1): the three factors below are exactly the ones derived from
  // getFormStats — if EITHER side has zero real matches, their home/away split is not
  // evidence, it's the neutral-baseline placeholder doing arithmetic against a real (or
  // another placeholder) number. Confirmed live: FC Barcelona vs Feyenoord Rotterdam
  // (Feyenoord had zero team_form rows) previously showed "Recent form: 63% Barcelona /
  // 37% Feyenoord" — a specific, confident-looking number with no real Feyenoord data
  // behind it. `homeAdvantage` is unaffected — it's a fixed prior, never team-specific.
  const bothTeamsHaveForm = home.matchesCount > 0 && away.matchesCount > 0;
  const factors = bothTeamsHaveForm
    ? [
        { key: 'recentForm', home: recentForm.home, away: recentForm.away },
        { key: 'expectedGoals', home: expectedGoals.home, away: expectedGoals.away },
        { key: 'defensivePerformance', home: defensivePerformance.home, away: defensivePerformance.away },
        { key: 'homeAdvantage', home: homeAdvantage.home, away: homeAdvantage.away },
      ]
    : [{ key: 'homeAdvantage', home: homeAdvantage.home, away: homeAdvantage.away }];

  return {
    outcomes,
    xgHome,
    xgAway,
    recentAvgGoalsHome: Number(home.avgGoalsFor.toFixed(1)),
    recentAvgGoalsAway: Number(away.avgGoalsFor.toFixed(1)),
    factors,
  };
}

/**
 * v2: probabilities and expected goals from the goal model; the factor bars keep the same four
 * keys (so the app and Vera's service need no change) but now carry model evidence:
 *   recentForm            unchanged — points per game over the last 5 results (descriptive)
 *   expectedGoals         the model's expected goals for each side (opponent-adjusted)
 *   defensivePerformance  goals each side would concede against an average attack (lower = better)
 *   homeAdvantage         the measured home goal multiplier instead of the fixed 62/38
 * Same evidence rule as v1: with no real recent results for either side only homeAdvantage is
 * shown, since the model then knows that team only as "average".
 */
export function buildPredictionV2(home: FormStats, away: FormStats, fit: PoissonFit, homeTeamId: string, awayTeamId: string) {
  const lambda = modelExpectedGoals(fit, homeTeamId, awayTeamId);
  const p = outcomeProbabilities(lambda.home, lambda.away);
  const outcomes = normalizeOutcomes(p.home * 100, p.draw * 100, p.away * 100);
  const xgHome = Number(lambda.home.toFixed(1)); // predictions.xg_* is numeric(5,1)
  const xgAway = Number(lambda.away.toFixed(1));

  const recentForm = clampSplit(50 + (home.pointsPerGame - away.pointsPerGame) * 12);
  const expectedGoalsSplit = clampSplit(50 + (lambda.home - lambda.away) * 10);
  const defensivePerformance = clampSplit(50 + (defenceRating(fit, awayTeamId) - defenceRating(fit, homeTeamId)) * 10);
  const homeAdvantage = clampSplit((100 * fit.home) / (1 + fit.home));

  const bothTeamsHaveForm = home.matchesCount > 0 && away.matchesCount > 0;
  const factors = bothTeamsHaveForm
    ? [
        { key: 'recentForm', home: recentForm.home, away: recentForm.away },
        { key: 'expectedGoals', home: expectedGoalsSplit.home, away: expectedGoalsSplit.away },
        { key: 'defensivePerformance', home: defensivePerformance.home, away: defensivePerformance.away },
        { key: 'homeAdvantage', home: homeAdvantage.home, away: homeAdvantage.away },
      ]
    : [{ key: 'homeAdvantage', home: homeAdvantage.home, away: homeAdvantage.away }];

  return {
    outcomes,
    xgHome,
    xgAway,
    recentAvgGoalsHome: Number(home.avgGoalsFor.toFixed(1)),
    recentAvgGoalsAway: Number(away.avgGoalsFor.toFixed(1)),
    factors,
  };
}

/**
 * v1 (and the v1 fallback) always stores the fixed homeAdvantage prior 62/38; v2 stores the
 * measured one (~56/44; it would only read 62/38 at a home multiplier of ~1.63, far outside
 * real football). When a stored prediction and its recomputation sit on different sides of
 * that marker, the probability moved because the ENGINE changed, not because new results
 * arrived, so it must not be logged as "recent results updated" — otherwise the first run
 * after the v2 deploy would flood the app's Recent changes with false reasons.
 */
export function isEngineSwitch(existingFactors: unknown, newFactors: readonly { key: string; home: number; away: number }[]): boolean {
  const isV1Prior = (factors: unknown) =>
    Array.isArray(factors) && factors.some((f) => f?.key === 'homeAdvantage' && f.home === 62 && f.away === 38);
  return isV1Prior(existingFactors) !== isV1Prior(newFactors);
}

async function computeForMatch(homeTeamId: string, awayTeamId: string, history: History) {
  const [home, away] = await Promise.all([getFormStats(homeTeamId), getFormStats(awayTeamId)]);
  return history.fit ? buildPredictionV2(home, away, history.fit, homeTeamId, awayTeamId) : buildPrediction(home, away, history.priors);
}

// A prediction is computed only while the match has not started. Before Nov 2026 a match
// was recomputed until 3 days after kickoff when the provider's status lagged at
// 'scheduled'; the evaluation found 683 of 2,579 stored predictions (26%) overwritten after
// kickoff that way, which destroyed the genuine pre-match number (unevaluable) and let a user
// see the probability move during or after the match. A match stuck at 'scheduled' now keeps
// its last pre-kickoff prediction frozen; a rescheduled match (new future kickoff_at) is
// picked up again automatically.
export async function computePredictions() {
  const now = Date.now();
  const notStartedAfter = new Date(now).toISOString();
  const history = await loadHistory(now);
  const { priors, fit } = history;
  console.log(
    fit
      ? `Engine v2: goal model fitted on ${fit.n} matches (home multiplier ${fit.home.toFixed(3)}, base rate ${fit.c.toFixed(3)})`
      : `Engine v1 fallback (too few finished matches for v2). Base priors: home ${priors.home.toFixed(1)} / draw ${priors.draw.toFixed(1)} / away ${priors.away.toFixed(1)}`,
  );
  // V3 A1/A2: the engine that actually produced each number is recorded ('football-v1-fallback'
  // is the v1 formula with the measured draw prior, used only below 200 training matches).
  const version = modelVersion('football', fit ? ENGINE_VERSION : 'v1-fallback');
  const schema = await detectHistorySchema();
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff_at')
    .eq('status', 'scheduled')
    .eq('sport', 'football')
    .gt('kickoff_at', notStartedAfter);
  if (error) throw error;

  for (const match of matches ?? []) {
    const result = await computeForMatch(match.home_team_id, match.away_team_id, history);
    const calculatedAt = new Date().toISOString();

    const { data: existing } = await supabase
      .from('predictions')
      .select(schema.predictionsVersioned ? 'home_win_pct, factors, model_version' : 'home_win_pct, factors')
      .eq('match_id', match.id)
      .maybeSingle<{ home_win_pct: number; factors: unknown; model_version?: string | null }>();

    const { error: upsertError } = await supabase.from('predictions').upsert({
      ...(schema.predictionsVersioned ? { model_version: version, input_data_timestamp: history.latestInputAt } : {}),
      match_id: match.id,
      home_win_pct: result.outcomes.home,
      draw_pct: result.outcomes.draw,
      away_win_pct: result.outcomes.away,
      xg_home: result.xgHome,
      xg_away: result.xgAway,
      recent_avg_goals_home: result.recentAvgGoalsHome,
      recent_avg_goals_away: result.recentAvgGoalsAway,
      factors: result.factors,
      computed_at: calculatedAt,
    });
    if (upsertError) throw upsertError;

    if (schema.historyTable) {
      await appendPredictionHistory(
        historyRowFrom({
          matchId: match.id,
          sport: 'football',
          modelVersion: version,
          status: 'published',
          calculatedAt,
          kickoffAt: match.kickoff_at,
          outcomesPct: result.outcomes,
          expectedHome: result.xgHome,
          expectedAway: result.xgAway,
          inputDataTimestamp: history.latestInputAt,
          factors: result.factors,
        }),
      );
    }

    if (
      existing &&
      !isModelSwitch(existing.model_version, version, isEngineSwitch(existing.factors, result.factors)) &&
      Math.abs(existing.home_win_pct - result.outcomes.home) >= MATERIALITY_THRESHOLD_PCT
    ) {
      // The only inputs that can move home_win_pct between runs are new results landing in
      // team_form (recent form + goal averages) — there's no separate injury/lineup/weather
      // signal in the free data tier, so this is the one honest reason to log.
      const { error: logError } = await supabase.from('prediction_changes').insert({
        match_id: match.id,
        reason: 'recent_results_updated',
        from_home_win_pct: existing.home_win_pct,
        to_home_win_pct: result.outcomes.home,
      });
      if (logError) throw logError;
    }
  }

  console.log(`Computed predictions for ${matches?.length ?? 0} matches`);
}
