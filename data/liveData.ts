import { supabase } from '@/lib/supabase';
import type { AnalysisChangeEvent, ChangeEvent, H2HRecord, LineupPlayer, Match, MatchFactor, MatchLineups, PlayerImpactEntry, Sport, Team, TrackRecordEntry } from './mockData';

// Mirrors backend/src/analysisEngine.ts's derivePlayerImpact rule exactly (see that
// function's own doc comment) — a real, already-established display-classification rule,
// not a new or duplicated prediction computation. Only raised above 'medium' when a real,
// provider-sourced market value clears this same floor; otherwise stays capped, exactly
// as that function already does server-side for Vera.
const CERTAIN_ABSENCE_STATUSES = new Set(['injured', 'suspended']);
const HIGH_IMPACT_MARKET_VALUE_EUR = 20_000_000;

/** Shared by fetchLiveData's match-scoped squad-impact build and getLatestSquadSnapshot's
 * team-scoped resolver below — one real classification rule, not two. */
function classifyAvailabilityImpact(
  status: string,
  bsdPlayerId: number | null,
  marketValueByBsdPlayerId: Record<number, number | null>,
): 'low' | 'medium' | 'high' {
  const certain = CERTAIN_ABSENCE_STATUSES.has(status);
  const marketValue = bsdPlayerId != null ? marketValueByBsdPlayerId[bsdPlayerId] : null;
  const isKeyByMarketValue = certain && (marketValue ?? 0) >= HIGH_IMPACT_MARKET_VALUE_EUR;
  return isKeyByMarketValue ? 'high' : certain ? 'medium' : 'low';
}

