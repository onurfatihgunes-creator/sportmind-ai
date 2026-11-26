import test from 'node:test';
import assert from 'node:assert/strict';
import { historyRowFrom, isModelSwitch, modelVersion, shouldAppend } from './predictionHistory.js';

const base = {
  matchId: 'm1', sport: 'football' as const, modelVersion: 'football-v2', status: 'published' as const,
  calculatedAt: '2026-11-26T10:00:00.000Z', kickoffAt: '2026-11-28T15:00:00.000Z',
  outcomesPct: { home: 48, draw: 24, away: 28 }, expectedHome: 1.7, expectedAway: 1.3,
  inputDataTimestamp: '2026-11-25T20:00:00.000Z', factors: [],
};

test('model versions are namespaced by sport', () => {
  assert.equal(modelVersion('football', 'v2'), 'football-v2');
  assert.equal(modelVersion('basketball', 'v1'), 'basketball-v1');
});

test('history row: whole percents become probabilities that sum to 1; bad sums are refused', () => {
  const r = historyRowFrom(base);
  assert.ok(Math.abs(r.home_probability + r.draw_probability + r.away_probability - 1) < 1e-12);
  assert.equal(r.home_probability, 0.48);
  assert.throws(() => historyRowFrom({ ...base, outcomesPct: { home: 50, draw: 24, away: 28 } }));
});

test('append: first row always, identical recomputation never, any probability or kickoff change yes', () => {
  const r = historyRowFrom(base);
  assert.equal(shouldAppend(null, r), true);
  assert.equal(shouldAppend(r, { ...r }), false);
  assert.equal(shouldAppend(r, { ...r, home_probability: 0.49, draw_probability: 0.23 }), true);
  assert.equal(shouldAppend(r, { ...r, kickoff_at: '2026-11-29T15:00:00.000Z' }), true);
  // numeric columns come back from Postgres as strings
  assert.equal(shouldAppend({ ...r, home_probability: '0.48000' as unknown as number }, r), false);
});

test('model switch: versions decide when known; the legacy heuristic only when the old row has none', () => {
  assert.equal(isModelSwitch('football-v1', 'football-v2', false), true);
  assert.equal(isModelSwitch('football-v2', 'football-v2', true), false);
  assert.equal(isModelSwitch(null, 'football-v2', true), true);
  assert.equal(isModelSwitch(undefined, 'football-v2', false), false);
});
