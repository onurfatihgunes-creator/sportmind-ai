import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPredictionBeforeKickoff,
  checkProbabilitySum,
  checkProbabilityRange,
  checkFootballThreeWay,
  checkBasketballTwoWay,
  checkSportIsolation,
  checkCrossSportNameCollisionRisk,
  findDuplicateFixtures,
  checkOrphanPrediction,
  checkStaleScheduled,
  checkZeroFormFactorIntegrity,
  predictionWritesAreScopedToScheduledMatchesOnly,
  classifyFreshness,
  dataConfidenceIsIndependentOfPredictionProbability,
} from './integrity.js';

// --- A/B: prediction lifecycle + temporal integrity ---

test('B. PASS: a prediction computed strictly before kickoff', () => {
  assert.equal(checkPredictionBeforeKickoff('2026-01-01T09:00:00Z', '2026-01-01T12:00:00Z').verdict, 'PASS');
});

test('B. NEGATIVE TEST — FAIL: prediction after kickoff', () => {
  const result = checkPredictionBeforeKickoff('2026-01-02T00:00:00Z', '2026-01-01T12:00:00Z');
  assert.equal(result.verdict, 'FAIL');
});

test('B. NEGATIVE TEST — FAIL: prediction exactly at kickoff (no genuine pre-match gap)', () => {
  assert.equal(checkPredictionBeforeKickoff('2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z').verdict, 'FAIL');
});

// --- K: probability invariants ---

test('K. PASS: a valid football prediction (sums to 100, in range, 3-way)', () => {
  const p = { home_win_pct: 45, draw_pct: 27, away_win_pct: 28 };
  assert.equal(checkProbabilitySum(p).verdict, 'PASS');
  assert.equal(checkProbabilityRange(p).verdict, 'PASS');
  assert.equal(checkFootballThreeWay(p).verdict, 'PASS');
});

test('K. NEGATIVE TEST — FAIL: probability >100 injected', () => {
  const p = { home_win_pct: 105, draw_pct: 27, away_win_pct: -32 };
  assert.equal(checkProbabilityRange(p).verdict, 'FAIL');
});

test('K. NEGATIVE TEST — FAIL: probability <0 injected', () => {
  const p = { home_win_pct: -5, draw_pct: 50, away_win_pct: 55 };
  assert.equal(checkProbabilityRange(p).verdict, 'FAIL');
});

test('K. NEGATIVE TEST — FAIL: sum != 100', () => {
  const p = { home_win_pct: 40, draw_pct: 30, away_win_pct: 40 };
  assert.equal(checkProbabilitySum(p).verdict, 'FAIL');
});

// --- Q/P: football 3-way / basketball 2-way semantics ---

test('Q. NEGATIVE TEST — FAIL: football prediction injected as 2-way (draw_pct=0)', () => {
  const p = { home_win_pct: 55, draw_pct: 0, away_win_pct: 45 };
  assert.equal(checkFootballThreeWay(p).verdict, 'FAIL');
});

test('P. PASS: a valid basketball prediction (draw_pct=0)', () => {
  const p = { home_win_pct: 58, draw_pct: 0, away_win_pct: 42 };
  assert.equal(checkBasketballTwoWay(p).verdict, 'PASS');
});

test('P. NEGATIVE TEST — FAIL: basketball prediction injected as 3-way (nonzero draw_pct)', () => {
  const p = { home_win_pct: 50, draw_pct: 10, away_win_pct: 40 };
  assert.equal(checkBasketballTwoWay(p).verdict, 'FAIL');
});

// --- F: sport isolation ---

test('F. PASS: both teams belong to the match\'s own sport', () => {
  assert.equal(checkSportIsolation('football', 'football', 'football').verdict, 'PASS');
});

test('F. NEGATIVE TEST — FAIL: wrong sport injected on one side (basketball team in a football match)', () => {
  const result = checkSportIsolation('football', 'football', 'basketball');
  assert.equal(result.verdict, 'FAIL');
});

test('F. cross-sport name collision risk: WARN when the code has no filter but no real collision exists yet', () => {
  const result = checkCrossSportNameCollisionRisk(['Liverpool', 'Chelsea'], ['Boston Celtics', 'LA Lakers']);
  assert.equal(result.verdict, 'WARN');
});

test('F. NEGATIVE TEST — FAIL: cross-sport name collision injected (a real ambiguous pair)', () => {
  const result = checkCrossSportNameCollisionRisk(['Hawks'], ['Atlanta Hawks']);
  assert.equal(result.verdict, 'FAIL');
});

