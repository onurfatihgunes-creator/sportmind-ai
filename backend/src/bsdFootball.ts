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

export async function getCurrentSeason(leagueId: number): Promise<BsdSeason | null> {
  return bsdGet<BsdSeason | null>(`/leagues/${leagueId}/season/`);
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

/** Field shape is not published in BSD's OpenAPI schema (dynamic/unserialized view) —
 * treat as an opaque bag and only read keys after confirming them against a real response.
 * Do not assume any field below exists; the app must never fabricate a stat that isn't here. */
export async function getEventStats(eventId: number): Promise<Record<string, unknown>> {
  return bsdGet<Record<string, unknown>>(`/events/${eventId}/stats/`);
}

export type BsdIncident = {
  type: string; // e.g. 'goal' | 'yellow_card' | 'red_card' | 'substitution'
  player: string;
  minute: number;
  is_home: boolean;
  assist?: string | null;
};

export async function getEventIncidents(eventId: number): Promise<BsdIncident[]> {
  return bsdGet<BsdIncident[]>(`/events/${eventId}/incidents/`);
}

export type BsdPlayerStat = {
  player: { id: number; name: string; position?: string; team?: string };
  minutes_played: number;
  rating: number | null;
  goals: number;
  goal_assist: number;
  expected_goals: number | null;
  expected_assists: number | null;
  total_shots: number;
  shots_on_target: number;
};

export async function getEventPlayerStats(eventId: number): Promise<BsdPlayerStat[]> {
  const data = await bsdGet<BsdPaginated<BsdPlayerStat> | BsdPlayerStat[]>(`/events/${eventId}/player-stats/`);
  return Array.isArray(data) ? data : data.results;
}

/** Returns null-valued fields (not a 404) when BSD has no indexed history for the pair. */
export async function getEventH2H(eventId: number): Promise<Record<string, unknown>> {
  return bsdGet<Record<string, unknown>>(`/events/${eventId}/h2h/`);
}
