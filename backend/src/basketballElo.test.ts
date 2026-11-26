import test from 'node:test';
import assert from 'node:assert/strict';
import { ELO_PARAMS, movMultiplier, runElo, winProbability, type EloGame } from './basketballElo.js';
import { isDeterministic } from './evaluation.js';

const H = 3_600_000;
const D = 24 * H;
const g = (id: string, home: string, away: string, t: number, hs: number | null, as: number | null): EloGame => ({ id, home, away, t, homeScore: hs, awayScore: as });

test('pre-registered parameters are the documented ones (changing them restarts the shadow test)', () => {
  assert.equal(ELO_PARAMS.k, 20);
  assert.equal(ELO_PARAMS.homeAdvantage, 40);
  assert.equal(ELO_PARAMS.backToBackPenalty, 25);
});

test('win probability: symmetric, 0.5 at equal strength, home advantage alone ~56%', () => {
  assert.equal(winProbability(0), 0.5);
  assert.ok(Math.abs(winProbability(150) + winProbability(-150) - 1) < 1e-12);
  const first = runElo([g('1', 'A', 'B', 0, null, null)]).get('1')!;
  assert.ok(Math.abs(first.pHome - winProbability(40)) < 1e-12);
  assert.ok(first.pHome > 0.55 && first.pHome < 0.56);
});

test('margin multiplier grows with the margin and shrinks for an expected (favourite) win', () => {
  assert.ok(movMultiplier(20, 0) > movMultiplier(5, 0));
  assert.ok(movMultiplier(10, 200) < movMultiplier(10, 0));
});

test('no leakage: a game never sees its own result', () => {
  const a = runElo([g('1', 'A', 'B', 0, 120, 100), g('2', 'A', 'B', 2 * D, 130, 90)]);
  const b = runElo([g('1', 'A', 'B', 0, 120, 100), g('2', 'A', 'B', 2 * D, 80, 140)]);
  assert.equal(a.get('2')!.pHome, b.get('2')!.pHome);
});

test("a winner gains rating at the loser's expense", () => {
  const pre = runElo([g('1', 'A', 'B', 0, 120, 100), g('2', 'B', 'A', 2 * D, null, null)]);
  // A beat B at home; when B hosts A next, B gets less than the bare home-advantage probability
  assert.ok(pre.get('2')!.pHome < winProbability(40));
});

test('unfinished games get a probability but do not move ratings or rest', () => {
  const pre = runElo([g('1', 'A', 'B', 0, null, null), g('2', 'A', 'B', 20 * H, null, null)]);
  assert.equal(pre.get('2')!.pHome, pre.get('1')!.pHome);
  assert.equal(pre.get('2')!.homeBackToBack, false);
});

test('back-to-back: detected within 36h and penalises only the tired side in the rest variant', () => {
  const pre = runElo([g('1', 'A', 'C', 0, 110, 100), g('2', 'A', 'B', 24 * H, null, null)]).get('2')!;
  assert.equal(pre.homeBackToBack, true);
  assert.equal(pre.awayBackToBack, false);
  assert.ok(pre.pHomeRest < pre.pHome);
  const rested = runElo([g('1', 'A', 'C', 0, 110, 100), g('2', 'A', 'B', 3 * D, null, null)]).get('2')!;
  assert.equal(rested.homeBackToBack, false);
  assert.equal(rested.pHomeRest, rested.pHome);
});

test('new season: a long idle gap reverts a rating 25% toward 1505', () => {
  const games = [g('1', 'A', 'B', 0, 140, 90), g('2', 'A', 'B', 2 * D, 140, 90), g('3', 'A', 'B', 100 * D, null, null)];
  const withGap = runElo(games).get('3')!.pHome;
  const noGap = runElo([...games.slice(0, 2), g('3', 'A', 'B', 4 * D, null, null)]).get('3')!.pHome;
  assert.ok(withGap < noGap); // the strong team's edge shrinks after the off-season
  assert.equal(isDeterministic(() => runElo(games).get('3')!.pHome), true);
});
