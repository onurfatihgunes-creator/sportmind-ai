/**
 * Regression coverage for the status-sync bug fixed in this file's own bsdStatusOf (the
 * BSD fallback path used when RapidAPI's Süper Lig listing has no current-season fixture)
 * — the live-confirmed source of bsd-215984/bsd-215985, both stuck at status='scheduled'
 * with real final scores. Identical fix/shape to fetchBsdFixtures.test.ts; kept as its own
 * test file since fetchTurkishFixtures.ts carries its own independent copy of the function.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsdStatusOf } from './fetchTurkishFixtures.js';
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
