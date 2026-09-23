/**
 * Regression coverage for the status-sync bug fixed in bsdStatusOf: BSD-sourced Süper Lig
 * matches bsd-215984/bsd-215985 were stuck at status='scheduled' with real final scores
 * because BSD's own `status` field hadn't flipped to 'finished' — see
 * fetchTurkishFixtures.test.ts for the identical fallback-path fix.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsdStatusOf } from './fetchBsdFixtures.js';
import type { BsdEvent } from './bsdFootball.js';

function event(overrides: Partial<BsdEvent>): BsdEvent {
  return {
    id: 1,
    league_id: 1,
    season_id: 1,
    event_date: '2026-09-06T00:00:00Z',
    home_team: 'Home',
    away_team: 'Away',
    home_team_id: 1,
    away_team_id: 2,
    home_score: null,
    away_score: null,
    status: 'notstarted',
    ...overrides,
  } as BsdEvent;
}

test('a real final score overrides an unmapped/lagging BSD status — the live bsd-215984/985 bug', () => {
  assert.equal(bsdStatusOf(event({ status: 'notstarted', home_score: 1, away_score: 0 })), 'finished');
  assert.equal(bsdStatusOf(event({ status: 'inprogress', home_score: 3, away_score: 0 })), 'finished');
});

test('the normal finished case still resolves to finished', () => {
  assert.equal(bsdStatusOf(event({ status: 'finished', home_score: 2, away_score: 1 })), 'finished');
});

test('a genuinely upcoming match (no score yet) stays scheduled — grace-window matches are never wrongly finished', () => {
  assert.equal(bsdStatusOf(event({ status: 'notstarted', home_score: null, away_score: null })), 'scheduled');
});

test('cancelled/postponed are never reinterpreted as finished', () => {
  assert.equal(bsdStatusOf(event({ status: 'cancelled', home_score: null, away_score: null })), 'postponed');
  assert.equal(bsdStatusOf(event({ status: 'postponed', home_score: 0, away_score: 0 })), 'postponed');
});
