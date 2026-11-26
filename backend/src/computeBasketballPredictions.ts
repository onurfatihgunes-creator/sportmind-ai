import { MATERIALITY_THRESHOLD_PCT } from './config.js';
import { supabase } from './supabaseClient.js';
import { appendPredictionHistory, detectHistorySchema, historyRowFrom, isModelSwitch, modelVersion } from './predictionHistory.js';
import { ELO_PARAMS, runElo, winProbability, type EloGame } from './basketballElo.js';

// `matchesCount` distinguishes real, team-specific evidence from the neutral-baseline
// placeholder below — same fix and same reasoning as computePredictions.ts's football
// equivalent (Intelligence 6.1).
type FormStats = { winRate: number; avgPointsFor: number; avgPointsAgainst: number; matchesCount: number };

// Intelligence 7.0 §t: same code-version proxy as computePredictions.ts's football
// equivalent — see that constant's comment for why this is a plain string, not a schema
// column or a `factors` payload field.
// v2 (26 Nov 2026, owner decision to go live before the prospective test): win probability from
// the Elo engine in basketballElo.ts (warmed up on balldontlie history). Retrospective: Brier
// 0.423 vs 0.478 for the v1 formula on 270 games (95% CI of the difference -0.096..-0.023).
// The v1 formula below stays as the fallback and still supplies expected points and the
// form/points/defence factor bars.
export const ENGINE_VERSION = 'v2';
const ELO_MIN_FINISHED_GAMES = 500;

const RECENT_GAMES = 5;
// NBA home teams have historically won ~57-60% of games — used as a fixed prior, not
// team-specific with current data (see computePredictions.ts's football equivalent).
const BASE_HOME = 58;
const BASE_AWAY = 42;

async function getFormStats(teamId: string): Promise<FormStats> {
  const { data, error } = await supabase
    .from('team_form')
    .select('result, goals_for, goals_against')
    .eq('team_id', teamId)
    .order('match_date', { ascending: false })
    .limit(RECENT_GAMES);
  if (error) throw error;

  if (!data || data.length === 0) {
    // No recent data yet — neutral baseline around a typical NBA scoring average, so the
    // match still gets a valid, stable win/away probability. `matchesCount: 0` is what
    // stops this placeholder from being shown to the user as real evidence about this
    // team — see buildPrediction below (currently dormant in production: every NBA team
    // has >=3 real team_form rows as of the 6.0 audit, but a brand-new franchise/relocated
    // team would hit this path).
    return { winRate: 0.5, avgPointsFor: 112, avgPointsAgainst: 112, matchesCount: 0 };
  }

  const wins = data.filter((g) => g.result === 'W').length;
  const pointsFor = data.reduce((sum, g) => sum + g.goals_for, 0);
  const pointsAgainst = data.reduce((sum, g) => sum + g.goals_against, 0);

  return {
    winRate: wins / data.length,
    avgPointsFor: pointsFor / data.length,
    avgPointsAgainst: pointsAgainst / data.length,
    matchesCount: data.length,
  };
}

function clampSplit(homeShare: number): { home: number; away: number } {
  const home = Math.round(Math.min(80, Math.max(20, homeShare)));
  return { home, away: 100 - home };
}

/**
 * v1 prediction model for basketball: recent win rate + scoring rate, blended with a
 * fixed home-court-advantage prior. No draw outcome — basketball games always resolve
 * to a winner. Not yet a trained ML model, same caveat as the football model.
 *
 * Pure (no I/O), same split as computePredictions.ts's `buildPrediction` and for the same
 * reason (Intelligence 6.1) — directly unit-testable, and the win/away probability math
 * is unchanged; only which factors get shown changed. See that function's comments for
 * the full reasoning, identical here.
 */
export function buildPrediction(home: FormStats, away: FormStats) {
  const pointsHome = Number(((home.avgPointsFor + away.avgPointsAgainst) / 2).toFixed(1));
  const pointsAway = Number(((away.avgPointsFor + home.avgPointsAgainst) / 2).toFixed(1));

  const formDelta = (home.winRate - away.winRate) * 40; // scale win-rate diff (-1..1) to pct points
  const pointsDelta = (pointsHome - pointsAway) * 1.2;

  const homePct = Math.round(Math.min(90, Math.max(10, BASE_HOME + formDelta + pointsDelta)));
  const awayPct = 100 - homePct;

  const recentForm = clampSplit(50 + (home.winRate - away.winRate) * 60);
  const pointsScored = clampSplit(50 + (pointsHome - pointsAway) * 3);
  // Lower recent points-against = stronger defence — derived from the same team_form data
  // already fetched above, not a new signal.
  const defensivePerformance = clampSplit(50 + (away.avgPointsAgainst - home.avgPointsAgainst) * 2);

  const bothTeamsHaveForm = home.matchesCount > 0 && away.matchesCount > 0;
  const factors = bothTeamsHaveForm
    ? [
        { key: 'recentForm', home: recentForm.home, away: recentForm.away },
        { key: 'pointsScored', home: pointsScored.home, away: pointsScored.away },
        { key: 'defensivePerformance', home: defensivePerformance.home, away: defensivePerformance.away },
        { key: 'homeCourtAdvantage', home: BASE_HOME, away: BASE_AWAY },
      ]
    : [{ key: 'homeCourtAdvantage', home: BASE_HOME, away: BASE_AWAY }];

  return {
    outcomes: { home: homePct, draw: 0, away: awayPct },
    xgHome: pointsHome,
    xgAway: pointsAway,
    recentAvgGoalsHome: Number(home.avgPointsFor.toFixed(1)),
    recentAvgGoalsAway: Number(away.avgPointsFor.toFixed(1)),
    factors,
  };
}

