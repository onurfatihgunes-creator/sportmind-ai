/**
 * Prediction Evaluation Loop — pure, DB-free functions (same design principle as
 * analysisEngine.ts: every function takes already-fetched data and returns a value, so
 * it's unit-testable without a database and safely reusable from any caller). All I/O
 * (fetching matches/predictions/team_form, printing a report) lives in
 * evaluatePredictions.ts, which calls into this module.
 *
 * WHY NO NEW DATABASE TABLE: an evaluation is fully re-derivable, at any time, purely
 * from what `matches` + `predictions` already store — `computePredictions.ts` only ever
 * recomputes a `predictions` row while its match is still `status: 'scheduled'` (see that
 * file's own comment), so once a match finishes, its stored prediction is frozen exactly
 * as it was before kickoff. That is already an immutable, evaluable record; storing a
 * second copy of it in a new table would just be a second source of truth that can drift
 * from the first. Time-based grouping (week/month/rolling-N) is likewise derived from the
 * `kickoff_at`/`computed_at` timestamps already on these rows, not from a stored history.
 *
 * IMMUTABILITY: nothing in this module or its caller ever writes to `predictions` or
 * `matches` — evaluation is read-only, by construction (see evaluatePredictions.ts).
 */

export type Sport = 'football' | 'basketball';
export type Outcome = 'home' | 'draw' | 'away';

export type MatchRow = {
  id: string;
  sport: string;
  competition: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
};

export type PredictionRow = {
  match_id: string;
  home_win_pct: number;
  draw_pct: number;
  away_win_pct: number;
  computed_at: string;
};

/** Football: 3-way. Basketball: 2-way — draw is never a valid basketball outcome, and a
 * stored 0-0/tied basketball score (which shouldn't exist for a real finished game) is
 * treated as an invalid/unresolvable outcome rather than forced into either class. */
export function resolveOutcome(sport: Sport, homeScore: number, awayScore: number): Outcome | null {
  if (homeScore === awayScore) {
    return sport === 'football' ? 'draw' : null;
  }
  return homeScore > awayScore ? 'home' : 'away';
}

export type OutcomeExclusionReason =
  | 'unsupported_sport'
  | 'not_finished'
  | 'missing_score'
  | 'unresolvable_outcome' // e.g. a tied basketball score
  | 'no_prediction'
  | 'temporal_invalid'; // computed_at is after kickoff_at — see §8

/** The single funnel every candidate (match, prediction) pair passes through — mirrors
 * the exact "scheduled -> finished -> valid score -> derived outcome" chain §6/§7 ask
 * for, and the temporal-validity gate §8/§30 require. Returns either a usable sample or
 * the specific reason it was excluded — callers must count exclusions, never just drop
 * them silently (§32). */
export function classifyCandidate(
  match: MatchRow,
  prediction: PredictionRow | undefined,
): { ok: true } | { ok: false; reason: OutcomeExclusionReason } {
  if (match.sport !== 'football' && match.sport !== 'basketball') return { ok: false, reason: 'unsupported_sport' };
  if (match.status !== 'finished') return { ok: false, reason: 'not_finished' };
  if (match.home_score == null || match.away_score == null) return { ok: false, reason: 'missing_score' };
  if (!prediction) return { ok: false, reason: 'no_prediction' };
  const outcome = resolveOutcome(match.sport as Sport, match.home_score, match.away_score);
  if (outcome === null) return { ok: false, reason: 'unresolvable_outcome' };
  if (!isTemporallyValid(prediction.computed_at, match.kickoff_at)) return { ok: false, reason: 'temporal_invalid' };
  return { ok: true };
}

/** §8: a prediction is only valid pre-match evidence if it was computed strictly before
 * kickoff. Equal timestamps are treated as invalid too (no real gap to have been a
 * genuine pre-match prediction). This is the one and only leakage gate — every metric
 * below assumes its input already passed this check. */
/** §31 regression coverage for the 4.0 "zombie match" fix: computePredictions.ts and
 * computeBasketballPredictions.ts both query for `status = 'scheduled' AND kickoff_at >=
 * staleCutoffIso(graceDays)` so a match stuck at 'scheduled' long past its real kickoff
 * (found live: 113 days) stops being recomputed forever. The cutoff arithmetic itself is
 * the one part worth unit-testing directly — a sign error here (e.g. `+` instead of `-`)
 * would silently exclude every genuinely-upcoming match instead of just stale ones, which
 * a Supabase-querying integration test wouldn't catch as cheaply as this pure check does. */
