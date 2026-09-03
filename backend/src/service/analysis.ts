import { supabase } from '../supabaseClient.js';
import {
  aggregateForm,
  computeAttackSignals,
  computeDefenceSignals,
  computeFormSignal,
  computeH2HSignal,
  computeHomeAdvantageSignal,
  computeOverallConfidence,
  computePossessionSignal,
  computeSquadDepthSignal,
  derivePlayerImpact,
  deriveKeyFactors,
  latestOf,
  type AvailabilityRow,
  type BsdTeamMatchSample,
  type FormRow,
  type H2HAggregate,
  type KeyFactor,
  type PlayerImpactEntry,
  type Signal,
} from '../analysisEngine.js';

/**
 * SportMind's own service-boundary query — the ONE place outside the mobile
 * app that reads match/prediction data, and it does so with the service-role
 * client that never leaves this backend. This is what a caller (e.g. Vera)
 * talks to instead of Supabase directly: the caller gets this file's output
 * shape, never table names, row shapes, or a Supabase credential.
 *
 * The PREDICTION itself (home/draw/away %, xG, factors) still comes straight
 * from computePredictions.ts's output — this module never touches a
 * percentage. Everything added by MASTER PROMPT PHASE 2 (signals, keyFactors,
 * playerImpact, dataConfidence) is a read-only EXPLANATION layer computed live
 * over already-ingested tables via analysisEngine.ts's deterministic
 * functions — see that file's module doc. No new external API call is made
 * here (§16): all inputs come from Supabase, which BSD enrichment already
 * populated during ingestion.
 */

export type MatchFactor = { key: string; home: number; away: number };

export type ChangeEvent = {
  reason: string;
  fromHomeWinPct: number;
  toHomeWinPct: number;
  createdAt: string;
  // Populated only for analysis_changes-sourced rows (squad/lineup changes) — undefined
  // for the original prediction_changes-sourced rows, so existing consumers reading only
  // reason/fromHomeWinPct/toHomeWinPct/createdAt see no change in shape.
  category?: string;
  previousValue?: string | null;
  newValue?: string;
  source?: string;
};

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
  // Real BSD-derived data when this match has been enriched (possibly an empty array —
  // that itself is a real signal: BSD reports no notable absences). null only when this
  // match has never been BSD-enriched at all (no lineup/availability data source yet for
  // it), matching the previous "always null" placeholder's documented meaning.
  playerImpact: PlayerImpactEntry[] | null;
  // New in Phase 2 — additive, does not replace confidencePct (which stays exactly the
  // predicted top outcome's own percentage, unchanged). This is a *data-quality* score,
  // never a rebranded prediction probability — see analysisEngine.ts §H.
  dataConfidencePct: number;
  dataConfidenceLevel: 'none' | 'low' | 'medium' | 'high';
  signals: Signal[];
  keyFactors: KeyFactor[];
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

const RECENT_FORM_LIMIT = 5;
const RECENT_BSD_MATCH_LIMIT = 5;

async function getRecentFormRows(teamId: string): Promise<{ rows: FormRow[]; latestMatchDate: string | null }> {
  const { data, error } = await supabase
    .from('team_form')
    .select('result, goals_for, goals_against, match_date')
    .eq('team_id', teamId)
    .order('match_date', { ascending: false })
    .limit(RECENT_FORM_LIMIT);
  if (error) throw error;
  // team_form has no updated_at column — the most recent result's own match_date is the
  // honest freshness signal for a FORM/team_form-derived ATTACK/DEFENCE signal, not
  // "now" and not the prediction's unrelated computed_at.
  return { rows: (data ?? []) as FormRow[], latestMatchDate: data && data.length > 0 ? data[0].match_date : null };
}

/**
 * Resolves a team's recent BSD-derived per-match attack/defence/possession samples.
 * Reads only already-ingested tables (matches + match_stats_raw) — never calls BSD
 * itself (§16). Only matches where match_stats_raw actually has non-null values for
 * this team's side are meaningful; entries with all-null fields still come through
 * (analysisEngine's averaging filters null out per-field) rather than being silently
 * dropped here, so a genuinely mixed (some fields present, some not) row isn't lost.
 */
