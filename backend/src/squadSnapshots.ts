/**
 * V3 Phase A3 — append-only, pre-kickoff squad snapshots (see sql/add_match_squad_snapshots.sql).
 *
 * Rules, all enforced in `buildSquadSnapshot` (pure, unit-tested):
 *   * Only information captured BEFORE kickoff is recorded; a response seen at or after
 *     kickoff returns null, so a post-kickoff lineup can never pose as pre-match data.
 *   * Nothing is reconstructed: the row holds exactly what the provider returned at that moment.
 *   * Unknown is explicit: `lineup_known` / `availability_known` are false when the provider
 *     returned no data, and the corresponding columns are null (not an empty list).
 *   * `content_hash` covers the content only (not the capture time), so identical polls collapse
 *     onto the existing row via the table's unique (match_id, content_hash).
 */
import { createHash } from 'node:crypto';
import type { BsdLineups } from './bsdFootball.js';
import { supabase } from './supabaseClient.js';

export type SquadSnapshotRow = {
  match_id: string;
  captured_at: string;
  kickoff_at: string;
  source: 'bsd_lineups';
  lineup_status: 'unavailable' | 'predicted' | 'confirmed';
  lineup_known: boolean;
  availability_known: boolean;
  home_formation: string | null;
  away_formation: string | null;
  home_players: unknown[] | null;
  away_players: unknown[] | null;
  home_unavailable: unknown[] | null;
  away_unavailable: unknown[] | null;
  provider_updated_at: string | null;
  content_hash: string;
};

const slimPlayer = (p: { id: number | null; name: string; position: string }) => ({ id: p.id, name: p.name, position: p.position });
const slimUnavailable = (p: { id: number | null; name: string; status: string; reason: string }) => ({ id: p.id, name: p.name, status: p.status, reason: p.reason });

export function buildSquadSnapshot(matchId: string, kickoffAt: string, lineups: BsdLineups, capturedAt: Date): SquadSnapshotRow | null {
  if (capturedAt.getTime() >= new Date(kickoffAt).getTime()) return null; // never record post-kickoff data

  const sides = lineups.lineups;
  const lineupKnown = lineups.lineup_status !== 'unavailable' && !!sides && (!!sides.home || !!sides.away);
  const availabilityKnown = !!lineups.unavailable_players;

  const content = {
    lineup_status: lineups.lineup_status,
    lineup_known: lineupKnown,
    availability_known: availabilityKnown,
    home_formation: lineupKnown ? sides?.home?.formation ?? null : null,
    away_formation: lineupKnown ? sides?.away?.formation ?? null : null,
    home_players: lineupKnown && sides?.home ? sides.home.players.map(slimPlayer) : null,
    away_players: lineupKnown && sides?.away ? sides.away.players.map(slimPlayer) : null,
    home_unavailable: availabilityKnown ? lineups.unavailable_players!.home.map(slimUnavailable) : null,
    away_unavailable: availabilityKnown ? lineups.unavailable_players!.away.map(slimUnavailable) : null,
  };
  const content_hash = createHash('sha256').update(JSON.stringify(content)).digest('hex');

  return {
    match_id: matchId,
    captured_at: capturedAt.toISOString(),
    kickoff_at: kickoffAt,
    source: 'bsd_lineups',
    ...content,
    provider_updated_at: lineups.updated_at,
    content_hash,
  };
}

let tableMissingLogged = false;

/** Best-effort: a snapshot failure (e.g. migration not applied yet) never blocks enrichment. */
export async function recordSquadSnapshot(matchId: string, kickoffAt: string, lineups: BsdLineups, now: Date = new Date()): Promise<void> {
  const row = buildSquadSnapshot(matchId, kickoffAt, lineups, now);
  if (!row) return;
  const { error } = await supabase
    .from('match_squad_snapshots')
    .upsert(row, { onConflict: 'match_id,content_hash', ignoreDuplicates: true });
  if (!error) return;
  if (error.code === '42P01' || /match_squad_snapshots/.test(error.message ?? '')) {
    if (!tableMissingLogged) console.log('Squad snapshots: table not created yet (sql/add_match_squad_snapshots.sql) — skipped.');
    tableMissingLogged = true;
    return;
  }
  console.error(`Squad snapshots: insert failed for ${matchId}, continuing:`, error);
}