export function staleCutoffIso(graceDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() - graceDays * 86_400_000).toISOString();
}

export function isTemporallyValid(computedAt: string, kickoffAt: string): boolean {
  return new Date(computedAt).getTime() < new Date(kickoffAt).getTime();
}

export type ClassProbs = Partial<Record<Outcome, number>>;

/** `predictions.*_pct` are 0-100 ints; every metric function below works in 0-1
 * probabilities. Basketball predictions carry a `draw_pct` column too (the schema is
 * shared across sports), but it is always 0 for basketball — omitted here so basketball
 * classProbs never has a spurious 'draw' key a football-shaped consumer might sum over. */
export function toClassProbs(sport: Sport, p: PredictionRow): ClassProbs {
  if (sport === 'basketball') {
    const total = p.home_win_pct + p.away_win_pct;
    return total > 0 ? { home: p.home_win_pct / total, away: p.away_win_pct / total } : { home: 0.5, away: 0.5 };
  }
  return { home: p.home_win_pct / 100, draw: p.draw_pct / 100, away: p.away_win_pct / 100 };
}

export function outcomeClasses(sport: Sport): Outcome[] {
  return sport === 'football' ? ['home', 'draw', 'away'] : ['home', 'away'];
}

/** §15: never silently turn a 0 probability into 50% — clamp with a small, documented
 * epsilon instead, purely to keep log(0) finite. 1e-6 is small enough that it can never
 * meaningfully change which bucket/decision a real percentage-point prediction lands in
 * (predictions are stored as whole percentage points, so the smallest real probability
 * above zero is 0.01 — 1e-6 is four orders of magnitude below that). */
const LOG_LOSS_EPSILON = 1e-6;

export function brierScore(probs: ClassProbs, actual: Outcome, classes: Outcome[]): number {
  let sum = 0;
  for (const c of classes) {
    const p = probs[c] ?? 0;
    const o = c === actual ? 1 : 0;
    sum += (p - o) ** 2;
  }
  return sum;
}

export function logLoss(probs: ClassProbs, actual: Outcome): number {
  const pActual = Math.max(LOG_LOSS_EPSILON, Math.min(1 - LOG_LOSS_EPSILON, probs[actual] ?? 0));
  return -Math.log(pActual);
}

export type SampleEvidence = 'insufficient' | 'directional' | 'useful' | 'strong';

/** §11/§25: internal evidence-quality classification ONLY — never a user-facing
 * confidence figure (§45 draws this line explicitly). */
export function classifySampleSize(n: number): SampleEvidence {
  if (n < 30) return 'insufficient';
  if (n < 100) return 'directional';
  if (n < 300) return 'useful';
  return 'strong';
}

export type DataLevel = 'none' | 'limited' | 'good' | 'full';

/** Mirrors the mobile app's data/dataConfidence.ts threshold (MIN_TRUSTED_FORM_SAMPLE=3)
 * for the same "is this real sample big enough to trust" question — kept as a separate,
 * explicitly-documented constant rather than a cross-project import: backend/ and the
 * Expo app are deliberately separate TypeScript projects (backend/ is excluded from the
 * app's own tsconfig — see tsconfig.json's "exclude"), so there is no safe way to literally
 * share this constant without a build-time coupling neither project has today. If that
 * threshold ever changes on the mobile side, this one should be revisited to match. */
export const MIN_TRUSTED_FORM_SAMPLE = 3;
const FULL_FORM_SAMPLE = 5; // team_form is capped at the 5 most recent results app-wide.

export function classifyDataLevel(minFormSampleSize: number): DataLevel {
  if (minFormSampleSize === 0) return 'none';
  if (minFormSampleSize < MIN_TRUSTED_FORM_SAMPLE) return 'limited';
  if (minFormSampleSize >= FULL_FORM_SAMPLE) return 'full';
  return 'good';
}

export type Metrics = {
  n: number;
  accuracy: number;
  brier: number;
  logLoss: number;
  evidence: SampleEvidence;
};

