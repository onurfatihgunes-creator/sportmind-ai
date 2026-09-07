import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutcomes } from './computePredictions.js';

// Regression coverage for a real bug found during the Match Analysis data audit: three
// independently-rounded shares (the old implementation) can sum to 99 or 101 instead of
// 100 — confirmed live to affect ~9% of realistic form/xG input combinations, e.g.
// home 44 / draw 27 / away 30 summing to 101. normalizeOutcomes must always sum to
// exactly 100, since the UI presents these three numbers as parts of one 100%-wide bar.

test('SUM: home + draw + away always equals exactly 100, never 99 or 101', () => {
  // Exact real-world reproduction: two teams with identical recent points-per-game (no
  // formDelta) but a 0.3 vs 0.6 xG gap — feeds (home:43.5, draw:27, away:29.5) into this
  // function. The old three-independent-Math.round implementation produced
  // {home:44, draw:27, away:30} here, summing to 101.
  const regression = normalizeOutcomes(43.5, 27, 29.5);
  assert.equal(regression.home + regression.draw + regression.away, 100);
});

test('BOUNDARY: an exact .5 fractional share on both home and away never sums to 101', () => {
  // Real, currently-live production reproduction (match 564670, Real Racing Club de
  // Santander vs Deportivo Alavés, still reachable in the app's window as of this audit):
  // real team_form/xG inputs land on formDelta -6, xgDelta -3.500000000000001, producing
  // raw shares (35.5, 27, 37.5) into this function. JS's Math.round has no round-half-to-
  // even behaviour — it rounds every positive .5 up — so the OLD three-independent-
  // Math.round implementation rounds BOTH home (35.5->36) and away (37.5->38) up
  // simultaneously, producing {home:36, draw:27, away:38} = 101. This is the exact bug
  // still live in production right now: the fix below (committed in 5168cea) exists only
  // in this local history and has never been pushed, so the real GitHub Actions cron
  // (.github/workflows/data-pipeline.yml, every 6h against origin/main) is still running
  // the old code and re-persisting 101 on every run for any match whose inputs land on a
  // .5 boundary. This test locks in that the *code*, once actually deployed, is correct.
  const boundary = normalizeOutcomes(35.5, 27, 37.5);
  assert.equal(boundary.home + boundary.draw + boundary.away, 100);
});

test('BOUNDARY: fractional shares that would each independently round down never sum to 99', () => {
  // Synthetic but realistic triple (44.4/27.3/28.3, summing to exactly 100 before
  // rounding) where every individual share's fractional part is below .5 — the OLD
  // three-independent-Math.round implementation rounds all three DOWN (44/27/28 = 99).
  const wouldBeNinetyNine = normalizeOutcomes(44.4, 27.3, 28.3);
  assert.equal(wouldBeNinetyNine.home + wouldBeNinetyNine.draw + wouldBeNinetyNine.away, 100);
});

test('SUM: holds across a broad sweep of realistic form/xG-driven inputs', () => {
  const BASE_HOME = 45;
  const BASE_DRAW = 27;
  const BASE_AWAY = 28;
  for (let homePpg = 0; homePpg <= 3; homePpg += 0.2) {
    for (let awayPpg = 0; awayPpg <= 3; awayPpg += 0.2) {
      for (let xgHome = 0.3; xgHome <= 3.5; xgHome += 0.4) {
        for (let xgAway = 0.3; xgAway <= 3.5; xgAway += 0.4) {
          const formDelta = (homePpg - awayPpg) * 6;
          const xgDelta = (xgHome - xgAway) * 5;
          const o = normalizeOutcomes(BASE_HOME + formDelta + xgDelta, BASE_DRAW, BASE_AWAY - formDelta - xgDelta);
          assert.equal(o.home + o.draw + o.away, 100, `drifted for homePpg=${homePpg} awayPpg=${awayPpg} xgHome=${xgHome} xgAway=${xgAway}`);
        }
      }
    }
  }
});

test('DIRECTION: the largest raw share still ends up the largest rounded share', () => {
  const o = normalizeOutcomes(60, 20, 20);
  assert.ok(o.home > o.draw);
  assert.ok(o.home > o.away);
});

test('FLOOR: every share stays non-negative even for extreme deltas that push a raw share below zero', () => {
  const o = normalizeOutcomes(-30, 27, 130);
  assert.ok(o.home >= 0 && o.draw >= 0 && o.away >= 0);
  assert.equal(o.home + o.draw + o.away, 100);
});

test('EVEN SPLIT: three equal shares split as evenly as an integer 100 allows', () => {
  const o = normalizeOutcomes(1, 1, 1);
  assert.equal(o.home + o.draw + o.away, 100);
  // No single share should be forced more than 1 point away from the true 33.33 split.
  assert.ok(Math.abs(o.home - 33) <= 1 && Math.abs(o.draw - 33) <= 1 && Math.abs(o.away - 33) <= 1);
});