async function getBsdTeamMatchSamples(teamId: string): Promise<BsdTeamMatchSample[]> {
  const { data: recentMatches, error: matchError } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('sport', 'football')
    .eq('status', 'finished')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('kickoff_at', { ascending: false })
    .limit(RECENT_BSD_MATCH_LIMIT);
  if (matchError) throw matchError;
  if (!recentMatches || recentMatches.length === 0) return [];

  const { data: rawRows, error: rawError } = await supabase
    .from('match_stats_raw')
    .select('match_id, raw, updated_at')
    .in(
      'match_id',
      recentMatches.map((m) => m.id),
    );
  if (rawError) throw rawError;
  if (!rawRows || rawRows.length === 0) return [];

  const matchById = new Map(recentMatches.map((m) => [m.id, m]));

  const samples: BsdTeamMatchSample[] = [];
  for (const row of rawRows) {
    const match = matchById.get(row.match_id);
    if (!match) continue;
    const isHome = match.home_team_id === teamId;
    const raw = row.raw as { home?: Record<string, unknown>; away?: Record<string, unknown> } | null;
    const own = (isHome ? raw?.home : raw?.away) ?? {};
    const opp = (isHome ? raw?.away : raw?.home) ?? {};

    const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null);

    samples.push({
      xgFor: numOrNull(own.expected_goals),
      xgAgainst: numOrNull(opp.expected_goals),
      shotsFor: numOrNull(own.total_shots),
      shotsOnTargetFor: numOrNull(own.shots_on_target),
      possession: numOrNull(own.ball_possession),
      updatedAt: row.updated_at,
    });
  }
  return samples;
}

async function getAvailabilityRows(
  matchId: string,
  homeTeamId: string,
): Promise<{ hasData: boolean; rows: AvailabilityRow[]; timestamp: string | null }> {
  const { data: lineupRow } = await supabase.from('match_lineups').select('match_id, updated_at').eq('match_id', matchId).maybeSingle();
  if (!lineupRow) return { hasData: false, rows: [], timestamp: null };

  // bsd_player_id is a Phase 3 migration (sql/add_player_market_value.sql) that may not
  // be applied yet — try the enriched select first, fall back to the base columns that
  // have always existed so this never hard-fails on a pending migration.
  let data: { team_id: string; player_name: string; status: string; reason: string | null; bsd_player_id?: number | null }[] | null = null;
  const enriched = await supabase.from('player_availability').select('team_id, player_name, status, reason, bsd_player_id').eq('match_id', matchId);
  if (enriched.error) {
    const fallback = await supabase.from('player_availability').select('team_id, player_name, status, reason').eq('match_id', matchId);
    if (fallback.error) throw fallback.error;
    data = fallback.data;
  } else {
    data = enriched.data;
  }

  const playerIds = (data ?? []).map((r) => r.bsd_player_id).filter((id): id is number => typeof id === 'number');
  const marketValueById = new Map<number, number | null>();
  if (playerIds.length > 0) {
    const { data: players, error: playersError } = await supabase.from('bsd_players').select('id, market_value_eur').in('id', playerIds);
    // Same pending-migration tolerance as elsewhere — bsd_players may not exist yet.
    if (playersError && playersError.code !== 'PGRST205') throw playersError;
    for (const p of players ?? []) marketValueById.set(p.id, p.market_value_eur);
  }

  const rows: AvailabilityRow[] = (data ?? []).map((r) => ({
    team: r.team_id === homeTeamId ? 'home' : 'away',
    playerName: r.player_name,
    status: r.status,
    reason: r.reason,
    marketValueEur: typeof r.bsd_player_id === 'number' ? (marketValueById.get(r.bsd_player_id) ?? null) : null,
  }));
  // match_lineups' own updated_at — real freshness for the squad-depth signal, not
  // borrowed from the prediction's computed_at.
  return { hasData: true, rows, timestamp: lineupRow.updated_at };
}

async function getH2HAggregate(matchId: string): Promise<{ aggregate: H2HAggregate | null; timestamp: string | null }> {
  const { data, error } = await supabase
    .from('match_h2h')
    .select('total_matches, home_wins, draws, away_wins, updated_at')
    .eq('match_id', matchId)
    .maybeSingle();
  // match_h2h is a Phase 3 migration (sql/add_match_h2h.sql) that may not be applied
  // yet — same graceful-degrade rule as analysis_changes below: only PGRST205 (missing
  // relation) is swallowed, any other error still throws.
  if (error && error.code !== 'PGRST205') throw error;
  if (error || !data) return { aggregate: null, timestamp: null };
  return {
    aggregate: { totalMatches: data.total_matches, homeWins: data.home_wins, draws: data.draws, awayWins: data.away_wins },
    // match_h2h's own updated_at — real freshness for the H2H signal, not the
    // prediction's computed_at (H2H history barely changes between prediction runs).
    timestamp: data.updated_at,
  };
}

