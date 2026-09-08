import { MATERIALITY_THRESHOLD_PCT } from './config.js';
import { supabase } from './supabaseClient.js';
import { staleCutoffIso } from './evaluation.js';

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
export const ENGINE_VERSION = 'v1';

const RECENT_FORM_MATCHES = 5;
// Historical baseline split for top-division matches before any team-specific adjustment.
const BASE_HOME = 45;
const BASE_DRAW = 27;
const BASE_AWAY = 28;

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
export function buildPrediction(home: FormStats, away: FormStats) {
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
  const outcomes = normalizeOutcomes(BASE_HOME + formDelta + xgDelta, BASE_DRAW, BASE_AWAY - formDelta - xgDelta);

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

async function computeForMatch(homeTeamId: string, awayTeamId: string) {
  const [home, away] = await Promise.all([getFormStats(homeTeamId), getFormStats(awayTeamId)]);
  return buildPrediction(home, away);
}

// A real, measured data-hygiene gap, found via a live backtest audit: a small tail of
// matches stay `status: 'scheduled'` in this DB well past their real-world kickoff — the
// provider's own status for them never resolves to finished/postponed on a later sync (or
// resolves so late it's effectively stuck), yet this function keeps recomputing a "fresh"
// prediction for them every 6-hour run, with `computed_at` drifting further and further
// past `kickoff_at` each time (one confirmed live: 113 days late). That's not a
// probability-calculation bug — the formula itself is unaffected — but it wastes a
// compute+DB round trip forever on a match that will never usefully update again, and
// makes `computed_at` a misleading "this is a fresh pre-match prediction" signal for
// something that stopped being pre-match a long time ago. A match that's still genuinely
// upcoming is never affected by this: `ACTIVE_WINDOW_DAYS`/`FORM_LOOKBACK_DAYS` already
// bound what fetchFixtures.ts ever ingests as 'scheduled' in the first place, so a real
// near-term fixture's kickoff is always well within this margin.
const STALE_SCHEDULED_GRACE_DAYS = 3;

export async function computePredictions() {
  const staleCutoff = staleCutoffIso(STALE_SCHEDULED_GRACE_DAYS);
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('status', 'scheduled')
    .eq('sport', 'football')
    .gte('kickoff_at', staleCutoff);
  if (error) throw error;

  for (const match of matches ?? []) {
    const result = await computeForMatch(match.home_team_id, match.away_team_id);

    const { data: existing } = await supabase
      .from('predictions')
      .select('home_win_pct')
      .eq('match_id', match.id)
      .maybeSingle();

    const { error: upsertError } = await supabase.from('predictions').upsert({
      match_id: match.id,
      home_win_pct: result.outcomes.home,
      draw_pct: result.outcomes.draw,
      away_win_pct: result.outcomes.away,
      xg_home: result.xgHome,
      xg_away: result.xgAway,
      recent_avg_goals_home: result.recentAvgGoalsHome,
      recent_avg_goals_away: result.recentAvgGoalsAway,
      factors: result.factors,
      computed_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;

    if (existing && Math.abs(existing.home_win_pct - result.outcomes.home) >= MATERIALITY_THRESHOLD_PCT) {
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
