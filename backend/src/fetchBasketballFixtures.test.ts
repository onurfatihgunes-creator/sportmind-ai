/**
 * Regression coverage for the NBA scheduled-score bug fixed in resolveNbaScore:
 * balldontlie returns 0 (not null) for an unplayed game's score, which was persisted
 * verbatim as a fake "0-0" on all 559 scheduled NBA rows confirmed live.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNbaScore } from './fetchBasketballFixtures.js';

test('a scheduled (not yet played) game never persists balldontlie\'s placeholder 0 — the live 559-row bug', () => {
  assert.equal(resolveNbaScore('scheduled', 0), null);
});

test('a finished game keeps its real score, including a genuine 0 for either side', () => {
  assert.equal(resolveNbaScore('finished', 94), 94);
  assert.equal(resolveNbaScore('finished', 0), 0);
});
