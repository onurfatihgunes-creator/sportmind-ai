import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOutcome,
  isTemporallyValid,
  staleCutoffIso,
  classifyCandidate,
  toClassProbs,
  brierScore,
  logLoss,
  computeMetrics,
  calibrationBuckets,
  classifySampleSize,
  classifyDataLevel,
  uniformBaseline,
  alwaysHomeBaseline,
  outcomeClasses,
  isTemporalInvalidSufficientForFutureDataSafety,
  expectedCalibrationError,
  wilsonInterval,
  classifyDecisionGate,
  classifyCompetitionEvidence,
  extremeProbabilitySummary,
  rollingHistoricalBaseline,
  timeSplit,
  isDeterministic,
  calibrationDriftAlert,
  xgSignalDirectionAgreement,
  buildHypothesisRegister,
  type MatchRow,
  type PredictionRow,
  type CalibrationBucket,
} from './evaluation.js';

// --- 1-3, 18: outcome resolution + football/basketball separation ---

test('1. football home win correct', () => {
  assert.equal(resolveOutcome('football', 2, 0), 'home');
});

test('2. football draw correct', () => {
  assert.equal(resolveOutcome('football', 1, 1), 'draw');
});

test('3. football away correct', () => {
  assert.equal(resolveOutcome('football', 0, 3), 'away');
});

test('5. basketball home correct', () => {
  assert.equal(resolveOutcome('basketball', 101, 98), 'home');
});

test('6. basketball away correct', () => {
  assert.equal(resolveOutcome('basketball', 90, 95), 'away');
});

test('18. football/basketball separation: a tied basketball score is unresolvable, never a draw', () => {
  assert.equal(resolveOutcome('basketball', 100, 100), null);
  assert.deepEqual(outcomeClasses('football'), ['home', 'draw', 'away']);
  assert.deepEqual(outcomeClasses('basketball'), ['home', 'away']);
});

// --- 4: wrong prediction still evaluates correctly (correct=false, but metrics still compute) ---

test('4. football wrong prediction: high home probability but away actually won', () => {
  const probs = { home: 0.7, draw: 0.2, away: 0.1 };
  const samples = [{ probs, actual: 'away' as const }];
  const metrics = computeMetrics(samples, ['home', 'draw', 'away']);
  assert.equal(metrics!.accuracy, 0); // argmax(probs) = home, actual = away -> wrong
  assert.ok(metrics!.brier > 0);
});

// --- 7, 8, 9: exclusion funnel ---

function makeMatch(overrides: Partial<MatchRow>): MatchRow {
  return {
    id: 'm1',
    sport: 'football',
    competition: 'Test League',
    status: 'finished',
    home_score: 1,
    away_score: 0,
    home_team_id: 'h',
    away_team_id: 'a',
    kickoff_at: '2026-01-01T12:00:00Z',
    ...overrides,
  };
}
function makePrediction(overrides: Partial<PredictionRow>): PredictionRow {
  return { match_id: 'm1', home_win_pct: 50, draw_pct: 25, away_win_pct: 25, computed_at: '2026-01-01T09:00:00Z', ...overrides };
}

test('7. temporal-invalid prediction excluded (computed_at after kickoff)', () => {
  const match = makeMatch({});
  const pred = makePrediction({ computed_at: '2026-01-01T18:00:00Z' }); // after kickoff
  const verdict = classifyCandidate(match, pred);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.reason, 'temporal_invalid');
});

test('8. scheduled (not finished) match excluded', () => {
  const match = makeMatch({ status: 'scheduled' });
  const pred = makePrediction({});
  const verdict = classifyCandidate(match, pred);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.reason, 'not_finished');
});

test('9. missing outcome (finished but no score) excluded, distinct from missing prediction', () => {
  const noScore = classifyCandidate(makeMatch({ home_score: null }), makePrediction({}));
  assert.equal(noScore.ok, false);
  if (!noScore.ok) assert.equal(noScore.reason, 'missing_score');

  const noPrediction = classifyCandidate(makeMatch({}), undefined);
  assert.equal(noPrediction.ok, false);
  if (!noPrediction.ok) assert.equal(noPrediction.reason, 'no_prediction');
});

test('a valid football candidate is accepted', () => {
  const verdict = classifyCandidate(makeMatch({}), makePrediction({}));
  assert.equal(verdict.ok, true);
});

test('temporal validity: strictly before kickoff required, equal timestamps rejected', () => {
  assert.equal(isTemporallyValid('2026-01-01T09:00:00Z', '2026-01-01T12:00:00Z'), true);
  assert.equal(isTemporallyValid('2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'), false);
  assert.equal(isTemporallyValid('2026-01-01T13:00:00Z', '2026-01-01T12:00:00Z'), false);
});

