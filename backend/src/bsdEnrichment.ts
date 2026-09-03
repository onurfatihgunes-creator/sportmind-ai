import { BSD_TIER1_LEAGUES } from './config.js';
import {
  getCurrentSeason,
  getEventH2H,
  getEventLineups,
  getEventPlayerStats,
  getEventStats,
  getEvents,
  getLeagues,
  getPlayer,
  type BsdEvent,
} from './bsdFootball.js';
import { normalizeTeamName } from './teamIdentity.js';
import { supabase } from './supabaseClient.js';
import { detectAvailabilityDelta, detectLineupStatusChange, type DetectedChange } from './analysisEngine.js';

/**
 * BSD enrichment — attaches lineups/player-availability/player-stats/raw team
 * stats to matches SportMind's existing fixture providers already created.
 * Never creates a `matches` row: a BSD event that can't be confidently
 * matched to an existing SportMind match is skipped, not written.
 *
 * Match confidence (SPECIALIST-independent of anything Vera-side — this is
 * ingestion, not the onurai_sportmind package): a BSD event is only enriched
 * onto a SportMind match when the competition matches, the kickoff date
 * matches (±1 day, to absorb timezone/TBC-time drift), AND BOTH team names
 * normalize-match (reusing teamIdentity.ts's normalizeTeamName — the same
 * function that already resolves cross-provider team identity for fixtures).
 * Matching only one side is not enough confidence to persist anything.
 */

const ENRICHMENT_WINDOW_PAST_DAYS = 3;
const ENRICHMENT_WINDOW_FUTURE_DAYS = 7;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string) {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / 86_400_000;
}

type CandidateMatch = {
  id: string;
  competition: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  homeName: string;
  awayName: string;
};

async function getCandidateMatches(competitionNames: string[], windowStart: Date, windowEnd: Date): Promise<CandidateMatch[]> {
  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('id, competition, home_team_id, away_team_id, kickoff_at')
    .in('competition', competitionNames)
    .eq('sport', 'football')
    .gte('kickoff_at', windowStart.toISOString())
    .lte('kickoff_at', windowEnd.toISOString());
  if (matchErr) throw matchErr;
  if (!matches || matches.length === 0) return [];

  const teamIds = Array.from(new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id])));
  const { data: teams, error: teamErr } = await supabase.from('teams').select('id, name').in('id', teamIds);
  if (teamErr) throw teamErr;
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  return matches
    .filter((m) => nameById.has(m.home_team_id) && nameById.has(m.away_team_id))
    .map((m) => ({
      ...m,
      homeName: nameById.get(m.home_team_id)!,
      awayName: nameById.get(m.away_team_id)!,
    }));
}

function findConfidentMatch(event: BsdEvent, candidates: CandidateMatch[]): CandidateMatch | null {
  const eventHome = normalizeTeamName(event.home_team);
  const eventAway = normalizeTeamName(event.away_team);

  return (
    candidates.find((c) => {
      if (daysBetween(event.event_date, c.kickoff_at) > 1) return false;
      return normalizeTeamName(c.homeName) === eventHome && normalizeTeamName(c.awayName) === eventAway;
    }) ?? null
  );
}

