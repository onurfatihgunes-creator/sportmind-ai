import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSquadSnapshot } from './squadSnapshots.js';
import type { BsdLineups } from './bsdFootball.js';

const kickoff = '2026-11-28T15:00:00.000Z';
const before = new Date('2026-11-28T13:00:00.000Z');
const player = (id: number, name: string) => ({ id, name, short_name: name, position: 'M', jersey_number: 8, ai_score: 7.1 });
const lineups = (over: Partial<BsdLineups> = {}): BsdLineups => ({
  event_id: 1, lineup_status: 'confirmed', beta: false,
  lineups: { home: { team_id: 1, team_name: 'H', formation: '4-3-3', confidence: null, players: [player(1, 'A')], substitutes: [] }, away: { team_id: 2, team_name: 'W', formation: '4-4-2', confidence: null, players: [player(2, 'B')], substitutes: [] } },
  unavailable_players: { home: [{ id: 9, name: 'Inj', short_name: 'I', status: 'injured', reason: 'knee' }], away: [] },
  updated_at: '2026-11-28T12:55:00.000Z', ...over,
});

test('never records at or after kickoff', () => {
  assert.equal(buildSquadSnapshot('m', kickoff, lineups(), new Date(kickoff)), null);
  assert.equal(buildSquadSnapshot('m', kickoff, lineups(), new Date('2026-11-28T16:00:00.000Z')), null);
  assert.notEqual(buildSquadSnapshot('m', kickoff, lineups(), before), null);
});

test('unknown is explicit: no lineup / no availability data -> known=false and null, not []', () => {
  const s = buildSquadSnapshot('m', kickoff, lineups({ lineup_status: 'unavailable', lineups: null, unavailable_players: null }), before)!;
  assert.equal(s.lineup_known, false);
  assert.equal(s.availability_known, false);
  assert.equal(s.home_players, null);
  assert.equal(s.home_unavailable, null);
  const none = buildSquadSnapshot('m', kickoff, lineups({ unavailable_players: { home: [], away: [] } }), before)!;
  assert.equal(none.availability_known, true);
  assert.deepEqual(none.home_unavailable, []);
});

test('content hash ignores capture time but changes with content', () => {
  const a = buildSquadSnapshot('m', kickoff, lineups(), before)!;
  const b = buildSquadSnapshot('m', kickoff, lineups(), new Date('2026-11-28T14:00:00.000Z'))!;
  assert.equal(a.content_hash, b.content_hash);
  const c = buildSquadSnapshot('m', kickoff, lineups({ lineup_status: 'predicted' }), before)!;
  assert.notEqual(a.content_hash, c.content_hash);
});