export function computeMetrics<T extends { probs: ClassProbs; actual: Outcome }>(
  samples: T[],
  classes: Outcome[],
): Metrics | null {
  const n = samples.length;
  if (n === 0) return null;
  let correct = 0, brierSum = 0, logLossSum = 0;
  for (const s of samples) {
    const predicted = classes.reduce((best, c) => ((s.probs[c] ?? 0) > (s.probs[best] ?? 0) ? c : best), classes[0]);
    if (predicted === s.actual) correct++;
    brierSum += brierScore(s.probs, s.actual, classes);
    logLossSum += logLoss(s.probs, s.actual);
  }
  return {
    n,
    accuracy: correct / n,
    brier: brierSum / n,
    logLoss: logLossSum / n,
    evidence: classifySampleSize(n),
  };
}

export type CalibrationBucket = {
  bucket: string;
  n: number;
  avgPredicted: number;
  actualRate: number;
  bias: number;
  evidence: SampleEvidence;
};

/** One-vs-rest reliability for a single outcome class, in probability deciles. A bucket
 * with too few samples still gets a row (§10: "metric'i silme, ama yorumlama") — its
 * `evidence` field says 'insufficient' rather than the row disappearing. */
export function calibrationBuckets<T extends { probs: ClassProbs; actual: Outcome }>(
  samples: T[],
  classKey: Outcome,
): CalibrationBucket[] {
  const buckets: { lo: number; preds: number[]; actuals: number[] }[] = Array.from({ length: 10 }, (_, i) => ({
    lo: i / 10,
    preds: [],
    actuals: [],
  }));
  for (const s of samples) {
    const p = s.probs[classKey];
    if (p == null) continue;
    const idx = Math.min(9, Math.floor(p * 10));
    buckets[idx].preds.push(p);
    buckets[idx].actuals.push(s.actual === classKey ? 1 : 0);
  }
  return buckets
    .filter((b) => b.preds.length > 0)
    .map((b) => {
      const avgPredicted = b.preds.reduce((a, x) => a + x, 0) / b.preds.length;
      const actualRate = b.actuals.reduce((a, x) => a + x, 0) / b.actuals.length;
      return {
        bucket: `${Math.round(b.lo * 100)}-${Math.round((b.lo + 0.1) * 100)}%`,
        n: b.preds.length,
        avgPredicted,
        actualRate,
        bias: avgPredicted - actualRate,
        evidence: classifySampleSize(b.preds.length),
      };
    });
}

export type Baseline = { name: string; probs: ClassProbs };

/** §16: baselines the evaluation layer compares against — never fed back into the
 * prediction engine itself. `uniform`/`alwaysHome` are fixed; `baseRate` needs the
 * sample's own observed class frequencies, computed by the caller and passed in (kept
 * pure here rather than reaching into a global). */
export function uniformBaseline(classes: Outcome[]): Baseline {
  const p = 1 / classes.length;
  const probs: ClassProbs = {};
  for (const c of classes) probs[c] = p;
  return { name: 'uniform', probs };
}

export function alwaysHomeBaseline(classes: Outcome[]): Baseline {
  const probs: ClassProbs = {};
  for (const c of classes) probs[c] = c === 'home' ? 1 : 0;
  return { name: 'always-home', probs };
}

export function baseRateBaseline(classes: Outcome[], rates: ClassProbs): Baseline {
  return { name: 'base-rate', probs: rates };
}

export function evaluateBaseline<T extends { actual: Outcome }>(
  samples: T[],
  baseline: Baseline,
  classes: Outcome[],
): Metrics | null {
  const withProbs = samples.map((s) => ({ ...s, probs: baseline.probs }));
  return computeMetrics(withProbs, classes);
}

export function classRates<T extends { actual: Outcome }>(samples: T[], classes: Outcome[]): ClassProbs {
  const n = samples.length;
  const rates: ClassProbs = {};
  for (const c of classes) rates[c] = n === 0 ? 0 : samples.filter((s) => s.actual === c).length / n;
  return rates;
}

/** §17: ISO week (YYYY-Www) and month (YYYY-MM) bucketing off kickoff_at — no stored
 * time series needed, this is a pure derivation from timestamps already on each row. */
