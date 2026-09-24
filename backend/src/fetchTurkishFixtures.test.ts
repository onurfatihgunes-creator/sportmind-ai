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

const NOW = new Date('2026-09-24T12:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function event(overrides: Partial<BsdEvent>): BsdEvent {
  return {
    id: 1,
    league_id: 1,
    season_id: 1,
    event_date: hoursFromNow(-30),
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

test('a real final score overrides an unmapped/lagging BSD status once the match has had time to finish — the bsd-215984/985 case', () => {
  assert.equal(bsdStatusOf(event({ status: 'notstarted', home_score: 1, away_score: 0 }), NOW), 'finished');
  assert.equal(bsdStatusOf(event({ status: 'inprogress', home_score: 3, away_score: 0 }), NOW), 'finished');
});

test('a placeholder 0-0 on a future fixture is never finished', () => {
  assert.equal(bsdStatusOf(event({ event_date: hoursFromNow(24 * 27), home_score: 0, away_score: 0 }), NOW), 'scheduled');
});

test('a live in-progress score is not finished before the guard window elapses', () => {
  assert.equal(bsdStatusOf(event({ status: 'inprogress', event_date: hoursFromNow(-1), home_score: 2, away_score: 1 }), NOW), 'scheduled');
});

test('the normal finished case still resolves to finished, whatever the kickoff age', () => {
  assert.equal(bsdStatusOf(event({ status: 'finished', event_date: hoursFromNow(-3), home_score: 2, away_score: 1 }), NOW), 'finished');
});

test('a genuinely upcoming match (no score yet) stays scheduled', () => {
  assert.equal(bsdStatusOf(event({ status: 'notstarted', event_date: hoursFromNow(48) }), NOW), 'scheduled');
});

test("BSD's real 'canceled' spelling (one L) is postponed, never finished — Nantes v Toulouse placeholder 0-0", () => {
  const e = event({ status: 'canceled' as BsdEvent['status'], event_date: hoursFromNow(-24 * 130), home_score: 0, away_score: 0 });
  assert.equal(bsdStatusOf(e, NOW), 'postponed');
});

test('cancelled/postponed are never reinterpreted as finished', () => {
  assert.equal(bsdStatusOf(event({ status: 'cancelled' }), NOW), 'postponed');
  assert.equal(bsdStatusOf(event({ status: 'postponed', home_score: 0, away_score: 0 }), NOW), 'postponed');
});
