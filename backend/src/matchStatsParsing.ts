/**
 * Pure parsing from BSD's real response shapes into the typed rows
 * match_incidents/team_match_stats store (see
 * sql/add_match_incidents_and_team_stats.sql for why these tables exist and what was
 * confirmed live before adding them). No I/O here — bsdEnrichment.ts does the
 * fetching/writing; this module is directly unit-testable against fixed inputs.
 */
import type { BsdIncident } from './bsdFootball.js';

export type MatchIncidentRow = {
  match_id: string;
  incident_type: string;
  minute: number;
  is_home: boolean;
  player_name: string;
  assist_player_name: string | null;
  bsd_event_id: number;
};

/** True for a real, team-scoped incident (goal/card/substitution/etc — every one
 * observed live carries a real `is_home` and `player`). False for a marker row like
 * BSD's `type: 'period'` (confirmed live: `is_home`/`player` both null — a half/full-time
 * boundary, not a player event) — `match_incidents.is_home`/`player_name` are NOT NULL,
 * so a row like that can never be stored, only skipped. Checked structurally (real
 * `is_home` + `player`) rather than by an `incident_type !== 'period'` denylist, so any
 * other non-team-scoped marker type BSD adds later is caught the same way without this
 * needing to know its name in advance. */
function isTeamScopedIncident(i: BsdIncident): i is BsdIncident & { is_home: boolean; player: string } {
  return typeof i.is_home === 'boolean' && typeof i.player === 'string';
}

export function parseIncidents(matchId: string, eventId: number, incidents: BsdIncident[]): MatchIncidentRow[] {
  return incidents.filter(isTeamScopedIncident).map((i) => ({
    match_id: matchId,
    incident_type: i.type,
    minute: i.minute,
    is_home: i.is_home,
    player_name: i.player,
    assist_player_name: i.assist ?? null,
    bsd_event_id: eventId,
  }));
}

/** True only when the derived goal tally from real 'goal' incidents exactly matches the
 * match's own stored final score — confirmed live (2026-09-09, n=280) that ~3.6% of BSD
 * events have an incidents feed that over-counts goals relative to the real final score
 * (a likely disallowed/duplicate entry on BSD's side, not a bug here). Any consumer that
 * wants to reconstruct a half-time score from `match_incidents` MUST call this first —
 * an inconsistent incident set is real data, just not trustworthy enough to derive a
 * second number (half-time score) from that could contradict itself. */
export function incidentsAgreeWithFinalScore(incidents: BsdIncident[], homeScore: number, awayScore: number): boolean {
  const goals = incidents.filter((i) => i.type === 'goal');
  const home = goals.filter((g) => g.is_home).length;
  const away = goals.filter((g) => !g.is_home).length;
  return home === homeScore && away === awayScore;
}

export type TeamMatchStatsRow = {
  match_id: string;
  team_id: string;
  side: 'home' | 'away';
  xg_actual: number | null;
  total_shots: number | null;
  shots_on_target: number | null;
  ball_possession: number | null;
  corner_kicks: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  big_chances: number | null;
  fouls: number | null;
  bsd_event_id: number;
};

type RawSideStats = Record<string, unknown>;

function num(raw: RawSideStats, key: string): number | null {
  const v = raw[key];
  return typeof v === 'number' ? v : null;
}

/** Only reads keys already confirmed live against a real BSD `/events/{id}/stats/`
 * response (see the SQL migration's header) — every other key in `raw` passes through
 * unread, same discipline as match_stats_raw's own doc comment (never guess a field
 * name). `xg_actual` is null unless BSD's own `xg.estimated` is exactly `false` — an
 * *estimated* xG is not the real shot-based number this table exists to promote. */
function parseSideStats(matchId: string, teamId: string, side: 'home' | 'away', eventId: number, raw: RawSideStats): TeamMatchStatsRow {
  const xg = raw.xg as { actual?: unknown; estimated?: unknown } | undefined;
  const xgActual = xg && xg.estimated === false && typeof xg.actual === 'number' ? xg.actual : null;
  return {
    match_id: matchId,
    team_id: teamId,
    side,
    xg_actual: xgActual,
    total_shots: num(raw, 'total_shots'),
    shots_on_target: num(raw, 'shots_on_target'),
    ball_possession: num(raw, 'ball_possession'),
    corner_kicks: num(raw, 'corner_kicks'),
    yellow_cards: num(raw, 'yellow_cards'),
    red_cards: num(raw, 'red_cards'),
    big_chances: num(raw, 'big_chances'),
    fouls: num(raw, 'fouls'),
    bsd_event_id: eventId,
  };
}

export function parseTeamMatchStats(
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  eventId: number,
  raw: { home?: RawSideStats; away?: RawSideStats },
): TeamMatchStatsRow[] {
  const rows: TeamMatchStatsRow[] = [];
  if (raw.home) rows.push(parseSideStats(matchId, homeTeamId, 'home', eventId, raw.home));
  if (raw.away) rows.push(parseSideStats(matchId, awayTeamId, 'away', eventId, raw.away));
  return rows;
}