export function isoWeekKey(iso: string): string {
  const d = new Date(iso);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

// ============================================================================
// INTELLIGENCE 7.0 — validation & calibration additions below. Same design rule
// as everything above: pure, DB-free, unit-testable without mocking Supabase.
// ============================================================================

/**
 * "future-data-invalid" leakage audit (§b — broader than temporal_invalid, which only
 * catches computed_at landing after kickoff): does any INPUT a prediction used (team_form
 * rows) risk having been generated after that prediction's own computed_at?
 *
 * We first tried this as an empirical per-row check (compare every team_form row's
 * match_date against computed_at) and it produced a false, alarming signal: 40 of 45 valid
 * football samples "failed", purely because team_form keeps growing as a team plays more
 * matches over time — a prediction computed weeks ago will always look like it has "newer"
 * team_form rows today. Confirmed live: a match with kickoff 2026-08-23 and computed_at
 * 12:31 that same day has a home team whose team_form table NOW also holds rows dated
 * 2026-08-29 and 2026-09-05, added long after this prediction was frozen — an empirical
 * check like this measures "has this team played since?", not "did this prediction see
 * future data at the time it ran?". team_form carries no ingestion/created_at timestamp
 * (only `match_date`, the date of the match a row DESCRIBES — see sql/schema.sql), so a
 * true per-prediction empirical check of "was this specific input already in the table at
 * computed_at" is NOT COMPUTABLE from the current schema without adding one — a schema
 * migration, explicitly out of scope this sprint (STOP-if-needed rule).
 *
 * What IS soundly verifiable without any schema change is a STRUCTURAL argument that
 * collapses this category down to temporal_invalid itself:
 *   1. computePredictions()/computeBasketballPredictions() only ever compute/recompute a
 *      prediction while its match is still `status: 'scheduled'` — never after it finishes.
 *   2. team_form rows are only ever written post-hoc, once a match's real result is known —
 *      there is no ingestion path that writes a row for a match that hasn't been played yet.
 *   3. Given (1) and (2), the only way a computed_at could have "seen" a team_form row for a
 *      match that, relative to computed_at, hadn't been played yet is if the recompute
 *      itself ran on/after that match's own kickoff — and that is exactly what
 *      `isTemporallyValid` already detects (returns false) and `classifyCandidate` already
 *      excludes as `temporal_invalid`.
 * Conclusion: under this codebase's actual guarantees, temporal_invalid IS ALREADY the full
 * future-data-invalid gate — there is no separate population of "future-data-invalid but
 * temporally-valid" predictions to find. This function pins that reduction as an explicit,
 * named claim (see evaluation.test.ts) rather than re-deriving an empirically-unsound check.
 */
export function isTemporalInvalidSufficientForFutureDataSafety(): boolean {
  return true;
}

/** §f: Expected Calibration Error — n-weighted average of |predicted - actual| across
 * buckets. NaN (not 0) when there is no data, so a caller never mistakes "no evidence"
 * for "perfectly calibrated." */
export function expectedCalibrationError(buckets: CalibrationBucket[]): number {
  const total = buckets.reduce((sum, b) => sum + b.n, 0);
  if (total === 0) return NaN;
  return buckets.reduce((sum, b) => sum + (b.n / total) * Math.abs(b.bias), 0);
}

/** §w: Wilson score interval — chosen over the naive normal-approximation interval because
 * it stays inside [0,1] and stays sane for small n / extreme observed rates (both true here
 * at n=45), rather than presenting a bare point estimate like "44.4%" as exact truth. */
export function wilsonInterval(successes: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, (center - margin) / denom), hi: Math.min(1, (center + margin) / denom) };
}

export type DecisionGate = 'not-ready' | 'minimum' | 'better' | 'strong';

/** §v: Decision Gates for ACTING on a finding (tuning something) — a distinct, stricter
 * question from `classifySampleSize`'s "how should I interpret this metric" evidence
 * label. classifySampleSize(45) is 'directional' (fine to report and discuss); this
 * function separately says 'not-ready' (not fine to CHANGE anything based on it). Keeping
 * these as two functions, not one, means a caller can never accidentally use "this metric
 * is reportable" as license to "this metric justifies a tuning decision." */
export function classifyDecisionGate(n: number): DecisionGate {
  if (n < 100) return 'not-ready';
  if (n < 300) return 'minimum';
  if (n < 500) return 'better';
  return 'strong';
}

export type CompetitionEvidence = 'insufficient' | 'directional' | 'meaningful';

/** §n: per-competition evidence labeling uses its own, coarser thresholds than
 * classifySampleSize (which has 4 tiers) — the master prompt asks for exactly 3
 * (insufficient/directional/meaningful) so per-league reporting can never imply a "best
 * league" claim from a useful-but-not-strong bucket. */