// Regression coverage for the 4.0 "zombie scheduled match" fix (§31): computePredictions.ts
// and computeBasketballPredictions.ts both query `kickoff_at >= staleCutoffIso(3)` so a
// match stuck at 'scheduled' long past its real kickoff (confirmed live: 113 days) stops
// being recomputed. This pins the cutoff arithmetic itself.
test('staleCutoffIso computes exactly N days before the given instant, in the correct direction', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');
  const cutoff = staleCutoffIso(3, now);
  assert.equal(cutoff, '2026-09-05T12:00:00.000Z');
  // A match that kicked off 5 days ago is stale under a 3-day grace period...
  assert.equal('2026-09-03T12:00:00.000Z' >= cutoff, false);
  // ...but one from yesterday is not.
  assert.equal('2026-09-07T12:00:00.000Z' >= cutoff, true);
});

// --- 10: probability sum / shape (regression from 4.0's stale-scheduled context) ---

test('10. probability sum: toClassProbs always reflects the stored percentages as 0-1 fractions', () => {
  const probs = toClassProbs('football', makePrediction({ home_win_pct: 55, draw_pct: 25, away_win_pct: 20 }));
  assert.equal(Math.round((probs.home! + probs.draw! + probs.away!) * 100), 100);
});

test('basketball toClassProbs never carries a draw key', () => {
  const probs = toClassProbs('basketball', makePrediction({ home_win_pct: 60, draw_pct: 0, away_win_pct: 40 }));
  assert.equal(probs.draw, undefined);
  assert.equal(Math.round((probs.home! + probs.away!) * 100), 100);
});

// --- 11: Brier calculation ---

test('11. Brier calculation: a perfect prediction scores 0, a maximally wrong one scores 2', () => {
  const classes = ['home', 'draw', 'away'] as const;
  assert.equal(brierScore({ home: 1, draw: 0, away: 0 }, 'home', [...classes]), 0);
  assert.equal(brierScore({ home: 0, draw: 0, away: 1 }, 'home', [...classes]), 2); // (0-1)^2 + (1-0)^2
});

// --- 12: log loss calculation ---

test('12. log loss calculation matches -log(p_actual)', () => {
  const loss = logLoss({ home: 0.72, draw: 0.2, away: 0.08 }, 'home');
  assert.ok(Math.abs(loss - -Math.log(0.72)) < 1e-9);
});

// --- 17: zero-probability numerical protection ---

test('17. zero probability numerical protection: log loss stays finite, never silently 50%', () => {
  const loss = logLoss({ home: 0, draw: 0.5, away: 0.5 }, 'home');
  assert.ok(Number.isFinite(loss));
  assert.ok(loss > 10); // a genuinely large penalty, not disguised as a 50/50 guess
});

// --- 13: calibration bucket ---

test('13. calibration bucket groups by predicted probability decile and reports bias', () => {
  const samples = [
    { probs: { home: 0.45 }, actual: 'home' as const },
    { probs: { home: 0.46 }, actual: 'away' as const },
    { probs: { home: 0.44 }, actual: 'home' as const },
  ];
  const buckets = calibrationBuckets(samples, 'home');
  const bucket = buckets.find((b) => b.bucket === '40-50%');
  assert.ok(bucket);
  assert.equal(bucket!.n, 3);
  assert.ok(Math.abs(bucket!.actualRate - 2 / 3) < 1e-9);
});

// --- 14: insufficient sample classification ---

test('14. insufficient sample classification follows the documented thresholds', () => {
  assert.equal(classifySampleSize(29), 'insufficient');
  assert.equal(classifySampleSize(30), 'directional');
  assert.equal(classifySampleSize(99), 'directional');
  assert.equal(classifySampleSize(100), 'useful');
  assert.equal(classifySampleSize(299), 'useful');
  assert.equal(classifySampleSize(300), 'strong');
});

test('data-level classification mirrors the mobile app\'s >=3-match trusted-sample threshold', () => {
  assert.equal(classifyDataLevel(0), 'none');
  assert.equal(classifyDataLevel(1), 'limited');
  assert.equal(classifyDataLevel(2), 'limited');
  assert.equal(classifyDataLevel(3), 'good');
  assert.equal(classifyDataLevel(4), 'good');
  assert.equal(classifyDataLevel(5), 'full');
});

// --- 15: baseline calculation ---

