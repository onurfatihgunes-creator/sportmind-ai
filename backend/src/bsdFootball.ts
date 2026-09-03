import { env } from './config.js';

const BASE_URL = 'https://sports.bzzoiro.com/api/v2';

/** Enrichment-only client for BSD (Bzzoiro Sports Data). Endpoints and field names below
 * are taken directly from BSD's published OpenAPI schema (sports.bzzoiro.com/api/schema/),
 * not guessed. BSD is never used as a fixture source in this app — football-data.org and
 * the RapidAPI Süper Lig integration already own fixture ingestion, so BSD only supplies
 * lineups/stats/incidents/player-stats/h2h for matches those sources already created. */

async function bsdGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Token ${env.bsdApiToken}` },
  });
  if (!res.ok) {
    throw new Error(`BSD ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export type BsdLeague = {
  id: number;
  name: string;
  country: string;
  country_code: string;
  is_active: boolean;
  priority: number;
};

export type BsdSeason = {
  id: number;
  name: string;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

export type BsdEventStatus =
  | '1st_half' | '2nd_half' | 'aet' | 'cancelled' | 'delayed' | 'extratime' | 'finished'
  | 'halftime' | 'inprogress' | 'notstarted' | 'penalties' | 'postponed' | 'unresolved';

export type BsdEvent = {
  id: number;
  league_id: number | null;
  season_id: number | null;
  home_team_id: number | null;
  home_team: string;
  away_team_id: number | null;
  away_team: string;
  event_date: string;
  status: BsdEventStatus;
  home_score: number | null;
  away_score: number | null;
};

type BsdPaginated<T> = { count: number; next: string | null; previous: string | null; results: T[] };

/** All active leagues in one call (there are 83+, well under the max page size) — resolve
 * BSD_TIER1_LEAGUES ids from this once per run instead of hardcoding unverified ids. */
export async function getLeagues(): Promise<BsdLeague[]> {
  const data = await bsdGet<BsdPaginated<BsdLeague>>('/leagues/?limit=200');
  return data.results;
}

/** Confirmed live (not per the OpenAPI component schema, which only describes the
 * season fields, not this endpoint's actual envelope): the real response is
 * `{ league_id, season }`, not the bare season object. `season` is null when none
 * is marked current for this league. */
export async function getCurrentSeason(leagueId: number): Promise<BsdSeason | null> {
  const data = await bsdGet<{ league_id: number; season: BsdSeason | null }>(`/leagues/${leagueId}/season/`);
  return data.season;
}

export async function getEvents(params: {
  leagueId: number;
  seasonId: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
}): Promise<BsdEvent[]> {
  const qs = new URLSearchParams({
    league_id: String(params.leagueId),
    season_id: String(params.seasonId),
  });
  if (params.dateFrom) qs.set('date_from', params.dateFrom);
  if (params.dateTo) qs.set('date_to', params.dateTo);
  qs.set('limit', '200');

  const results: BsdEvent[] = [];
  let url: string | null = `/events/?${qs.toString()}`;
  while (url) {
    const data: BsdPaginated<BsdEvent> = await bsdGet<BsdPaginated<BsdEvent>>(url);
    results.push(...data.results);
    url = data.next ? data.next.replace(BASE_URL, '') : null;
  }
  return results;
}

export type BsdLineupPlayer = {
  id: number | null;
  name: string;
  short_name: string;
  position: string;
  jersey_number: number | null;
  ai_score: number | null;
};

export type BsdLineupSide = {
  team_id: number | null;
  team_name: string;
  formation: string;
  confidence: number | null;
  players: BsdLineupPlayer[];
  substitutes: BsdLineupPlayer[];
};

export type BsdUnavailablePlayer = {
  id: number | null;
  name: string;
  short_name: string;
  status: string; // e.g. 'injured' | 'suspended' | 'doubtful'
  reason: string;
};

export type BsdLineups = {
  event_id: number;
  lineup_status: 'unavailable' | 'predicted' | 'confirmed';
  beta: boolean;
  lineups: { home: BsdLineupSide | null; away: BsdLineupSide | null } | null;
  unavailable_players: { home: BsdUnavailablePlayer[]; away: BsdUnavailablePlayer[] } | null;
  updated_at: string | null;
};

/** `unavailable_players` (injuries/suspensions/doubtful) lives inside this response —
 * BSD has no separate /injuries endpoint. Confirmed lineups appear ~1h before kickoff. */
export async function getEventLineups(eventId: number): Promise<BsdLineups> {
  return bsdGet<BsdLineups>(`/events/${eventId}/lineups/`);
}

/** Field shape *inside* `stats` is not published in BSD's OpenAPI schema
 * (dynamic/unserialized view) — treat its contents as an opaque bag and only
 * read keys after confirming them against a real response; never fabricate a
 * stat that isn't there. The outer envelope IS confirmed live, though:
 * `{ event_id, stats: {...} }` — unwrapped here so callers get the payload,
 * not a redundant copy of the id they already have. */
export async function getEventStats(eventId: number): Promise<Record<string, unknown>> {
  const data = await bsdGet<{ event_id: number; stats: Record<string, unknown> }>(`/events/${eventId}/stats/`);
  return data.stats;
}

export type BsdIncident = {
  type: string; // e.g. 'goal' | 'yellow_card' | 'red_card' | 'substitution'
  player: string;
  minute: number;
  is_home: boolean;
  assist?: string | null;
};

/** Confirmed live: the real envelope is `{ event_id, incidents }`, not a bare array. */
export async function getEventIncidents(eventId: number): Promise<BsdIncident[]> {
  const data = await bsdGet<{ event_id: number; incidents: BsdIncident[] }>(`/events/${eventId}/incidents/`);
  return data.incidents;
}

/** Confirmed live against a real finished match: a flat row per player, ~80
 * fields total (touches, duels, carries, keeper stats, etc.) — far richer
 * than BSD's own OpenAPI component schema describes, and structurally
 * different from it: there is NO nested `player: {id, name, ...}` object,
 * only a bare `player_id`/`team_id`. BSD does not ship a player name on this
 * endpoint at all — resolving one would need a separate `/players/{id}/`
 * call per player, not made here. Only the fields this app actually reads
 * are typed; the rest pass through unread rather than being guessed at. */
export type BsdPlayerStat = {
  player_id: number;
  team_id: number;
  minutes_played: number;
  rating: number | null;
  goals: number;
  goal_assist: number;
  expected_goals: number | null;
  expected_assists: number | null;
  total_shots: number;
  shots_on_target: number;
};

/** Confirmed live: the real envelope is `{ event_id, count, player_stats }`,
 * not the generic `{results}` pagination shape assumed elsewhere in this file
 * (OpenAPI's component schema doesn't describe this endpoint's own envelope). */
export async function getEventPlayerStats(eventId: number): Promise<BsdPlayerStat[]> {
  const data = await bsdGet<{ event_id: number; count: number; player_stats: BsdPlayerStat[] }>(
    `/events/${eventId}/player-stats/`,
  );
  return data.player_stats;
}

export type BsdH2HRecentMatch = {
  event_id: number;
  date: string;
  home: string;
  away: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
  score: string;
};

/** Confirmed live (2026-09-03, Arsenal vs Chelsea/Everton vs Man Utd/Hull vs Aston
 * Villa) — a stable typed shape, not the generic opaque bag match_stats_raw's endpoint
 * returns. `total_matches: 0` (not a 404) is BSD's own way of saying it has no indexed
 * history for the pair — treat that as "no data", never as a 0-0 record. */
export type BsdH2H = {
  total_matches: number;
  home_wins: number;
  draws: number;
  away_wins: number;
  home_goals: number;
  away_goals: number;
  avg_total_goals: number;
  home_win_rate: number;
  away_win_rate: number;
  recent_matches: BsdH2HRecentMatch[];
};

export async function getEventH2H(eventId: number): Promise<BsdH2H> {
  return bsdGet<BsdH2H>(`/events/${eventId}/h2h/`);
}

/** Confirmed live (2026-09-03, id=510 -> John McGinn, Aston Villa,
 * market_value_eur=12600000) — only the fields this app actually reads are typed. Used
 * to resolve a real name + an objective market value for a numeric player id, e.g. one
 * seen in player_availability's bsd_player_id or match_player_stats' player_id. Always
 * cache the result (see bsdEnrichment.ts's resolvePlayerMarketValue) — this is a
 * per-player detail call, never made in a loop without a cache check first. */
export type BsdPlayerDetail = {
  id: number;
  name: string;
  position: string | null;
  current_team_id: number | null;
  market_value_eur: number | null;
};

export async function getPlayer(playerId: number): Promise<BsdPlayerDetail> {
  return bsdGet<BsdPlayerDetail>(`/players/${playerId}/`);
}