/** v2: Elo win probability on top of the v1 output; factor keys unchanged for the app. */
export function withElo(base: ReturnType<typeof buildPrediction>, pHome: number) {
  const home = Math.min(99, Math.max(1, Math.round(pHome * 100)));
  const court = Math.round(winProbability(ELO_PARAMS.homeAdvantage) * 100);
  return {
    ...base,
    outcomes: { home, draw: 0, away: 100 - home },
    factors: base.factors.map((f) => (f.key === 'homeCourtAdvantage' ? { key: f.key, home: court, away: 100 - court } : f)),
  };
}

async function selectAll<T>(table: string, select: string, filter: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(select)).order('id').range(from, from + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Pre-game Elo probabilities for every game, from history + finished live games before it. */
export async function loadEloPregame(): Promise<Map<string, { pHome: number }> | null> {
  const history = await selectAll<{ id: string; kickoff_at: string; home_team_id: string; away_team_id: string; home_score: number; away_score: number }>(
    'historical_basketball_games', 'id, kickoff_at, home_team_id, away_team_id, home_score, away_score', (q) => q,
  ).catch(() => []);
  const live = await selectAll<{ id: string; status: string; kickoff_at: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null }>(
    'matches', 'id, status, kickoff_at, home_team_id, away_team_id, home_score, away_score', (q) => q.eq('sport', 'basketball').neq('status', 'postponed'),
  );
  const liveIds = new Set(live.map((m) => m.id));
  const games: EloGame[] = [
    ...history.filter((h) => !liveIds.has(h.id)).map((h) => ({ id: h.id, home: h.home_team_id, away: h.away_team_id, t: Date.parse(h.kickoff_at), homeScore: h.home_score, awayScore: h.away_score })),
    ...live.map((m) => ({ id: m.id, home: m.home_team_id, away: m.away_team_id, t: Date.parse(m.kickoff_at), homeScore: m.status === 'finished' ? m.home_score : null, awayScore: m.status === 'finished' ? m.away_score : null })),
  ];
  const finished = games.filter((g) => g.homeScore !== null && g.awayScore !== null).length;
  if (finished < ELO_MIN_FINISHED_GAMES) {
    console.log(`Basketball: only ${finished} finished games for Elo — using the v1 formula.`);
    return null;
  }
  console.log(`Basketball engine v2 (Elo): ${finished} finished games (${history.length} history).`);
  return runElo(games);
}

async function computeForMatch(homeTeamId: string, awayTeamId: string) {
  const [home, away] = await Promise.all([getFormStats(homeTeamId), getFormStats(awayTeamId)]);
  return buildPrediction(home, away);
}

// Same rule as computePredictions.ts's football equivalent: a prediction is computed only
// while the game has not started. A game that stays `status: 'scheduled'` past its kickoff
// (the provider's status lags or never resolves) keeps its last pre-game prediction frozen,
// so the stored number is always a genuine pre-game one and stays evaluable.
export async function computeBasketballPredictions() {
  const notStartedAfter = new Date().toISOString();
  const elo = await loadEloPregame();
  const schema = await detectHistorySchema();
  const { data: newest } = await supabase
    .from('matches')
    .select('kickoff_at')
    .eq('sport', 'basketball')
    .eq('status', 'finished')
    .order('kickoff_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const latestInputAt: string | null = newest?.kickoff_at ?? null;
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id, kickoff_at')
    .eq('status', 'scheduled')
    .eq('sport', 'basketball')
    .gt('kickoff_at', notStartedAfter);
  if (error) throw error;

  for (const match of matches ?? []) {
    const base = await computeForMatch(match.home_team_id, match.away_team_id);
    const pre = elo?.get(match.id);
    const result = pre ? withElo(base, pre.pHome) : base;
    const version = modelVersion('basketball', pre ? ENGINE_VERSION : 'v1');
    const calculatedAt = new Date().toISOString();

    const { data: existing } = await supabase
      .from('predictions')
      .select(schema.predictionsVersioned ? 'home_win_pct, model_version' : 'home_win_pct')
      .eq('match_id', match.id)
      .maybeSingle<{ home_win_pct: number; model_version?: string | null }>();

    const { error: upsertError } = await supabase.from('predictions').upsert({
      ...(schema.predictionsVersioned ? { model_version: version, input_data_timestamp: latestInputAt } : {}),
      match_id: match.id,
      home_win_pct: result.outcomes.home,
      draw_pct: 0,
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
          sport: 'basketball',
          modelVersion: version,
          status: 'published',
          calculatedAt,
          kickoffAt: match.kickoff_at,
          outcomesPct: { home: result.outcomes.home, draw: 0, away: result.outcomes.away },
          expectedHome: result.xgHome,
          expectedAway: result.xgAway,
          inputDataTimestamp: latestInputAt,
          factors: result.factors,
        }),
      );
    }

    if (
      existing &&
      !isModelSwitch(existing.model_version, version, false) &&
      Math.abs(existing.home_win_pct - result.outcomes.home) >= MATERIALITY_THRESHOLD_PCT
    ) {
      const { error: logError } = await supabase.from('prediction_changes').insert({
        match_id: match.id,
        reason: 'recent_results_updated',
        from_home_win_pct: existing.home_win_pct,
        to_home_win_pct: result.outcomes.home,
      });
      if (logError) throw logError;
    }
  }

  console.log(`Computed basketball predictions for ${matches?.length ?? 0} matches`);
}
