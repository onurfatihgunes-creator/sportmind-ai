import { MATERIALITY_THRESHOLD_PCT } from './config.js';
import { supabase } from './supabaseClient.js';

type FormStats = { pointsPerGame: number; avgGoalsFor: number; avgGoalsAgainst: number };

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
    // No recent data yet (new team or not enough history synced) — fall back to a neutral baseline.
    return { pointsPerGame: 1.3, avgGoalsFor: 1.3, avgGoalsAgainst: 1.3 };
  }

  const points = data.reduce((sum, m) => sum + (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0), 0);
  const goalsFor = data.reduce((sum, m) => sum + m.goals_for, 0);
  const goalsAgainst = data.reduce((sum, m) => sum + m.goals_against, 0);

  return {
    pointsPerGame: points / data.length,
    avgGoalsFor: goalsFor / data.length,
    avgGoalsAgainst: goalsAgainst / data.length,
  };
}

function clampSplit(homeShare: number): { home: number; away: number } {
  const home = Math.round(Math.min(75, Math.max(25, homeShare)));
  return { home, away: 100 - home };
}

function normalizeOutcomes(home: number, draw: number, away: number) {
  const total = home + draw + away;
  return {
    home: Math.round((home / total) * 100),
    draw: Math.round((draw / total) * 100),
    away: Math.round((away / total) * 100),
  };
}

/**
 * v1 prediction model: a transparent statistical formula over recent form and scoring
 * rate, blended with a historical home-advantage prior. This is NOT a trained ML model —
 * there isn't enough historical result data synced yet to train one. Once several months
 * of results have accumulated in `team_form`/`matches`, replace this with a model trained
 * offline on that data (e.g. gradient boosting) while keeping the same output shape.
 */
async function computeForMatch(homeTeamId: string, awayTeamId: string) {
  const [home, away] = await Promise.all([getFormStats(homeTeamId), getFormStats(awayTeamId)]);

  const xgHome = Number(((home.avgGoalsFor + away.avgGoalsAgainst) / 2).toFixed(1));
  const xgAway = Number(((away.avgGoalsFor + home.avgGoalsAgainst) / 2).toFixed(1));

  const formDelta = (home.pointsPerGame - away.pointsPerGame) * 6; // scale PPG diff (-3..3) to pct points
  const xgDelta = (xgHome - xgAway) * 5;

  const outcomes = normalizeOutcomes(BASE_HOME + formDelta + xgDelta, BASE_DRAW, BASE_AWAY - formDelta - xgDelta);

  const recentForm = clampSplit(50 + (home.pointsPerGame - away.pointsPerGame) * 12);
  const expectedGoals = clampSplit(50 + (xgHome - xgAway) * 10);
  const homeAdvantage = { home: 62, away: 38 }; // fixed prior, not team-specific with current data
  // Lower recent goals-against = stronger defence — derived from the same team_form data
  // already fetched above, not a new signal.
  const defensivePerformance = clampSplit(50 + (away.avgGoalsAgainst - home.avgGoalsAgainst) * 10);

  return {
    outcomes,
    xgHome,
    xgAway,
    recentAvgGoalsHome: Number(home.avgGoalsFor.toFixed(1)),
    recentAvgGoalsAway: Number(away.avgGoalsFor.toFixed(1)),
    factors: [
      { key: 'recentForm', home: recentForm.home, away: recentForm.away },
      { key: 'expectedGoals', home: expectedGoals.home, away: expectedGoals.away },
      { key: 'defensivePerformance', home: defensivePerformance.home, away: defensivePerformance.away },
      { key: 'homeAdvantage', home: homeAdvantage.home, away: homeAdvantage.away },
    ],
  };
}

export async function computePredictions() {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('status', 'scheduled');
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