async function persistPlayerStats(match: CandidateMatch, event: BsdEvent) {
  let stats;
  try {
    stats = await getEventPlayerStats(event.id);
  } catch {
    // Not every match has player stats yet (not played, or BSD hasn't indexed it) —
    // this is expected for scheduled matches, not a failure to surface.
    return;
  }
  if (stats.length === 0) return;

  // BSD's player-stats rows carry no player name (confirmed live — see
  // BsdPlayerStat's own doc comment), only a numeric player_id. Storing that
  // id as text in `player_name` rather than resolving a real name (which
  // would need a separate /players/{id}/ call per player, not made here) —
  // the value is a BSD id, never a fabricated name. team_name IS derivable
  // for free: BSD's own event.home_team_id/away_team_id tell us which side
  // s.team_id is, and match.homeName/awayName are the real SportMind names.
  const rows = stats.map((s) => ({
    match_id: match.id,
    player_name: String(s.player_id),
    team_name: s.team_id === event.home_team_id ? match.homeName : s.team_id === event.away_team_id ? match.awayName : null,
    minutes_played: s.minutes_played,
    rating: s.rating,
    goals: s.goals,
    assists: s.goal_assist,
    expected_goals: s.expected_goals,
    expected_assists: s.expected_assists,
    total_shots: s.total_shots,
    shots_on_target: s.shots_on_target,
    bsd_event_id: event.id,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('match_player_stats').upsert(rows, { onConflict: 'match_id,player_name' });
  if (error) throw error;
}

async function persistRawStats(matchId: string, event: BsdEvent) {
  let raw: Record<string, unknown>;
  try {
    raw = await getEventStats(event.id);
  } catch {
    return;
  }
  if (!raw || Object.keys(raw).length === 0) return;

  const { error } = await supabase.from('match_stats_raw').upsert({
    match_id: matchId,
    bsd_event_id: event.id,
    raw,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// H2H history between two specific teams barely moves between two enrichment runs 6
// hours apart — unlike lineups/availability, which genuinely change daily. Refetching
// it every run for every match would be a real, avoidable BSD API call per §4/§12's
// explicit "gereksiz API çağrısı oluşturma" — so a row already written within this
// window is left alone rather than refetched.
const H2H_REFRESH_INTERVAL_DAYS = 7;

async function persistH2H(matchId: string, event: BsdEvent) {
  const { data: existing } = await supabase.from('match_h2h').select('updated_at').eq('match_id', matchId).maybeSingle();
  if (existing) {
    const ageDays = (Date.now() - new Date(existing.updated_at).getTime()) / 86_400_000;
    if (ageDays < H2H_REFRESH_INTERVAL_DAYS) return;
  }

  let h2h;
  try {
    h2h = await getEventH2H(event.id);
  } catch {
    return;
  }
  // total_matches: 0 is BSD's own "no indexed history" — nothing meaningful to store,
  // and re-checking every run would be pointless the same way a stale row would be, so
  // this still counts as "handled" even though nothing is written.
  if (!h2h || h2h.total_matches === 0) return;

  const { error } = await supabase.from('match_h2h').upsert({
    match_id: matchId,
    total_matches: h2h.total_matches,
    home_wins: h2h.home_wins,
    draws: h2h.draws,
    away_wins: h2h.away_wins,
    home_goals: h2h.home_goals,
    away_goals: h2h.away_goals,
    avg_total_goals: h2h.avg_total_goals,
    home_win_rate: h2h.home_win_rate,
    away_win_rate: h2h.away_win_rate,
    recent_matches: h2h.recent_matches,
    bsd_event_id: event.id,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// A player's market value changes slowly (transfer windows, not day to day) — same
// staleness reasoning as H2H, just a longer window since it moves even less.
const PLAYER_CACHE_REFRESH_INTERVAL_DAYS = 30;

/**
 * Cache-first resolution of a player's name/market value (§5: "caching kullan... N+1
 * request oluşturma"). Only called for players actually flagged unavailable in a real
 * match this run (bounded, small) — never a bulk/league-wide backfill. A cached row
 * younger than the refresh window is reused with zero API call.
 */
async function resolvePlayerMarketValue(playerId: number): Promise<void> {
  const { data: cached } = await supabase.from('bsd_players').select('updated_at').eq('id', playerId).maybeSingle();
  if (cached) {
    const ageDays = (Date.now() - new Date(cached.updated_at).getTime()) / 86_400_000;
    if (ageDays < PLAYER_CACHE_REFRESH_INTERVAL_DAYS) return;
  }

  let player;
  try {
    player = await getPlayer(playerId);
  } catch {
    return;
  }

  const { error } = await supabase.from('bsd_players').upsert({
    id: player.id,
    name: player.name,
    position: player.position,
    current_team_id: player.current_team_id,
    market_value_eur: player.market_value_eur,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function persistDetectedChanges(matchId: string, changes: DetectedChange[], source: string) {
  if (changes.length === 0) return;
  const rows = changes.map((c) => ({
    match_id: matchId,
    change_type: c.changeType,
    category: c.category,
    previous_value: c.previousValue,
    new_value: c.newValue,
    // Recomputing the full analysis engine's confidence per change event isn't done here
    // (would mean re-fetching/re-running the whole engine mid-ingestion) — left null
    // rather than a guessed number. See analysisEngine.ts's module doc / final report.
    confidence_before: null,
    confidence_after: null,
    source,
  }));
  const { error } = await supabase.from('analysis_changes').insert(rows);
  if (error) throw error;
}

/**
 * Change Intelligence for squad/lineup state: compares the state already in Supabase
 * (BEFORE this run's upsert) against what BSD just returned, and only logs a change for
 * a real transition. `hasPriorState` (a match_lineups row already existed for this match)
 * gates out first-ever-ingestion noise, per MASTER PROMPT PHASE 2 §8 — a match's first
 * enrichment establishes a baseline, it is never itself reported as N "changes".
 */
async function detectAndLogSquadChanges(match: CandidateMatch, event: BsdEvent, lineups: Awaited<ReturnType<typeof getEventLineups>>) {
  const { data: existingLineup } = await supabase.from('match_lineups').select('lineup_status').eq('match_id', match.id).maybeSingle();
  const hasPriorState = existingLineup !== null;

  const changes: DetectedChange[] = [];

  if (lineups.lineup_status) {
    const lineupChange = detectLineupStatusChange(hasPriorState, existingLineup?.lineup_status ?? null, lineups.lineup_status);
    if (lineupChange) changes.push(lineupChange);
  }

  let staleAvailabilityIds: number[] = [];

  if (lineups.unavailable_players) {
    const { data: existingAvailability } = await supabase
      .from('player_availability')
      .select('id, team_id, player_name')
      .eq('match_id', match.id);

    const previousHomeNames = (existingAvailability ?? []).filter((r) => r.team_id === match.home_team_id).map((r) => r.player_name);
    const previousAwayNames = (existingAvailability ?? []).filter((r) => r.team_id === match.away_team_id).map((r) => r.player_name);
    const nextHomeNames = lineups.unavailable_players.home.map((p) => p.name);
    const nextAwayNames = lineups.unavailable_players.away.map((p) => p.name);

    changes.push(...detectAvailabilityDelta(hasPriorState, previousHomeNames, nextHomeNames));
    changes.push(...detectAvailabilityDelta(hasPriorState, previousAwayNames, nextAwayNames));

    // A player who recovered (no longer in BSD's unavailable list) must have their old row
    // removed, not just left stale — otherwise a future re-injury for the same player would
    // look like "no change" to detectAvailabilityDelta above, since its "previous" snapshot
    // would still (wrongly) include them as unavailable. Computed here (by row id, not by
    // string-matching a name in a query filter) so a name with quotes/commas can't break it.
    const nextNames = new Set([...nextHomeNames, ...nextAwayNames]);
    staleAvailabilityIds = (existingAvailability ?? []).filter((r) => !nextNames.has(r.player_name)).map((r) => r.id);
  }

  await persistDetectedChanges(match.id, changes, 'bsd_lineups');
  return staleAvailabilityIds;
}

async function enrichOneMatch(match: CandidateMatch, event: BsdEvent) {
  // Lineups + availability share one BSD call; fetched once here, availability
  // persisted with real SportMind team ids (lineups fields don't need them).
  const lineups = await getEventLineups(event.id);

  // Must run BEFORE the upserts below — it needs to see the pre-this-run state.
  const staleAvailabilityIds = await detectAndLogSquadChanges(match, event, lineups);

  if (lineups.lineups) {
    const { error } = await supabase.from('match_lineups').upsert({
      match_id: match.id,
      lineup_status: lineups.lineup_status,
      home_formation: lineups.lineups.home?.formation ?? null,
      away_formation: lineups.lineups.away?.formation ?? null,
      home_players: lineups.lineups.home?.players ?? null,
      away_players: lineups.lineups.away?.players ?? null,
      bsd_event_id: event.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  if (lineups.unavailable_players) {
    const allUnavailable = [
      ...lineups.unavailable_players.home.map((p) => ({ ...p, team_id: match.home_team_id })),
      ...lineups.unavailable_players.away.map((p) => ({ ...p, team_id: match.away_team_id })),
    ];
    const rows = allUnavailable.map((p) => ({
      match_id: match.id,
      team_id: p.team_id,
      player_name: p.name,
      status: p.status,
      reason: p.reason,
      bsd_player_id: p.id, // may be null — BSD returns id: null for a small minority of entries
      bsd_event_id: event.id,
      updated_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error } = await supabase.from('player_availability').upsert(rows, { onConflict: 'match_id,player_name' });
      if (error) throw error;
    }

    // Resolve market value for each unavailable player with a real BSD id — cache-first,
    // bounded to the players actually flagged unavailable in THIS match (typically 0-10),
    // never a league-wide backfill. See resolvePlayerMarketValue's own doc for the cache
    // policy that keeps this from becoming an N+1/unbounded API cost.
    for (const p of allUnavailable) {
      if (p.id !== null) await resolvePlayerMarketValue(p.id);
    }
  }

  if (staleAvailabilityIds.length > 0) {
    const { error } = await supabase.from('player_availability').delete().in('id', staleAvailabilityIds);
    if (error) throw error;
  }

  await persistPlayerStats(match, event);
  await persistRawStats(match.id, event);
  await persistH2H(match.id, event);
}

/**
 * Runs one enrichment pass over BSD_TIER1_LEAGUES. Best-effort per league and
 * per event — one bad response never aborts the rest of the pass, and this
 * whole function is itself called as best-effort from index.ts so a BSD
 * outage never takes down football-data.org/RapidAPI ingestion.
 */
export async function enrichWithBsd() {
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - ENRICHMENT_WINDOW_PAST_DAYS);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + ENRICHMENT_WINDOW_FUTURE_DAYS);

  const bsdLeagues = await getLeagues();
  const competitionNames = BSD_TIER1_LEAGUES.map((l) => l.competition);
  const candidates = await getCandidateMatches(competitionNames, windowStart, windowEnd);

  let matched = 0;
  let enriched = 0;
  let skippedNoLeague = 0;

  for (const tier1 of BSD_TIER1_LEAGUES) {
    const league = bsdLeagues.find((l) => l.name === tier1.bsdName && l.country === tier1.bsdCountry);
    if (!league) {
      skippedNoLeague++;
      console.log(`  BSD: no league match for ${tier1.competition} (${tier1.bsdName}/${tier1.bsdCountry}) — skipping.`);
      continue;
    }

    const season = await getCurrentSeason(league.id);
    if (!season) {
      console.log(`  BSD: no current season for ${tier1.competition} — skipping.`);
      continue;
    }

    let events: BsdEvent[];
    try {
      events = await getEvents({
        leagueId: league.id,
        seasonId: season.id,
        dateFrom: isoDate(windowStart),
        dateTo: isoDate(windowEnd),
      });
    } catch (error) {
      console.error(`  BSD: fetching events for ${tier1.competition} failed, continuing:`, error);
      continue;
    }

    const leagueCandidates = candidates.filter((c) => c.competition === tier1.competition);

    for (const event of events) {
      const match = findConfidentMatch(event, leagueCandidates);
      if (!match) continue;
      matched++;

      try {
        await enrichOneMatch(match, event);
        enriched++;
      } catch (error) {
        console.error(`  BSD: enrichment failed for match ${match.id} (BSD event ${event.id}), continuing:`, error);
      }
    }
  }

  console.log(`  BSD enrichment: ${matched} events matched, ${enriched} matches enriched, ${skippedNoLeague} leagues unresolved.`);
}