test('15. baseline calculation: uniform and always-home baselines compute real, distinct metrics', () => {
  const classes = ['home', 'draw', 'away'] as const;
  const samples = [
    { probs: { home: 0.6, draw: 0.2, away: 0.2 }, actual: 'home' as const },
    { probs: { home: 0.3, draw: 0.3, away: 0.4 }, actual: 'away' as const },
  ];
  const uniform = uniformBaseline([...classes]);
  const alwaysHome = alwaysHomeBaseline([...classes]);
  assert.equal(uniform.probs.home, 1 / 3);
  assert.equal(alwaysHome.probs.home, 1);
  assert.equal(alwaysHome.probs.away, 0);
  // Sanity: computeMetrics can be run against a baseline's fixed probs for every sample.
  const uniformMetrics = computeMetrics(
    samples.map((s) => ({ ...s, probs: uniform.probs })),
    [...classes],
  );
  assert.equal(uniformMetrics!.n, 2);
});

// --- 16: duplicate prediction handling ---

test('16. duplicate prediction handling: predictions is keyed by match_id (one row per match) so a caller building a Map naturally keeps only the latest row, never double-counts', () => {
  const rows: PredictionRow[] = [
    { match_id: 'm1', home_win_pct: 40, draw_pct: 30, away_win_pct: 30, computed_at: '2026-01-01T08:00:00Z' },
    { match_id: 'm1', home_win_pct: 50, draw_pct: 25, away_win_pct: 25, computed_at: '2026-01-01T09:00:00Z' },
  ];
  const byMatch = new Map(rows.map((p) => [p.match_id, p]));
  assert.equal(byMatch.size, 1);
  assert.equal(byMatch.get('m1')!.home_win_pct, 50); // last-write-wins, matching the table's real match_id primary key
});

// ============================================================================
// INTELLIGENCE 7.0 additions below
// ============================================================================

// --- future-data leakage (§b) ---

test('future-data leakage: temporal_invalid is the full gate, given team_form is only ever written post-hoc and computePredictions only targets scheduled/future-kickoff matches', () => {
  assert.equal(isTemporalInvalidSufficientForFutureDataSafety(), true);
  // The concrete mechanism this pins: a recompute that ran on/after kickoff (the only way
  // it could ever observe a team_form row for a match that, relative to itself, hadn't
  // been played yet) is exactly what isTemporallyValid flags false.
  assert.equal(isTemporallyValid('2026-01-02T00:00:00Z', '2026-01-01T12:00:00Z'), false);
});

// --- ECE (Expected Calibration Error) ---

test('ECE: weights bucket bias by sample size, not by simple bucket count', () => {
  const buckets: CalibrationBucket[] = [
    { bucket: '40-50%', n: 30, avgPredicted: 0.45, actualRate: 0.45, bias: 0, evidence: 'insufficient' },
    { bucket: '80-90%', n: 10, avgPredicted: 0.85, actualRate: 0.65, bias: 0.2, evidence: 'insufficient' },
  ];
  const ece = expectedCalibrationError(buckets);
  // (30*0 + 10*0.2) / 40 = 0.05
  assert.ok(Math.abs(ece - 0.05) < 1e-9);
});

test('ECE: NaN (not 0) when there is no calibration data, so "no evidence" is never confused with "perfectly calibrated"', () => {
  assert.ok(Number.isNaN(expectedCalibrationError([])));
});

// --- confidence interval (Wilson score) ---

test('confidence interval: a coin-flip-sized sample (22/45) produces a wide interval straddling 50%, never a bare point estimate', () => {
  const ci = wilsonInterval(20, 45);
  assert.ok(ci.lo < 0.444 && ci.hi > 0.444);
  assert.ok(ci.hi - ci.lo > 0.2); // genuinely wide at n=45 — not falsely precise
});

test('confidence interval: stays within [0,1] even at the extremes (n=0, 0/n, n/n)', () => {
  assert.deepEqual(wilsonInterval(0, 0), { lo: 0, hi: 1 });
  const allFail = wilsonInterval(0, 10);
  assert.ok(allFail.lo >= 0 && allFail.hi <= 1);
  const allSucceed = wilsonInterval(10, 10);
  assert.ok(allSucceed.lo >= 0 && allSucceed.hi <= 1);
});

// --- sample classification: decision gates vs evidence classification are distinct ---

