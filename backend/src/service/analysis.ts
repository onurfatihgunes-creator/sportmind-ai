import { supabase } from '../supabaseClient.js';

/**
 * SportMind's own service-boundary query — the ONE place outside the mobile
 * app that reads match/prediction data, and it does so with the service-role
 * client that never leaves this backend. This is what a caller (e.g. Vera)
 * talks to instead of Supabase directly: the caller gets this file's output
 * shape, never table names, row shapes, or a Supabase credential.
 *
 * Reuses the exact tables/fields computePredictions.ts already writes —
 * no new prediction, xG or analysis logic. This module only reads and
 * reshapes what SportMind's own pipeline already computed.
 */

export type MatchFactor = { key: string; home: number; away: number };
export type ChangeEvent = { reason: string; fromHomeWinPct: number; toHomeWinPct: number; createdAt: string };

export type MatchAnalysisRecord = {
  home: string;
  away: string;
  competition: string;
  kickoff: string;
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  xgHome: number;
  xgAway: number;
  favouredTeam: string | null;
  confidencePct: number;
  factors: MatchFactor[];
  homeForm: string[];
  awayForm: string[];
  changes: ChangeEvent[];
  // Always null: no player-availability data source is wired in yet.
  // Never fabricated — see README/AGENTS notes on this project's rule
  // against inventing data a free provider doesn't actually supply.
  playerImpact: null;
};

export type AnalysisLookup =
  | { covered: false }
  | { covered: true; record: null }
  | { covered: true; record: MatchAnalysisRecord };

function favoured(homePct: number, drawPct: number, awayPct: number, homeName: string, awayName: string) {
  if (homePct >= drawPct && homePct >= awayPct) return { team: homeName, pct: homePct };
  if (awayPct >= drawPct && awayPct >= homePct) return { team: awayName, pct: awayPct };
  return { team: null, pct: drawPct };
}

/**
 * The nearest match for a team: soonest upcoming, falling back to the most
 * recently finished one when nothing is scheduled.
 */
async function findNearestMatch(teamIds: string[]) {
  const orClause = teamIds.map((id) => `home_team_id.eq.${id},away_team_id.eq.${id}`).join(',');

  const { data: upcoming, error: upcomingError } = await supabase
    .from('matches')
    .select('*')
    .or(orClause)
    .eq('status', 'scheduled')
    .order('kickoff_at', { ascending: true })
    .limit(1);
  if (upcomingError) throw upcomingError;
  if (upcoming && upcoming.length > 0) return upcoming[0];

  const { data: recent, error: recentError } = await supabase
    .from('matches')
    .select('*')
    .or(orClause)
    .eq('status', 'finished')
    .order('kickoff_at', { ascending: false })
    .limit(1);
  if (recentError) throw recentError;
  return recent && recent.length > 0 ? recent[0] : null;
}

/**
 * Looks up match analysis for a team by (fuzzy) name. Mirrors the
 * three-valued lookup contract SportMind's Vera-side capability expects:
 * not recognised at all vs. recognised with no match on file vs. a real
 * record — see onurai_sportmind.sources.SourceResult for the consumer.
 */
export async function getMatchAnalysisForTeam(teamName: string): Promise<AnalysisLookup> {
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, name')
    .ilike('name', `%${teamName}%`);
  if (teamsError) throw teamsError;
  if (!teams || teams.length === 0) return { covered: false };

  const teamIds = teams.map((t) => t.id);
  const match = await findNearestMatch(teamIds);
  if (!match) return { covered: true, record: null };

  const [{ data: teamRows, error: teamRowsError }, { data: predRows, error: predError }] = await Promise.all([
    supabase.from('teams').select('id, name').in('id', [match.home_team_id, match.away_team_id]),
    supabase.from('predictions').select('*').eq('match_id', match.id),
  ]);
  if (teamRowsError) throw teamRowsError;
  if (predError) throw predError;
  if (!predRows || predRows.length === 0) return { covered: true, record: null };

  const names = Object.fromEntries((teamRows ?? []).map((t) => [t.id, t.name]));
  const homeName = names[match.home_team_id] ?? match.home_team_id;
  const awayName = names[match.away_team_id] ?? match.away_team_id;
  const pred = predRows[0];

  const [{ data: formRows, error: formError }, { data: changeRows, error: changeError }] = await Promise.all([
    supabase
      .from('team_form')
      .select('team_id, result, match_date')
      .in('team_id', [match.home_team_id, match.away_team_id])
      .order('match_date', { ascending: false })
      .limit(10),
    supabase
      .from('prediction_changes')
      .select('*')
      .eq('match_id', match.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  if (formError) throw formError;
  if (changeError) throw changeError;

  const homeForm: string[] = [];
  const awayForm: string[] = [];
  for (const row of formRows ?? []) {
    const bucket = row.team_id === match.home_team_id ? homeForm : awayForm;
    if (bucket.length < 5) bucket.push(row.result);
  }
  homeForm.reverse();
  awayForm.reverse();

  const { team: favouredTeam, pct: confidencePct } = favoured(
    pred.home_win_pct,
    pred.draw_pct,
    pred.away_win_pct,
    homeName,
    awayName,
  );

  const record: MatchAnalysisRecord = {
    home: homeName,
    away: awayName,
    competition: match.competition,
    kickoff: match.kickoff_at,
    homeWinPct: pred.home_win_pct,
    drawPct: pred.draw_pct,
    awayWinPct: pred.away_win_pct,
    xgHome: Number(pred.xg_home),
    xgAway: Number(pred.xg_away),
    favouredTeam,
    confidencePct,
    factors: (pred.factors as MatchFactor[]) ?? [],
    homeForm,
    awayForm,
    changes: (changeRows ?? []).map((c) => ({
      reason: c.reason,
      fromHomeWinPct: c.from_home_win_pct,
      toHomeWinPct: c.to_home_win_pct,
      createdAt: c.created_at,
    })),
    playerImpact: null,
  };

  return { covered: true, record };
}