// --- I: fixture identity / duplicate logical fixture ---

test('I. PASS-equivalent: two different games on the same UTC calendar date but far apart in time are NOT duplicates', () => {
  // Real case found during this sprint's own audit: two distinct NBA games between the same
  // two teams, kickoff 01:00 UTC and 23:00 UTC on the same UTC date (different US calendar days).
  const rows = [
    { id: 'bdl-1', sport: 'basketball', competition: 'NBA', home_team_id: 'bdl-16', away_team_id: 'bdl-5', kickoff_at: '2026-02-01T01:00:00Z' },
    { id: 'bdl-2', sport: 'basketball', competition: 'NBA', home_team_id: 'bdl-16', away_team_id: 'bdl-5', kickoff_at: '2026-02-01T23:00:00Z' },
  ];
  assert.deepEqual(findDuplicateFixtures(rows), []);
});

test('I. NEGATIVE TEST — duplicate fixture detected: two rows for the same fixture within tolerance', () => {
  const rows = [
    { id: 'a', sport: 'football', competition: 'Premier League', home_team_id: 'h1', away_team_id: 'a1', kickoff_at: '2026-03-01T15:00:00Z' },
    { id: 'b', sport: 'football', competition: 'Premier League', home_team_id: 'h1', away_team_id: 'a1', kickoff_at: '2026-03-01T15:02:00Z' },
  ];
  const duplicates = findDuplicateFixtures(rows);
  assert.equal(duplicates.length, 1);
  assert.deepEqual([duplicates[0].a, duplicates[0].b].sort(), ['a', 'b']);
});

// --- orphan prediction ---

test('NEGATIVE TEST — FAIL: orphan prediction (match_id with no matching match row)', () => {
  const known = new Set(['m1', 'm2']);
  assert.equal(checkOrphanPrediction('m1', known).verdict, 'PASS');
  assert.equal(checkOrphanPrediction('m999', known).verdict, 'FAIL');
});

// --- N: stale scheduled protection ---

test('N. PASS: a scheduled match within the grace window', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  assert.equal(checkStaleScheduled('scheduled', '2026-09-07T00:00:00Z', 3, now).verdict, 'PASS');
});

test('N. NEGATIVE TEST — WARN (not FAIL): a genuinely stale scheduled match beyond the grace window', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  const result = checkStaleScheduled('scheduled', '2026-08-01T00:00:00Z', 3, now);
  assert.equal(result.verdict, 'WARN');
});

test('N. finished/postponed matches are never flagged regardless of age', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  assert.equal(checkStaleScheduled('finished', '2026-01-01T00:00:00Z', 3, now).verdict, 'PASS');
});

// --- D: zero-data integrity ---

test('D. PASS: both teams have form -> 4 real factors', () => {
  assert.equal(checkZeroFormFactorIntegrity(5, 5, 4).verdict, 'PASS');
});

test('D. PASS: one team has zero form -> correctly reduced to 1 factor', () => {
  assert.equal(checkZeroFormFactorIntegrity(0, 5, 1).verdict, 'PASS');
});

test('D. NEGATIVE TEST — FAIL: zero-form fabrication injected (zero form but 4 factors stored)', () => {
  const result = checkZeroFormFactorIntegrity(0, 5, 4);
  assert.equal(result.verdict, 'FAIL');
});

// --- L: historical immutability ---

test('L. historical immutability is pinned as a structural, tested claim', () => {
  assert.equal(predictionWritesAreScopedToScheduledMatchesOnly(), true);
});

// --- C: data freshness ---

test('C. freshness: UNKNOWN when there is no timestamp at all (e.g. team_form)', () => {
  assert.equal(classifyFreshness(null, 7), 'UNKNOWN');
});

test('C. freshness: FRESH within the codified refresh interval, AGING just past it, STALE well past it', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  assert.equal(classifyFreshness('2026-09-03T00:00:00Z', 7, now), 'FRESH'); // 5 days old, interval=7
  assert.equal(classifyFreshness('2026-08-25T00:00:00Z', 7, now), 'AGING'); // 14 days old
  assert.equal(classifyFreshness('2026-07-01T00:00:00Z', 7, now), 'STALE'); // ~69 days old
});

// --- R: data confidence vs prediction confidence ---

test('R. data confidence and prediction confidence are pinned as independently-computed fields', () => {
  assert.equal(dataConfidenceIsIndependentOfPredictionProbability(), true);
});