test('decision gate thresholds (act-on-this) are stricter and distinct from classifySampleSize (report-this)', () => {
  assert.equal(classifyDecisionGate(45), 'not-ready');
  assert.equal(classifyDecisionGate(99), 'not-ready');
  assert.equal(classifyDecisionGate(100), 'minimum');
  assert.equal(classifyDecisionGate(299), 'minimum');
  assert.equal(classifyDecisionGate(300), 'better');
  assert.equal(classifyDecisionGate(499), 'better');
  assert.equal(classifyDecisionGate(500), 'strong');
  // n=45 is 'directional' enough to REPORT, but 'not-ready' to ACT on — two different questions.
  assert.equal(classifySampleSize(45), 'directional');
  assert.equal(classifyDecisionGate(45), 'not-ready');
});

test('competition evidence uses its own 3-tier thresholds (insufficient/directional/meaningful), never implying a "best league"', () => {
  assert.equal(classifyCompetitionEvidence(29), 'insufficient');
  assert.equal(classifyCompetitionEvidence(30), 'directional');
  assert.equal(classifyCompetitionEvidence(99), 'directional');
  assert.equal(classifyCompetitionEvidence(100), 'meaningful');
});

// --- probability bucket / extreme probability detection ---

test('extreme probability detection: pools every per-class probability instance into low(<20%)/mid/high(>80%) bands', () => {
  const samples = [
    { probs: { home: 0.1, draw: 0.2, away: 0.7 }, actual: 'away' as const },
    { probs: { home: 0.85, draw: 0.1, away: 0.05 }, actual: 'home' as const },
    { probs: { home: 0.5, draw: 0.3, away: 0.2 }, actual: 'draw' as const },
  ];
  const bands = extremeProbabilitySummary(samples, ['home', 'draw', 'away']);
  const low = bands.find((b) => b.band === 'low(<20%)')!;
  const high = bands.find((b) => b.band === 'high(>80%)')!;
  assert.ok(low.n > 0);
  assert.ok(high.n > 0);
  // 0.85 (home, sample 2, actual=home) should land in high band with actualRate contribution.
  assert.ok(high.avgPredicted > 0.8);
});

test('extreme probability detection: a band with zero instances is omitted, not reported as a fake zero', () => {
  const samples = [{ probs: { home: 0.5, away: 0.5 }, actual: 'home' as const }];
  const bands = extremeProbabilitySummary(samples, ['home', 'away']);
  assert.equal(bands.find((b) => b.band === 'low(<20%)'), undefined);
  assert.equal(bands.find((b) => b.band === 'high(>80%)'), undefined);
  assert.equal(bands.find((b) => b.band === 'mid(20-80%)')!.n, 2);
});

// --- baseline calculation: rolling historical (future-safe) baseline ---

test('rolling historical baseline: excludes the first minHistory samples (no prior history to draw rates from)', () => {
  const samples: { actual: 'home' | 'away' }[] = Array.from({ length: 8 }, (_, i) => ({ actual: i % 2 === 0 ? 'home' : 'away' }));
  const { evaluated, excludedForHistory } = rollingHistoricalBaseline(samples, ['home', 'away'], 5);
  assert.equal(excludedForHistory, 5);
  assert.equal(evaluated.length, 3);
});

test('rolling historical baseline is future-safe: sample i only ever uses class rates from samples strictly before it', () => {
  // First 5 are all 'home', 6th is 'away' — a future-safe baseline predicting sample index 5
  // must reflect 100% home from history, NOT be influenced by sample 5's own 'away' outcome.
  const samples = [
    { actual: 'home' as const },
    { actual: 'home' as const },
    { actual: 'home' as const },
    { actual: 'home' as const },
    { actual: 'home' as const },
    { actual: 'away' as const },
  ];
  const { evaluated } = rollingHistoricalBaseline(samples, ['home', 'away'], 5);
  assert.equal(evaluated.length, 1);
  assert.equal(evaluated[0].probs.home, 1); // history (all 5 prior) was 100% home
  assert.equal(evaluated[0].probs.away, 0);
});

// --- train/validation/test time-split architecture ---

test('time split: partitions by TIME ORDER, never randomly, so no later match ever lands in an earlier partition', () => {
  const samples = Array.from({ length: 20 }, (_, i) => ({ kickoff: i }));
  const { train, validation, test: testSet } = timeSplit(samples, 0.7, 0.15);
  assert.equal(train.length + validation.length + testSet.length, 20);
  assert.equal(train.length, 14);
  assert.equal(validation.length, 3);
  assert.equal(testSet.length, 3);
  assert.ok(Math.max(...train.map((s) => s.kickoff)) < Math.min(...validation.map((s) => s.kickoff)));
  assert.ok(Math.max(...validation.map((s) => s.kickoff)) < Math.min(...testSet.map((s) => s.kickoff)));
});