export function classifyCompetitionEvidence(n: number): CompetitionEvidence {
  if (n < 30) return 'insufficient';
  if (n < 100) return 'directional';
  return 'meaningful';
}

export type ExtremeBand = 'low(<20%)' | 'mid(20-80%)' | 'high(>80%)';

export type ExtremeBucket = {
  band: ExtremeBand;
  n: number;
  avgPredicted: number;
  actualRate: number;
  bias: number;
  evidence: SampleEvidence;
};

/** §g: overconfidence check — pools every per-class probability INSTANCE (not just the
 * argmax/predicted class) across all outcome classes into 3 bands, since "is a <20% or
 * >80% probability well-calibrated" is a question about any probability the engine ever
 * states, not only the one it bets on. */
export function extremeProbabilitySummary<T extends { probs: ClassProbs; actual: Outcome }>(
  samples: T[],
  classes: Outcome[],
): ExtremeBucket[] {
  const bands: Record<ExtremeBand, { preds: number[]; actuals: number[] }> = {
    'low(<20%)': { preds: [], actuals: [] },
    'mid(20-80%)': { preds: [], actuals: [] },
    'high(>80%)': { preds: [], actuals: [] },
  };
  for (const s of samples) {
    for (const c of classes) {
      const p = s.probs[c];
      if (p == null) continue;
      const band: ExtremeBand = p < 0.2 ? 'low(<20%)' : p > 0.8 ? 'high(>80%)' : 'mid(20-80%)';
      bands[band].preds.push(p);
      bands[band].actuals.push(s.actual === c ? 1 : 0);
    }
  }
  return (Object.keys(bands) as ExtremeBand[])
    .filter((band) => bands[band].preds.length > 0)
    .map((band) => {
      const { preds, actuals } = bands[band];
      const avgPredicted = preds.reduce((a, x) => a + x, 0) / preds.length;
      const actualRate = actuals.reduce((a, x) => a + x, 0) / actuals.length;
      return { band, n: preds.length, avgPredicted, actualRate, bias: avgPredicted - actualRate, evidence: classifySampleSize(preds.length) };
    });
}

/**
 * §c/§e: a future-safe alternative to `baseRateBaseline` (which is explicitly an
 * IN-SAMPLE base rate — it computes class frequencies from the very sample it is then
 * evaluated against, which is not a baseline any real pre-match system could have used).
 * This walks samples IN TIME ORDER and, for each one, predicts using only the class
 * frequencies observed in samples STRICTLY BEFORE it — exactly the data a rolling,
 * continuously-updated baseline would have had available at that point, and the same
 * "prediction-time-only historical data" principle a walk-forward evaluation needs.
 *
 * The engine itself is a fixed deterministic formula, not a trained model — there is
 * nothing to "retrain" window-by-window — so this rolling baseline comparison IS the
 * walk-forward architecture called for: it is the one thing in this system that can
 * legitimately be evaluated walk-forward, and it is reusable unmodified once sample size
 * grows. The first `minHistory` samples are excluded (no prior history to draw rates from)
 * and reported separately rather than silently dropped.
 */
export function rollingHistoricalBaseline<T extends { actual: Outcome }>(
  samplesSortedByTime: T[],
  classes: Outcome[],
  minHistory = 5,
): { evaluated: { probs: ClassProbs; actual: Outcome }[]; excludedForHistory: number } {
  const evaluated: { probs: ClassProbs; actual: Outcome }[] = [];
  for (let i = 0; i < samplesSortedByTime.length; i++) {
    if (i < minHistory) continue;
    const history = samplesSortedByTime.slice(0, i);
    const rates = classRates(history, classes);
    evaluated.push({ probs: rates, actual: samplesSortedByTime[i].actual });
  }
  return { evaluated, excludedForHistory: Math.min(minHistory, samplesSortedByTime.length) };
}

export type TimeSplit<T> = { train: T[]; validation: T[]; test: T[] };

/** §d: train/validation/test time-split architecture. Explicitly NOT used to draw any
 * conclusion this sprint (n=45 makes a 3-way split's test partition single-digit and
 * useless) — built so it exists, is tested, and is ready the moment sample size justifies
 * using it. Split by TIME ORDER (caller must pass samples already sorted by kickoff_at),
 * never randomly — a random split would leak future matches into "training" relative to
 * validation/test matches that kicked off earlier, which is exactly the kind of temporal
 * leakage this whole module exists to prevent. */
