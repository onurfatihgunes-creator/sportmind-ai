import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poissonPmf, poissonCdf, overUnderProbability, bttsProbability, teamGoalLineProbability, scorelineDistribution, computeGoalMarkets, OVER_UNDER_LINES } from './goalMarkets.js';

test('poissonPmf sums to ~1 over a wide range', () => {
  for (const lambda of [0.5, 1.3, 2.1, 4.0]) {
    let sum = 0;
    for (let k = 0; k <= 40; k++) sum += poissonPmf(k, lambda);
    assert.ok(Math.abs(sum - 1) < 1e-9, `lambda=${lambda} summed to ${sum}`);
  }
});

test('poissonCdf is non-decreasing and bounded in [0,1]', () => {
  const lambda = 2.4;
  let prev = 0;
  for (let k = 0; k <= 20; k++) {
    const cdf = poissonCdf(k, lambda);
    assert.ok(cdf >= prev - 1e-12);
    assert.ok(cdf >= 0 && cdf <= 1);
    prev = cdf;
  }
  assert.ok(poissonCdf(30, lambda) > 0.999999);
});

test('overUnderProbability: over + under sum to 1, both in [0,1]', () => {
  for (const line of OVER_UNDER_LINES) {
    const { over, under } = overUnderProbability(1.4, 1.1, line);
    assert.ok(over >= 0 && over <= 1);
    assert.ok(under >= 0 && under <= 1);
    assert.ok(Math.abs(over + under - 1) < 1e-9);
  }
});

test('overUnderProbability: a higher line always has a lower (or equal) over-probability', () => {
  const o15 = overUnderProbability(1.6, 1.2, 1.5).over;
  const o25 = overUnderProbability(1.6, 1.2, 2.5).over;
  const o35 = overUnderProbability(1.6, 1.2, 3.5).over;
  assert.ok(o15 >= o25);
  assert.ok(o25 >= o35);
});

test('bttsProbability: yes + no sum to 1, both in [0,1]', () => {
  const { yes, no } = bttsProbability(1.5, 1.2);
  assert.ok(yes >= 0 && yes <= 1);
  assert.ok(no >= 0 && no <= 1);
  assert.ok(Math.abs(yes + no - 1) < 1e-9);
});

test('bttsProbability: a side with ~0 expected goals makes BTTS Yes ~0', () => {
  const { yes } = bttsProbability(1.5, 0.0001);
  assert.ok(yes < 0.001);
});

test('teamGoalLineProbability: over + under sum to 1', () => {
  const { over, under } = teamGoalLineProbability(1.8, 1.5);
  assert.ok(Math.abs(over + under - 1) < 1e-9);
});

test('scorelineDistribution: probabilities sum to ~1 across the full bounded grid', () => {
  const rows = scorelineDistribution(1.4, 1.1);
  const total = rows.reduce((sum, r) => sum + r.probability, 0);
  // MAX_GOALS_PER_SIDE bounds the grid, so a tiny, expected tail beyond it is not
  // captured — see goalMarkets.ts's own header doc. 1e-4 comfortably covers that
  // residual while still catching a real miscalculation.
  assert.ok(Math.abs(total - 1) < 1e-4, `grid summed to ${total}`);
  assert.ok(rows.every((r) => r.probability >= 0 && !Number.isNaN(r.probability) && Number.isFinite(r.probability)));
});

test('scorelineDistribution: sorted most likely first', () => {
  const rows = scorelineDistribution(1.4, 1.1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].probability >= rows[i].probability);
});

test('computeGoalMarkets: every probability is a finite number in [0,1], no NaN/Infinity/negative', () => {
  const markets = computeGoalMarkets(1.7, 1.2);
  const allProbs = [
    ...Object.values(markets.overUnder).flatMap((m) => [m.over, m.under]),
    markets.btts.yes,
    markets.btts.no,
    ...Object.values(markets.teamGoals.home).flatMap((m) => [m.over, m.under]),
    ...Object.values(markets.teamGoals.away).flatMap((m) => [m.over, m.under]),
    ...markets.topScorelines.map((s) => s.probability),
  ];
  for (const p of allProbs) {
    assert.ok(Number.isFinite(p), `non-finite probability: ${p}`);
    assert.ok(!Number.isNaN(p), `NaN probability`);
    assert.ok(p >= 0 && p <= 1, `probability out of [0,1]: ${p}`);
  }
});

test('computeGoalMarkets: deterministic — same input always yields the same output', () => {
  const a = JSON.stringify(computeGoalMarkets(1.9, 0.8));
  const b = JSON.stringify(computeGoalMarkets(1.9, 0.8));
  assert.equal(a, b);
});

test('computeGoalMarkets: zero xG on both sides degenerates to a 0-0 certainty, never NaN', () => {
  const markets = computeGoalMarkets(0, 0);
  assert.ok(Math.abs(markets.topScorelines[0].probability - 1) < 1e-9);
  assert.equal(markets.topScorelines[0].home, 0);
  assert.equal(markets.topScorelines[0].away, 0);
  assert.ok(markets.btts.no > 0.999);
});