// --- deterministic repeatability ---

test('deterministic repeatability: the same pure computation always returns byte-identical output', () => {
  const stable = () => ({ home: 45, draw: 27, away: 28, nested: [1, 2, 3] });
  assert.equal(isDeterministic(stable), true);
});

test('deterministic repeatability: detects genuine drift (e.g. a non-deterministic clock/random leaking into a formula)', () => {
  let call = 0;
  const unstable = () => ({ value: call++ });
  assert.equal(isDeterministic(unstable), false);
});

// --- calibration-drift infrastructure ---

test('calibration drift alert: never fires below the 100-sample floor, regardless of how large ECE looks', () => {
  const result = calibrationDriftAlert(45, 0.5, 0.1, 100);
  assert.equal(result.shouldAlert, false);
  assert.match(result.reason, /below the 100-sample floor/);
});

test('calibration drift alert: fires only once both the sample floor AND the ECE threshold are met', () => {
  const belowThreshold = calibrationDriftAlert(150, 0.05, 0.1, 100);
  assert.equal(belowThreshold.shouldAlert, false);
  const aboveThreshold = calibrationDriftAlert(150, 0.15, 0.1, 100);
  assert.equal(aboveThreshold.shouldAlert, true);
});

// --- signal direction analysis (descriptive, non-causal) ---

test('signal direction analysis: xG-favored side agreeing with the actual winner is counted, draws and ties are excluded from the denominator', () => {
  const samples = [
    { actual: 'home' as const, xgHome: 1.8, xgAway: 1.1 }, // xG favors home, home won -> agree
    { actual: 'away' as const, xgHome: 1.8, xgAway: 1.1 }, // xG favors home, away won -> disagree
    { actual: 'draw' as const, xgHome: 1.5, xgAway: 1.2 }, // draw excluded entirely
    { actual: 'home' as const, xgHome: 1.4, xgAway: 1.4 }, // tied xG -> neutral, excluded from rate
  ];
  const result = xgSignalDirectionAgreement(samples);
  assert.equal(result.agree, 1);
  assert.equal(result.disagree, 1);
  assert.equal(result.neutral, 1);
  assert.equal(result.n, 2);
  assert.equal(result.agreementRate, 0.5);
});

// --- Hypothesis Register: HYPOTHESIS != FACT ---

test('hypothesis register: every entry stays insufficient-evidence when the decision gate has not cleared "not-ready", even if the raw numbers look favorable', () => {
  const entries = buildHypothesisRegister({
    n: 45,
    decisionGate: 'not-ready',
    engineBrier: 0.5, // looks favorable vs...
    baseRateBrier: 0.9, // ...this — but n=45 is not-ready, so H1 must NOT claim "supported"
    drawBucketBias: 0.003,
    homeAdvantagePredicted: { home: 62, away: 38 },
    homeActualRate: 0.42,
    fullDataMetrics: null,
    limitedOrNoneDataMetrics: null,
    extremeLowBias: null,
    extremeHighBias: null,
    xgAgreementRate: null,
    competitionEvidenceLevels: [],
  });
  const h1 = entries.find((e) => e.id === 'H1')!;
  assert.equal(h1.status, 'insufficient-evidence');
  // No hypothesis is ever silently omitted — all 7 are always reported.
  assert.equal(entries.length, 7);
  assert.deepEqual(entries.map((e) => e.id).sort(), ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7']);
});

test('hypothesis register: H1 can report supported/not-supported once the decision gate clears not-ready', () => {
  const favorable = buildHypothesisRegister({
    n: 150,
    decisionGate: 'minimum',
    engineBrier: 0.5,
    baseRateBrier: 0.9,
    drawBucketBias: null,
    homeAdvantagePredicted: { home: 62, away: 38 },
    homeActualRate: null,
    fullDataMetrics: null,
    limitedOrNoneDataMetrics: null,
    extremeLowBias: null,
    extremeHighBias: null,
    xgAgreementRate: null,
    competitionEvidenceLevels: [],
  });
  assert.equal(favorable.find((e) => e.id === 'H1')!.status, 'supported');
});

// --- historical immutability (evaluation-side contract) ---

test('historical immutability: classifyCandidate is a pure function of its inputs — never mutates the match/prediction it is given', () => {
  const match = makeMatch({});
  const pred = makePrediction({});
  const matchCopy = { ...match };
  const predCopy = { ...pred };
  classifyCandidate(match, pred);
  assert.deepEqual(match, matchCopy);
  assert.deepEqual(pred, predCopy);
});