export function timeSplit<T>(samplesSortedByTime: T[], trainRatio = 0.7, validationRatio = 0.15): TimeSplit<T> {
  const n = samplesSortedByTime.length;
  const trainEnd = Math.floor(n * trainRatio);
  const validationEnd = Math.floor(n * (trainRatio + validationRatio));
  return {
    train: samplesSortedByTime.slice(0, trainEnd),
    validation: samplesSortedByTime.slice(trainEnd, validationEnd),
    test: samplesSortedByTime.slice(validationEnd),
  };
}

/** §q: determinism check — the same input must always produce the same output. Generic
 * over any pure function so both computePredictions.ts's and
 * computeBasketballPredictions.ts's `buildPrediction` can reuse it without this module
 * importing either (this module stays sport-formula-agnostic). Compares by JSON structural
 * equality, which also catches key-order-independent float drift since JSON.stringify would
 * differ on real numeric drift, not just object identity. */
export function isDeterministic<T>(fn: () => T, times = 5): boolean {
  const first = JSON.stringify(fn());
  for (let i = 1; i < times; i++) {
    if (JSON.stringify(fn()) !== first) return false;
  }
  return true;
}

/** §s: calibration-drift infrastructure — a METRIC gate only, never fires an alert itself
 * (no alerting system exists or is being added this sprint). Keeps 5.0's rule that no
 * calibration judgment fires below n=100, regardless of how large the ECE looks — a large
 * ECE on a tiny sample is noise, not drift. */
export function calibrationDriftAlert(
  n: number,
  ece: number,
  eceThreshold: number,
  minSampleFloor = 100,
): { shouldAlert: boolean; reason: string } {
  if (n < minSampleFloor) {
    return { shouldAlert: false, reason: `n=${n} below the ${minSampleFloor}-sample floor — no alert regardless of ECE` };
  }
  const shouldAlert = ece >= eceThreshold;
  return {
    shouldAlert,
    reason: shouldAlert ? `ECE ${ece.toFixed(3)} >= threshold ${eceThreshold}` : `ECE ${ece.toFixed(3)} within threshold ${eceThreshold}`,
  };
}

export type SignalDirectionResult = { n: number; agree: number; disagree: number; neutral: number; agreementRate: number; evidence: SampleEvidence };

/**
 * §j: descriptive (non-causal) xG-signal check — does the side the engine's own xG numbers
 * favor tend to actually win, among decided (non-draw) outcomes? This is NOT a form-signal
 * check independent of xG: xgHome/xgAway are themselves derived from the same team_form
 * rows as the form factor (see computePredictions.ts's buildPrediction: `xgHome =
 * (home.avgGoalsFor + away.avgGoalsAgainst) / 2`), so this measures one signal, not two —
 * reported here as descriptive association, never as evidence of causation or of an
 * independent second signal. */
export function xgSignalDirectionAgreement<T extends { actual: Outcome; xgHome: number; xgAway: number }>(
  samples: T[],
): SignalDirectionResult {
  let agree = 0, disagree = 0, neutral = 0;
  for (const s of samples) {
    if (s.actual === 'draw') continue;
    if (s.xgHome === s.xgAway) {
      neutral++;
      continue;
    }
    const favored: Outcome = s.xgHome > s.xgAway ? 'home' : 'away';
    if (favored === s.actual) agree++;
    else disagree++;
  }
  const n = agree + disagree;
  return { n, agree, disagree, neutral, agreementRate: n > 0 ? agree / n : NaN, evidence: classifySampleSize(n) };
}

export type HypothesisStatus = 'supported' | 'not-supported' | 'insufficient-evidence' | 'mixed';
export type HypothesisEntry = { id: string; hypothesis: string; evidence: string; status: HypothesisStatus };

/**
 * §u: Hypothesis Register (H1-H7 as given in the brief). Pure aggregation over numbers the
 * caller has already computed elsewhere in this module — kept as a function (rather than
 * inline in the CLI report) so the STATUS-assignment logic itself is unit-testable without
 * a database. Every status defaults toward 'insufficient-evidence': §x explicitly warns
 * against reading a small-sample pattern (e.g. "45 matches show draw is a bit off") as
 * proof, so this function requires the decision-gate ('not-ready'/'minimum'/'better'/
 * 'strong') to have cleared 'not-ready' before it will ever assign 'supported' or
 * 'not-supported' — otherwise every hypothesis reports 'insufficient-evidence' verbatim,
 * regardless of which way the raw numbers point.
 */
