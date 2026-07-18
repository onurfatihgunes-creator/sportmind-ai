import { MATERIALITY_THRESHOLD_PCT } from './config.js';
import { supabase } from './supabaseClient.js';

type FormStats = { winRate: number; avgPointsFor: number; avgPointsAgainst: number };

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
    // No recent data yet — neutral baseline around a typical NBA scoring average.
    return { winRate: 0.5, avgPointsFor: 112, avgPointsAgainst: 112 };
  }

  const wins = data.filter((g) => g.result === 'W').length;
  const pointsFor = data.reduce((sum, g) => sum + g.goals_for, 0);
  const pointsAgainst = data.reduce((sum, g) => sum + g.goals_against, 0);

  return {
    winRate: wins / data.length,
    avgPointsFor: pointsFor / data.length,
    avgPointsAgainst: pointsAgainst / data.length,
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
 */
async function computeForMatch(homeTeamId: string, awayTeamId: string) {
  const [home, away] = await Promise.all([getFormStats(homeTeamId), getFormStats(awayTeamId)]);

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

  return {
    outcomes: { home: homePct, draw: 0, away: awayPct },
    xgHome: pointsHome,
    xgAway: pointsAway,
    recentAvgGoalsHome: Number(home.avgPointsFor.toFixed(1)),
    recentAvgGoalsAway: Number(away.avgPointsFor.toFixed(1)),
    factors: [
      { key: 'recentForm', home: recentForm.home, away: recentForm.away },
      { key: 'pointsScored', home: pointsScored.home, away: pointsScored.away },
      { key: 'defensivePerformance', home: defensivePerformance.home, away: defensivePerformance.away },
      { key: 'homeCourtAdvantage', home: BASE_HOME, away: BASE_AWAY },
    ],
  };
}

export async function computeBasketballPredictions() {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('status', 'scheduled')
    .eq('sport', 'basketball');
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
      draw_pct: 0,
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