const PALETTE = [
  { bg: '#f2e2e2', fg: '#7d3535' },
  { bg: '#dbe6f2', fg: '#2f4f72' },
  { bg: '#f3e8da', fg: '#7d5320' },
  { bg: '#e5e3f4', fg: '#4b4180' },
  { bg: '#e0e9f5', fg: '#2b4a75' },
  { bg: '#e6efe8', fg: '#2f6340' },
  { bg: '#e3ecec', fg: '#2c5a5a' },
  { bg: '#f0dfe6', fg: '#7a3050' },
  { bg: '#f3e6dd', fg: '#82492a' },
  { bg: '#e0eaf0', fg: '#265a72' },
];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const dayDiff = Math.round((new Date(d.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / 86400000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${time}`;
}

const REASON_TO_KEY: Record<string, string> = {
  weather_update: 'weatherUpdated',
  lineup_confirmed: 'lineupUpdated',
  injury_update: 'goalkeeperRuledOut',
  recent_results_updated: 'recentResultsUpdated',
};

export type LiveDataBundle = {
  teams: Record<string, Team>;
  matches: Match[];
  changeEvents: ChangeEvent[];
  analysisChanges: AnalysisChangeEvent[];
  trackRecord: TrackRecordEntry[];
};

/** Which side the model's pre-match percentages favoured — same rule as
 * favouredOutcome(), applied to raw prediction fields instead of a Match. */
function favouredSide(homePct: number, drawPct: number, awayPct: number): 'home' | 'draw' | 'away' {
  if (homePct >= drawPct && homePct >= awayPct) return 'home';
  if (awayPct >= drawPct && awayPct >= homePct) return 'away';
  return 'draw';
}

/** Real finished matches where the model's stored pre-match prediction (the
 * last one computed while the match was still 'scheduled' — predictions stop
 * being recomputed once a match finishes) correctly called the actual result.
 * Never fabricated: a match only appears here if it has both a real score and
 * a real stored prediction, and the two genuinely agree. */
async function fetchTrackRecord(): Promise<TrackRecordEntry[]> {
  if (!supabase) return [];
  const { data: finishedRows } = await supabase
    .from('matches')
    .select('id, competition, sport, home_team_id, away_team_id, kickoff_at, home_score, away_score')
    .eq('status', 'finished')
    .eq('sport', 'football')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
    .order('kickoff_at', { ascending: false })
    .limit(20);
  if (!finishedRows || finishedRows.length === 0) return [];

  const matchIds = finishedRows.map((m) => m.id);
  const teamIds = Array.from(new Set(finishedRows.flatMap((m) => [m.home_team_id, m.away_team_id])));

  const [{ data: predictionRows }, { data: teamRows }] = await Promise.all([
    supabase.from('predictions').select('match_id, home_win_pct, draw_pct, away_win_pct').in('match_id', matchIds),
    supabase.from('teams').select('id, name').in('id', teamIds),
  ]);
  if (!predictionRows || !teamRows) return [];

  const predictionByMatch: Record<string, { home_win_pct: number; draw_pct: number; away_win_pct: number }> = {};
  for (const p of predictionRows) predictionByMatch[p.match_id] = p;
  const nameByTeam: Record<string, string> = {};
  for (const t of teamRows) nameByTeam[t.id] = t.name;

  const hits: TrackRecordEntry[] = [];
  for (const m of finishedRows) {
    const pred = predictionByMatch[m.id];
    const homeName = nameByTeam[m.home_team_id];
    const awayName = nameByTeam[m.away_team_id];
    if (!pred || !homeName || !awayName || m.home_score == null || m.away_score == null) continue;

    const predicted = favouredSide(pred.home_win_pct, pred.draw_pct, pred.away_win_pct);
    const actual = m.home_score > m.away_score ? 'home' : m.away_score > m.home_score ? 'away' : 'draw';
    if (predicted !== actual) continue;

    hits.push({
      id: m.id,
      home: homeName,
      away: awayName,
      competition: m.competition,
      homeScore: m.home_score,
      awayScore: m.away_score,
      predictedTeam: predicted === 'home' ? homeName : predicted === 'away' ? awayName : null,
      predictedPct: predicted === 'home' ? pred.home_win_pct : predicted === 'away' ? pred.away_win_pct : pred.draw_pct,
    });
  }
  return hits.slice(0, 3);
}

/** Fetches real data via the anon (read-only) Supabase client and reshapes it into the
 * app's existing Team/Match/ChangeEvent types, so screens don't need to know
 * whether they're looking at live or mock data. Returns null on any failure or when
 * there's simply no usable data yet (e.g. RLS not enabled, pipeline hasn't run), so
 * callers can fall back to mock data instead of showing a broken screen. */
export async function fetchLiveData(): Promise<LiveDataBundle | null> {
  if (!supabase) return null;
  const client = supabase;
  try {
    const windowStart = new Date(Date.now() - 3 * 3600 * 1000).toISOString();

    // Fetched PER SPORT rather than one combined query: a single shared `.limit(30)`
    // ordered by kickoff time silently starved basketball out entirely whenever football
    // alone had 30+ upcoming fixtures in the window (confirmed live: 214 football rows vs
    // 427 basketball rows, and every one of the first 30 chronologically was football —
    // so `matches` never contained a single basketball row, regardless of how much real
    // basketball data existed). Two scoped queries give each sport its own curation
    // budget, so neither can push the other out.
    const MATCHES_PER_SPORT_LIMIT = 30;
    const matchSelect = 'id, competition, sport, home_team_id, away_team_id, kickoff_at, status';
    const [{ data: footballRows, error: footballErr }, { data: basketballRows, error: basketballErr }] = await Promise.all([
      supabase
        .from('matches')
        .select(matchSelect)
        .eq('sport', 'football')
        .gte('kickoff_at', windowStart)
        .order('kickoff_at', { ascending: true })
        .limit(MATCHES_PER_SPORT_LIMIT),
      supabase
        .from('matches')
        .select(matchSelect)
        .eq('sport', 'basketball')
        .gte('kickoff_at', windowStart)
        .order('kickoff_at', { ascending: true })
        .limit(MATCHES_PER_SPORT_LIMIT),
    ]);
    if (footballErr || basketballErr) return null;
    const matchRows = [...(footballRows ?? []), ...(basketballRows ?? [])];
    if (matchRows.length === 0) return null;

    const matchIds = matchRows.map((m) => m.id);
    const teamIds = Array.from(new Set(matchRows.flatMap((m) => [m.home_team_id, m.away_team_id])));

    // Fetched via full pagination (not one bulk `.in('team_id', teamIds)` query, and not
    // one request per team either) because Postgrest caps any single request at 1000 rows:
    // a single global-order-by-date query silently drops older rows for whichever teams
    // happen to sort past that cutoff — confirmed live (Union Berlin's 10th-most-recent
    // match fell just past the cutoff, truncating its trend window to 9 rows and flipping
    // a real defensive improvement to "neutral"). A first fix used one `.limit(10)` request
    // per team, which is correct but doesn't scale: 90 teams meant 90 requests and ~3.3s
    // just for this fetch. team_form is a bounded "recent form" table (measured ~2-75 rows
    // per team, ~2750 total for a typical 90-team window) — walking it to completion with
    // `.range()` takes only a handful of 1000-row pages regardless of team count, and since
    // every row for the requested teams is fetched (never just a same-sized-or-smaller
    // prefix), grouping and slicing to the most recent 10 per team afterwards is exactly as
    // correct as the guaranteed-safe one-request-per-team version, at a fraction of the
    // request count (measured: 3 requests / ~1.9s vs 90 requests / ~3.3s for the same data,
    // verified against direct per-team fetches for every team including the one with the
    // most history). Scales with total row volume, not team count.
    const fetchAllTeamForm = async (ids: string[]) => {
      const PAGE_SIZE = 1000;
      const rows: { team_id: string; match_date: string; result: string; goals_for: number; goals_against: number }[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await client
          .from('team_form')
          .select('team_id, match_date, result, goals_for, goals_against')
          .in('team_id', ids)
          .order('match_date', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error || !data) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
      }
      return rows;
    };

    const [{ data: teamRows }, { data: predictionRows }, teamFormRows] = await Promise.all([
      supabase.from('teams').select('id, name, short_code, sport').in('id', teamIds),
      supabase.from('predictions').select('*').in('match_id', matchIds),
      fetchAllTeamForm(teamIds),
    ]);

    if (!teamRows || teamRows.length === 0 || !predictionRows || predictionRows.length === 0) return null;

    // Up to 10 real recent matches per team: the first 5 back `Team.form` (unchanged
    // behaviour/shape), all up to 10 back AI Insights' team-level attack/defence trend
    // (recent-5 vs previous-5 real goals averages).
    const rowsByTeam: Record<string, typeof teamFormRows> = {};
    for (const row of teamFormRows) (rowsByTeam[row.team_id] ??= []).push(row);
    for (const rows of Object.values(rowsByTeam)) rows.sort((a, b) => b.match_date.localeCompare(a.match_date));

    const formByTeam: Record<string, ('W' | 'D' | 'L')[]> = {};
    const formHistoryByTeam: Record<string, { goalsFor: number; goalsAgainst: number }[]> = {};
    teamIds.forEach((id) => {
      const rows = (rowsByTeam[id] ?? []).slice(0, 10);
      formByTeam[id] = rows.slice(0, 5).map((r) => r.result as 'W' | 'D' | 'L').reverse();
      formHistoryByTeam[id] = rows.map((r) => ({ goalsFor: r.goals_for, goalsAgainst: r.goals_against }));
    });

    // Simple, deterministic before/after comparison over real historical goals —
    // mirrors the same "small documented threshold, no ML/LLM" methodology already used
    // for player-impact classification. Requires at least 3 real matches in BOTH the
    // recent and prior window; a team with less history than that gets no trend rather
    // than a guess from a too-small sample (rows are already ordered most-recent-first,
    // so index 0-4 is "recent" and 5-9 is "prior").
    const TREND_THRESHOLD = 0.4;
    function goalsTrend(history: { goalsFor: number; goalsAgainst: number }[], key: 'goalsFor' | 'goalsAgainst'): 'up' | 'down' | 'neutral' | undefined {
      const recent = history.slice(0, 5);
      const prior = history.slice(5, 10);
      if (recent.length < 3 || prior.length < 3) return undefined;
      const avg = (rows: typeof history) => rows.reduce((sum, r) => sum + r[key], 0) / rows.length;
      const delta = avg(recent) - avg(prior);
      if (Math.abs(delta) < TREND_THRESHOLD) return 'neutral';
      return delta > 0 ? 'up' : 'down';
    }
    const attackTrendByTeam: Record<string, 'up' | 'down' | 'neutral' | undefined> = {};
    const defenceTrendByTeam: Record<string, 'up' | 'down' | 'neutral' | undefined> = {};
    for (const teamId of Object.keys(formHistoryByTeam)) {
      const history = formHistoryByTeam[teamId];
      attackTrendByTeam[teamId] = goalsTrend(history, 'goalsFor');
      // Lower goals-against is the improvement direction for defence — flip the raw delta.
      const rawDefence = goalsTrend(history, 'goalsAgainst');
      defenceTrendByTeam[teamId] = rawDefence === 'up' ? 'down' : rawDefence === 'down' ? 'up' : rawDefence;
    }

    const teams: Record<string, Team> = {};
    for (const row of teamRows) {
      const palette = colorFor(row.id);
      teams[row.id] = {
        id: row.id,
        name: row.name,
        code: (row.short_code || row.name.slice(0, 3)).toUpperCase().slice(0, 3),
        bg: palette.bg,
        fg: palette.fg,
        form: formByTeam[row.id] ?? [],
        attackTrend: attackTrendByTeam[row.id],
        defenceTrend: defenceTrendByTeam[row.id],
        sport: (row.sport as Sport) ?? 'football',
      };
    }

    const predictionByMatch: Record<string, any> = {};
    for (const p of predictionRows) predictionByMatch[p.match_id] = p;

    const matches: Match[] = [];
    for (const m of matchRows) {
      const home = teams[m.home_team_id];
      const away = teams[m.away_team_id];
      const pred = predictionByMatch[m.id];
      if (!home || !away || !pred) continue;
      matches.push({
        id: m.id,
        home,
        away,
        kickoff: formatKickoff(m.kickoff_at),
        kickoffAt: m.kickoff_at,
        competition: m.competition,
        sport: (m.sport as Sport) ?? 'football',
        outcomes: { home: pred.home_win_pct, draw: pred.draw_pct, away: pred.away_win_pct },
        xgHome: Number(pred.xg_home),
        xgAway: Number(pred.xg_away),
        recentAvgGoalsHome: Number(pred.recent_avg_goals_home),
        recentAvgGoalsAway: Number(pred.recent_avg_goals_away),
        factors: (pred.factors as MatchFactor[]) ?? [],
      });
    }
    if (matches.length === 0) return null;

    const { data: changeRows } = await supabase
      .from('prediction_changes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    const changeEvents: ChangeEvent[] = (changeRows ?? []).map((c) => ({
      id: String(c.id),
      matchId: String(c.match_id),
      timestamp: new Date(c.created_at).toLocaleString(),
      key: REASON_TO_KEY[c.reason] ?? 'recentResultsUpdated',
      from: c.from_home_win_pct,
      to: c.to_home_win_pct,
      tone: c.to_home_win_pct >= c.from_home_win_pct ? 'success' : 'warning',
    }));

    // AI Insights' per-team analysis (H2H, squad impact, richer "what changed") needs
    // real Supabase tables no screen has read before — all public-read (see
    // backend/sql/rls_read_only_match_h2h.sql / rls_read_only_bsd_enrichment.sql), so
    // reachable the same way everything else here is: no new provider/service call, just
    // extending this one existing fetch. Every one of these is best-effort: a missing row
    // for a given match means that match's H2H/squad-impact section is simply omitted by
    // the screen, never fabricated.
    const [{ data: h2hRows }, { data: availabilityRows }, { data: analysisChangeRows }, { data: lineupRows }] = await Promise.all([
      supabase.from('match_h2h').select('*').in('match_id', matchIds),
      supabase.from('player_availability').select('match_id, team_id, player_name, status, reason, bsd_player_id').in('match_id', matchIds),
      supabase.from('analysis_changes').select('*').in('match_id', matchIds).order('created_at', { ascending: false }),
      supabase.from('match_lineups').select('match_id, lineup_status, home_players, away_players').in('match_id', matchIds),
    ]);

    const h2hByMatch: Record<string, H2HRecord> = {};
    for (const row of h2hRows ?? []) {
      h2hByMatch[row.match_id] = {
        totalMatches: row.total_matches,
        homeWins: row.home_wins,
        draws: row.draws,
        awayWins: row.away_wins,
        homeGoals: row.home_goals,
        awayGoals: row.away_goals,
        avgTotalGoals: Number(row.avg_total_goals),
        homeWinRate: Number(row.home_win_rate),
        awayWinRate: Number(row.away_win_rate),
      };
    }

    const bsdPlayerIds = Array.from(new Set((availabilityRows ?? []).map((r) => r.bsd_player_id).filter((id): id is number => id != null)));
    const marketValueByBsdPlayerId: Record<number, number | null> = {};
    if (bsdPlayerIds.length > 0) {
      const { data: bsdPlayerRows } = await supabase.from('bsd_players').select('id, market_value_eur').in('id', bsdPlayerIds);
      for (const row of bsdPlayerRows ?? []) marketValueByBsdPlayerId[row.id] = row.market_value_eur;
    }

    // `analysis_changes` rows carry no team_id (see AnalysisChangeEvent's own doc comment),
    // so a player-named event can't be attributed to a side directly. Resolved instead by
    // matching that same real player name against this match's own team-attributed rosters
    // — the union of who's in player_availability (team_id-backed) and match_lineups'
    // home/away arrays — built once here and reused below.
    const playerTeamByMatch: Record<string, Record<string, 'home' | 'away'>> = {};
    const registerPlayer = (matchId: string, name: string, team: 'home' | 'away') => {
      (playerTeamByMatch[matchId] ??= {})[name] = team;
    };

    const squadImpactByMatch: Record<string, PlayerImpactEntry[]> = {};
    for (const row of availabilityRows ?? []) {
      const match = matchRows.find((m) => m.id === row.match_id);
      if (!match) continue;
      const team: 'home' | 'away' | null = row.team_id === match.home_team_id ? 'home' : row.team_id === match.away_team_id ? 'away' : null;
      if (!team) continue;
      registerPlayer(row.match_id, row.player_name, team);
      const entry: PlayerImpactEntry = {
        team,
        playerName: row.player_name,
        status: row.status,
        reason: row.reason,
        impact: classifyAvailabilityImpact(row.status, row.bsd_player_id, marketValueByBsdPlayerId),
      };
      (squadImpactByMatch[row.match_id] ??= []).push(entry);
    }

    const lineupsByMatch: Record<string, MatchLineups> = {};
    for (const row of lineupRows ?? []) {
      const toPlayers = (raw: unknown): LineupPlayer[] | null =>
        Array.isArray(raw) ? raw.map((p: any) => ({ name: p.name, position: p.position ?? null })) : null;
      const home = toPlayers(row.home_players);
      const away = toPlayers(row.away_players);
      home?.forEach((p) => registerPlayer(row.match_id, p.name, 'home'));
      away?.forEach((p) => registerPlayer(row.match_id, p.name, 'away'));
      lineupsByMatch[row.match_id] = { status: row.lineup_status, home, away };
    }

    for (const match of matches) {
      const h2h = h2hByMatch[match.id];
      if (h2h) match.h2h = h2h;
      const squadImpact = squadImpactByMatch[match.id];
      if (squadImpact && squadImpact.length > 0) match.squadImpact = squadImpact;
      const lineups = lineupsByMatch[match.id];
      if (lineups) match.lineups = lineups;
    }

    const PLAYER_CHANGE_TYPES = new Set(['player_unavailable', 'player_available_again']);
    const analysisChanges: AnalysisChangeEvent[] = (analysisChangeRows ?? []).map((c) => ({
      id: String(c.id),
      matchId: String(c.match_id),
      timestamp: new Date(c.created_at).toLocaleString(),
      changeType: c.change_type,
      previousValue: c.previous_value,
      newValue: c.new_value,
      team: PLAYER_CHANGE_TYPES.has(c.change_type) ? playerTeamByMatch[c.match_id]?.[c.new_value] : undefined,
    }));

    const trackRecord = await fetchTrackRecord();

    return { teams, matches, changeEvents, analysisChanges, trackRecord };
  } catch {
    return null;
  }
}

export type SquadSnapshot = {
  unavailable: PlayerImpactEntry[];
  lineup: LineupPlayer[] | null;
  /** Which real match this snapshot came from — never the screen's "Next Match", which
   * is purely contextual now. Not currently displayed, kept for debugging/traceability. */
  sourceMatchId: string | null;
};

const EMPTY_SQUAD_SNAPSHOT: SquadSnapshot = { unavailable: [], lineup: null, sourceMatchId: null };

/** AI Insights is team-first: Squad Status and Player Status & Form must reflect the
 * selected team's own latest real availability/lineup data, never whichever fixture
 * happens to be shown as "Next Match" — confirmed live that FC Barcelona's
 * chronologically-nearest upcoming match has zero player_availability rows while a later
 * Barcelona fixture already has real data, which made the whole section vanish for a team
 * that genuinely does have real data. Searches the team's own real matches (via existing
 * tables only, no new APIs) in this exact priority, never fabricating a result:
 *   1. nearest upcoming fixture with real availability data
 *   2. most recent past fixture with real availability data
 *   3. a lineup-only snapshot (real tracked players, no availability claim either way)
 *      from whichever of the above windows has one
 *   4. the empty snapshot, only when truly nothing exists anywhere
 * Called on-demand per selected team (normal AI Insights and contextual Team Insights
 * both use it) rather than precomputed for every team in fetchLiveData — this data is
 * only ever needed for the one team currently being viewed. */
export async function getLatestSquadSnapshot(teamId: string): Promise<SquadSnapshot> {
  if (!supabase) return EMPTY_SQUAD_SNAPSHOT;
  const client = supabase;
  const nowIso = new Date().toISOString();
  const teamFilter = `home_team_id.eq.${teamId},away_team_id.eq.${teamId}`;

  const [{ data: upcoming }, { data: past }] = await Promise.all([
    client
      .from('matches')
      .select('id, home_team_id, away_team_id')
      .or(teamFilter)
      .gte('kickoff_at', nowIso)
      .order('kickoff_at', { ascending: true })
      .limit(10),
    client
      .from('matches')
      .select('id, home_team_id, away_team_id')
      .or(teamFilter)
      .lt('kickoff_at', nowIso)
      .order('kickoff_at', { ascending: false })
      .limit(10),
  ]);

  // Nearest-upcoming-first, then most-recent-past — this exact order is also the search
  // priority for both availability and (if no availability is found anywhere) lineups.
  const candidates = [...(upcoming ?? []), ...(past ?? [])];
  if (candidates.length === 0) return EMPTY_SQUAD_SNAPSHOT;
  const matchIds = candidates.map((m) => m.id);

  const [{ data: availRows }, { data: lineupRows }] = await Promise.all([
    client
      .from('player_availability')
      .select('match_id, player_name, status, reason, bsd_player_id')
      .in('match_id', matchIds)
      .eq('team_id', teamId),
    client.from('match_lineups').select('match_id, home_players, away_players').in('match_id', matchIds),
  ]);

  const bsdPlayerIds = Array.from(new Set((availRows ?? []).map((r) => r.bsd_player_id).filter((id): id is number => id != null)));
  const marketValueByBsdPlayerId: Record<number, number | null> = {};
  if (bsdPlayerIds.length > 0) {
    const { data: bsdPlayerRows } = await client.from('bsd_players').select('id, market_value_eur').in('id', bsdPlayerIds);
    for (const row of bsdPlayerRows ?? []) marketValueByBsdPlayerId[row.id] = row.market_value_eur;
  }

  const lineupFor = (matchId: string, homeTeamId: string): LineupPlayer[] | null => {
    const row = lineupRows?.find((r) => r.match_id === matchId);
    if (!row) return null;
    const raw = homeTeamId === teamId ? row.home_players : row.away_players;
    return Array.isArray(raw) ? raw.map((p: any) => ({ name: p.name, position: p.position ?? null })) : null;
  };

  // Priority 1 & 2: real availability data, searched in nearest-upcoming-then-most-
  // recent-past order.
  for (const m of candidates) {
    const rowsForMatch = (availRows ?? []).filter((r) => r.match_id === m.id);
    if (rowsForMatch.length > 0) {
      return {
        unavailable: rowsForMatch.map((row) => ({
          // `team` is meaningless here — this snapshot is already team-scoped by the
          // `eq('team_id', teamId)` filter above, unlike the match-scoped entries
          // fetchLiveData builds for Match Analysis. Fixed to 'home' as an unused
          // placeholder; PlayerImpactRow never reads it.
          team: 'home',
          playerName: row.player_name,
          status: row.status,
          reason: row.reason,
          impact: classifyAvailabilityImpact(row.status, row.bsd_player_id, marketValueByBsdPlayerId),
        })),
        lineup: lineupFor(m.id, m.home_team_id),
        sourceMatchId: m.id,
      };
    }
  }

  // Priority 3: no availability rows anywhere in either window — fall back to a real
  // lineup-only snapshot if one exists, same search order.
  for (const m of candidates) {
    const lineup = lineupFor(m.id, m.home_team_id);
    if (lineup && lineup.length > 0) {
      return { unavailable: [], lineup, sourceMatchId: m.id };
    }
  }

  // Priority 4: genuinely nothing anywhere.
  return EMPTY_SQUAD_SNAPSHOT;
}