async function getAnalysisChanges(matchId: string): Promise<ChangeEvent[]> {
  const { data, error } = await supabase
    .from('analysis_changes')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(10);
  // PGRST205 = "relation not found" — analysis_changes is a Phase 2 migration
  // (sql/add_analysis_changes.sql) that may not be applied yet on a given environment.
  // Treated as "no squad/lineup changes recorded yet" (honestly true) rather than a hard
  // failure, so the rest of the analysis record still works before that migration runs.
  // Any other error still throws.
  if (error && error.code !== 'PGRST205') throw error;
  if (error) return [];

  return (data ?? []).map((c) => ({
    reason: c.change_type,
    fromHomeWinPct: 0, // not applicable to a squad/lineup change — see previousValue/newValue instead
    toHomeWinPct: 0,
    createdAt: c.created_at,
    category: c.category,
    previousValue: c.previous_value,
    newValue: c.new_value,
    source: c.source,
  }));
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

  const [
    { data: formRows, error: formError },
    predictionChangeRows,
    homeFormResult,
    awayFormResult,
    homeBsdSamples,
    awayBsdSamples,
    availability,
    analysisChangeRows,
    h2hResult,
  ] = await Promise.all([
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
      .limit(5)
      .then(({ data, error }) => {
        if (error) throw error;
        return data ?? [];
      }),
    getRecentFormRows(match.home_team_id),
    getRecentFormRows(match.away_team_id),
    getBsdTeamMatchSamples(match.home_team_id),
    getBsdTeamMatchSamples(match.away_team_id),
    getAvailabilityRows(match.id, match.home_team_id),
    getAnalysisChanges(match.id),
    getH2HAggregate(match.id),
  ]);
  if (formError) throw formError;

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

  // --- Analysis Intelligence Engine (Phase 2/3) -------------------------------------
  // Each signal category is stamped with ITS OWN underlying data's real freshness, never
  // a borrowed timestamp from an unrelated table (Phase 3 §8 audit finding — see
  // analysisEngine.ts's BsdTeamMatchSample/latestOf doc comments).
  const homeFormAgg = aggregateForm(homeFormResult.rows);
  const awayFormAgg = aggregateForm(awayFormResult.rows);
  const formTimestamp = latestOf([homeFormResult.latestMatchDate, awayFormResult.latestMatchDate]);

  const existingHomeAdvantageFactor = (pred.factors as MatchFactor[] | null)?.find(
    (f) => f.key === 'homeAdvantage' || f.key === 'homeCourtAdvantage',
  );

  const signals: Signal[] = [
    computeFormSignal(homeFormAgg, awayFormAgg, formTimestamp),
    ...computeAttackSignals(homeFormAgg, awayFormAgg, homeBsdSamples, awayBsdSamples, formTimestamp),
    ...computeDefenceSignals(homeFormAgg, awayFormAgg, homeBsdSamples, awayBsdSamples, formTimestamp),
    computePossessionSignal(homeBsdSamples, awayBsdSamples),
    // Reuses the exact fixed prior computePredictions.ts already stored for this match
    // (§5: "mevcut proje convention'larına uy") rather than hardcoding a new number.
    existingHomeAdvantageFactor
      ? computeHomeAdvantageSignal(existingHomeAdvantageFactor.home, existingHomeAdvantageFactor.away)
      : computeHomeAdvantageSignal(62, 38),
    computeH2HSignal(h2hResult.aggregate, h2hResult.timestamp),
  ];

  const squadDepth = computeSquadDepthSignal(availability.rows, availability.timestamp);
  const keyFactors = deriveKeyFactors(signals, squadDepth, homeName, awayName);
  const dataConfidence = computeOverallConfidence([...signals, squadDepth]);
  const playerImpact = availability.hasData ? derivePlayerImpact(availability.rows) : null;

  const changes: ChangeEvent[] = [
    ...(predictionChangeRows ?? []).map((c) => ({
      reason: c.reason,
      fromHomeWinPct: c.from_home_win_pct,
      toHomeWinPct: c.to_home_win_pct,
      createdAt: c.created_at,
    })),
    ...analysisChangeRows,
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    changes,
    playerImpact,
    dataConfidencePct: dataConfidence.pct,
    dataConfidenceLevel: dataConfidence.level,
    signals,
    keyFactors,
  };

  return { covered: true, record };
}
