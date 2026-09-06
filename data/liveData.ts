import { supabase } from '@/lib/supabase';
import type { AnalysisChangeEvent, ChangeEvent, H2HRecord, LineupPlayer, Match, MatchFactor, MatchLineups, PlayerImpactEntry, Sport, Team, TrackRecordEntry } from './mockData';

// Mirrors backend/src/analysisEngine.ts's derivePlayerImpact rule exactly (see that
// function's own doc comment) — a real, already-established display-classification rule,
// not a new or duplicated prediction computation. Only raised above 'medium' when a real,
// provider-sourced market value clears this same floor; otherwise stays capped, exactly
// as that function already does server-side for Vera.
const CERTAIN_ABSENCE_STATUSES = new Set(['injured', 'suspended']);
const HIGH_IMPACT_MARKET_VALUE_EUR = 20_000_000;

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

    const [{ data: teamRows }, { data: predictionRows }, { data: formRows }] = await Promise.all([
      supabase.from('teams').select('id, name, short_code, sport').in('id', teamIds),
      supabase.from('predictions').select('*').in('match_id', matchIds),
      supabase
        .from('team_form')
        .select('team_id, match_date, result')
        .in('team_id', teamIds)
        .order('match_date', { ascending: false }),
    ]);

    if (!teamRows || teamRows.length === 0 || !predictionRows || predictionRows.length === 0) return null;

    const formByTeam: Record<string, ('W' | 'D' | 'L')[]> = {};
    for (const row of formRows ?? []) {
      const arr = formByTeam[row.team_id] ?? (formByTeam[row.team_id] = []);
      if (arr.length < 5) arr.push(row.result as 'W' | 'D' | 'L');
    }
    Object.values(formByTeam).forEach((arr) => arr.reverse());

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

    const squadImpactByMatch: Record<string, PlayerImpactEntry[]> = {};
    for (const row of availabilityRows ?? []) {
      const match = matchRows.find((m) => m.id === row.match_id);
      if (!match) continue;
      const team: 'home' | 'away' | null = row.team_id === match.home_team_id ? 'home' : row.team_id === match.away_team_id ? 'away' : null;
      if (!team) continue;
      const certain = CERTAIN_ABSENCE_STATUSES.has(row.status);
      const marketValue = row.bsd_player_id != null ? marketValueByBsdPlayerId[row.bsd_player_id] : null;
      const isKeyByMarketValue = certain && (marketValue ?? 0) >= HIGH_IMPACT_MARKET_VALUE_EUR;
      const entry: PlayerImpactEntry = {
        team,
        playerName: row.player_name,
        status: row.status,
        reason: row.reason,
        impact: isKeyByMarketValue ? 'high' : certain ? 'medium' : 'low',
      };
      (squadImpactByMatch[row.match_id] ??= []).push(entry);
    }

    const lineupsByMatch: Record<string, MatchLineups> = {};
    for (const row of lineupRows ?? []) {
      const toPlayers = (raw: unknown): LineupPlayer[] | null =>
        Array.isArray(raw) ? raw.map((p: any) => ({ name: p.name, position: p.position ?? null })) : null;
      lineupsByMatch[row.match_id] = {
        status: row.lineup_status,
        home: toPlayers(row.home_players),
        away: toPlayers(row.away_players),
      };
    }

    for (const match of matches) {
      const h2h = h2hByMatch[match.id];
      if (h2h) match.h2h = h2h;
      const squadImpact = squadImpactByMatch[match.id];
      if (squadImpact && squadImpact.length > 0) match.squadImpact = squadImpact;
      const lineups = lineupsByMatch[match.id];
      if (lineups) match.lineups = lineups;
    }

    const analysisChanges: AnalysisChangeEvent[] = (analysisChangeRows ?? []).map((c) => ({
      id: String(c.id),
      matchId: String(c.match_id),
      timestamp: new Date(c.created_at).toLocaleString(),
      changeType: c.change_type,
      previousValue: c.previous_value,
      newValue: c.new_value,
    }));

    const trackRecord = await fetchTrackRecord();

    return { teams, matches, changeEvents, analysisChanges, trackRecord };
  } catch {
    return null;
  }
}
