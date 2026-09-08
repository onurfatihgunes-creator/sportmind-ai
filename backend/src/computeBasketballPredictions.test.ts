import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrediction, ENGINE_VERSION } from './computeBasketballPredictions.js';
import { isDeterministic } from './evaluation.js';

// Intelligence 6.1: same zero-form prediction-integrity fix as computePredictions.ts's
// football equivalent, applied here for consistency even though this path is currently
// dormant in production (every NBA team had >=3 real team_form rows as of the 6.0 audit)
// — a brand-new/relocated franchise would hit it.

const TRUSTED_HOME = { winRate: 0.8, avgPointsFor: 118, avgPointsAgainst: 105, matchesCount: 5 };
const TRUSTED_AWAY = { winRate: 0.4, avgPointsFor: 108, avgPointsAgainst: 112, matchesCount: 5 };
const ZERO_FORM = { winRate: 0.5, avgPointsFor: 112, avgPointsAgainst: 112, matchesCount: 0 };

test('basketball has no draw: outcome shape is home/away only', () => {
  const result = buildPrediction(TRUSTED_HOME, TRUSTED_AWAY);
  assert.equal(result.outcomes.draw, 0);
  assert.equal(result.outcomes.home + result.outcomes.away, 100);
});

test('trusted-form vs trusted-form: all 4 factors present', () => {
  const result = buildPrediction(TRUSTED_HOME, TRUSTED_AWAY);
  const keys = result.factors.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['defensivePerformance', 'homeCourtAdvantage', 'pointsScored', 'recentForm'].sort());
});

test('zero-form does not fabricate recentForm/pointsScored/defensivePerformance', () => {
  const result = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  const keys = result.factors.map((f) => f.key);
  assert.deepEqual(keys, ['homeCourtAdvantage']);
});

test('zero-form on either side suppresses the same factors', () => {
  const homeZero = buildPrediction(ZERO_FORM, TRUSTED_AWAY);
  const awayZero = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  for (const result of [homeZero, awayZero]) {
    assert.deepEqual(
      result.factors.map((f) => f.key),
      ['homeCourtAdvantage'],
    );
  }
});

test('zero-form prediction still sums to exactly 100 and stays a valid probability', () => {
  const result = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  assert.equal(result.outcomes.home + result.outcomes.away, 100);
  assert.ok(result.outcomes.home >= 10 && result.outcomes.home <= 90);
});

// --- Intelligence 7.0: determinism + probability invariants + engine version ---------

test('DETERMINISM: buildPrediction always produces byte-identical output for identical input', () => {
  assert.equal(isDeterministic(() => buildPrediction(TRUSTED_HOME, TRUSTED_AWAY)), true);
});

test('PROBABILITY INVARIANT (2-way): home+away always sums to exactly 100, never negative or over 100, across a broad sweep', () => {
  const forms = [TRUSTED_HOME, TRUSTED_AWAY, ZERO_FORM];
  for (const home of forms) {
    for (const away of forms) {
      const { outcomes } = buildPrediction(home, away);
      assert.equal(outcomes.home + outcomes.away, 100);
      assert.equal(outcomes.draw, 0); // basketball never has a draw outcome
      assert.ok(outcomes.home >= 0 && outcomes.home <= 100);
      assert.ok(outcomes.away >= 0 && outcomes.away <= 100);
    }
  }
});

test('ENGINE VERSION: a code-level version proxy is documented and stable (v1) — no schema column exists for it', () => {
  assert.equal(ENGINE_VERSION, 'v1');
});