export function buildHypothesisRegister(input: {
  n: number;
  decisionGate: DecisionGate;
  engineBrier: number;
  baseRateBrier: number;
  drawBucketBias: number | null;
  homeAdvantagePredicted: { home: number; away: number };
  homeActualRate: number | null;
  fullDataMetrics: Metrics | null;
  limitedOrNoneDataMetrics: Metrics | null;
  extremeLowBias: number | null;
  extremeHighBias: number | null;
  xgAgreementRate: number | null;
  competitionEvidenceLevels: CompetitionEvidence[];
}): HypothesisEntry[] {
  const gated = input.decisionGate !== 'not-ready';

  return [
    {
      id: 'H1',
      hypothesis: 'Form signal improves performance (engine beats the in-sample base-rate baseline).',
      evidence:
        input.n === 0
          ? 'no samples'
          : `engine Brier ${input.engineBrier.toFixed(3)} vs base-rate Brier ${input.baseRateBrier.toFixed(3)} (n=${input.n})`,
      status: !gated ? 'insufficient-evidence' : input.engineBrier < input.baseRateBrier ? 'supported' : 'not-supported',
    },
    {
      id: 'H2',
      hypothesis: 'The fixed 27% draw prior is under-responsive to match-specific signals.',
      evidence:
        input.drawBucketBias == null
          ? 'no draw calibration data'
          : `all predictions cluster in one probability decile (bias ${(input.drawBucketBias * 100).toFixed(1)}pp) — a fixed prior producing zero prediction-to-prediction variance is consistent with under-responsiveness, but is a HYPOTHESIS about the FORMULA's structure, not something this evidence alone proves miscalibrated`,
      status: 'insufficient-evidence',
    },
    {
      id: 'H3',
      hypothesis: 'Home advantage is over- or under-calibrated relative to the fixed 62/38 prior.',
      evidence:
        input.homeActualRate == null
          ? 'no outcome data'
          : `predicted home share ${input.homeAdvantagePredicted.home}% vs actual home-win rate ${(input.homeActualRate * 100).toFixed(1)}% (n=${input.n})`,
      status: !gated ? 'insufficient-evidence' : 'insufficient-evidence', // §h: re-verify only, never a tuning trigger this sprint
    },
    {
      id: 'H4',
      hypothesis: 'Full-data (>=5 real form matches) predictions outperform limited/no-data predictions.',
      evidence:
        input.fullDataMetrics && input.limitedOrNoneDataMetrics
          ? `full-data Brier ${input.fullDataMetrics.brier.toFixed(3)} (n=${input.fullDataMetrics.n}) vs limited/none Brier ${input.limitedOrNoneDataMetrics.brier.toFixed(3)} (n=${input.limitedOrNoneDataMetrics.n})`
          : 'one or both data-level segments have zero samples',
      status:
        !gated || !input.fullDataMetrics || !input.limitedOrNoneDataMetrics
          ? 'insufficient-evidence'
          : input.fullDataMetrics.brier < input.limitedOrNoneDataMetrics.brier
            ? 'supported'
            : 'not-supported',
    },
    {
      id: 'H5',
      hypothesis: 'Extreme probabilities (<20% or >80%) are overconfident (predicted more extreme than actual).',
      evidence:
        input.extremeLowBias == null && input.extremeHighBias == null
          ? 'no predictions fall in the extreme bands'
          : `low-band bias ${input.extremeLowBias?.toFixed(3) ?? 'n/a'}, high-band bias ${input.extremeHighBias?.toFixed(3) ?? 'n/a'}`,
      status: 'insufficient-evidence',
    },
    {
      id: 'H6',
      hypothesis: 'xG adds information beyond form.',
      evidence: 'xG is computed FROM the same team_form rows as the form factor (not an independent source) — this hypothesis cannot be tested with current inputs without a schema/pipeline change adding an independent xG source',
      status: 'insufficient-evidence',
    },
    {
      id: 'H7',
      hypothesis: 'Competition-specific calibration differs meaningfully across leagues.',
      evidence: `${input.competitionEvidenceLevels.length} competitions observed, evidence levels: ${input.competitionEvidenceLevels.join(', ') || 'none'} — none reach 'meaningful' (>=100) yet`,
      status: 'insufficient-evidence',
    },
  ];
}
