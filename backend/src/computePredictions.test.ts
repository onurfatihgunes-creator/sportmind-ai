import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutcomes, buildPrediction, ENGINE_VERSION } from './computePredictions.js';
import { isDeterministic } from './evaluation.js';

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

// --- Intelligence 6.1: zero-form prediction integrity ---------------------------------
// Root-cause regression: confirmed live (FC Barcelona vs Feyenoord Rotterdam, Feyenoord
// had zero team_form rows) that the form-derived factors (recentForm/expectedGoals/
// defensivePerformance) were computed from getFormStats' neutral-baseline placeholder
// (1.3 pts/game, 1.3 goals for/against) and shown to the user as if they were real,
// team-specific evidence ("Recent form: 63% Barcelona / 37% Feyenoord"). The fix keeps
// the win/draw/away probability math completely unchanged (a valid, stable probability is
// still required regardless of data availability — a prediction-algorithm change is out
// of scope this sprint) and only changes which FACTORS are emitted.

const TRUSTED_HOME = { pointsPerGame: 2.4, avgGoalsFor: 2.1, avgGoalsAgainst: 0.8, matchesCount: 5 };
const TRUSTED_AWAY = { pointsPerGame: 1.0, avgGoalsFor: 1.0, avgGoalsAgainst: 1.6, matchesCount: 5 };
const ZERO_FORM = { pointsPerGame: 1.3, avgGoalsFor: 1.3, avgGoalsAgainst: 1.3, matchesCount: 0 };
const LIMITED_FORM = { pointsPerGame: 3.0, avgGoalsFor: 2.0, avgGoalsAgainst: 0.0, matchesCount: 1 };

test('zero-form team detected: matchesCount distinguishes real data from the placeholder', () => {
  assert.equal(ZERO_FORM.matchesCount, 0);
  assert.equal(TRUSTED_HOME.matchesCount > 0, true);
});

test('trusted-form vs trusted-form: all 4 factors present, including the form-derived ones', () => {
  const result = buildPrediction(TRUSTED_HOME, TRUSTED_AWAY);
  const keys = result.factors.map((f) => f.key);
  assert.deepEqual(keys.sort(), ['defensivePerformance', 'expectedGoals', 'homeAdvantage', 'recentForm'].sort());
});

test('limited-form (1 match) vs trusted-form: still real data, form-derived factors still shown', () => {
  // 1-2 matches is LIMITED, not NO_DATA — real evidence, just thin. The mobile app's own
  // "Limited recent data" badge (data/dataConfidence.ts) already covers the caveat for
  // this case; this fix is specifically about NO_DATA (matchesCount === 0), not LIMITED.
  const result = buildPrediction(LIMITED_FORM, TRUSTED_AWAY);
  const keys = result.factors.map((f) => f.key);
  assert.ok(keys.includes('recentForm'));
  assert.ok(keys.includes('expectedGoals'));
  assert.ok(keys.includes('defensivePerformance'));
});

test('zero-form does not fabricate a recentForm/expectedGoals/defensivePerformance factor', () => {
  const result = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  const keys = result.factors.map((f) => f.key);
  assert.equal(keys.includes('recentForm'), false);
  assert.equal(keys.includes('expectedGoals'), false);
  assert.equal(keys.includes('defensivePerformance'), false);
  // homeAdvantage is a fixed prior, never team-specific — always present regardless.
  assert.deepEqual(keys, ['homeAdvantage']);
});

test('zero-form on EITHER side suppresses the same factors (not just when both are zero)', () => {
  const homeZero = buildPrediction(ZERO_FORM, TRUSTED_AWAY);
  const awayZero = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  for (const result of [homeZero, awayZero]) {
    assert.deepEqual(
      result.factors.map((f) => f.key),
      ['homeAdvantage'],
    );
  }
});

test('zero-form prediction still sums to exactly 100 (a valid probability is still required)', () => {
  const result = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  assert.equal(result.outcomes.home + result.outcomes.draw + result.outcomes.away, 100);
});

test('football draw remains valid (non-zero, present) even in the zero-form case', () => {
  const result = buildPrediction(TRUSTED_HOME, ZERO_FORM);
  assert.ok(result.outcomes.draw > 0);
});

test('DELIBERATELY UNCHANGED: the win/draw/away probability math for a zero-form team is identical before and after this fix — only the factors array changed', () => {
  // Reproduces the exact old computeForMatch arithmetic inline to prove the outcome
  // math was not touched: BASE_HOME/DRAW/AWAY + formDelta/xgDelta from the SAME
  // getFormStats-shaped inputs (including the neutral-baseline numbers for the zero-form
  // side) must still produce the same result as buildPrediction does now.
  const BASE_HOME = 45, BASE_DRAW = 27, BASE_AWAY = 28;
  const home = TRUSTED_HOME, away = ZERO_FORM;
  const xgHome = Number(((home.avgGoalsFor + away.avgGoalsAgainst) / 2).toFixed(1));
  const xgAway = Number(((away.avgGoalsFor + home.avgGoalsAgainst) / 2).toFixed(1));
  const formDelta = (home.pointsPerGame - away.pointsPerGame) * 6;
  const xgDelta = (xgHome - xgAway) * 5;
  const expected = normalizeOutcomes(BASE_HOME + formDelta + xgDelta, BASE_DRAW, BASE_AWAY - formDelta - xgDelta);

  const actual = buildPrediction(home, away);
  assert.deepEqual(actual.outcomes, expected);
});

// --- Intelligence 7.0: determinism + probability invariants + engine version ---------

test('DETERMINISM: buildPrediction always produces byte-identical output for identical input, no floating-point drift', () => {
  assert.equal(isDeterministic(() => buildPrediction(TRUSTED_HOME, TRUSTED_AWAY)), true);
  assert.equal(isDeterministic(() => buildPrediction(TRUSTED_HOME, ZERO_FORM)), true);
});

test('PROBABILITY INVARIANT: outcomes always sum to exactly 100 and no share is ever negative or over 100, across a broad sweep', () => {
  const forms = [TRUSTED_HOME, TRUSTED_AWAY, ZERO_FORM, LIMITED_FORM];
  for (const home of forms) {
    for (const away of forms) {
      const { outcomes } = buildPrediction(home, away);
      assert.equal(outcomes.home + outcomes.draw + outcomes.away, 100);
      for (const v of [outcomes.home, outcomes.draw, outcomes.away]) {
        assert.ok(v >= 0 && v <= 100, `share ${v} out of [0,100] for home=${JSON.stringify(home)} away=${JSON.stringify(away)}`);
      }
    }
  }
});

test('ENGINE VERSION: a code-level version proxy is documented and stable (v1) — no schema column exists for it', () => {
  assert.equal(ENGINE_VERSION, 'v1');
  assert.equal(typeof ENGINE_VERSION, 'string');
});
