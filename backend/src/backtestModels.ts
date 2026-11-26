/**
 * Offline model comparison — READ-ONLY. Never writes to any table.
 *
 * Takes exactly the football samples `npm run evaluate` scores (finished, real score, a
 * prediction computed before kickoff) and asks: what would other models have said for the
 * same matches, seeing ONLY matches that finished before each kickoff (walk-forward)?
 *
 *   stored      the v1 prediction actually shown at the time
 *   v1-replay   the v1 formula recomputed from `matches` (sanity check for the replay)
 *   v1+draw     v1 replay with the measured draw prior (the change made to computePredictions)
 *   elo         Elo ratings + Davidson draw model (draw at equal strength = past draw rate)
 *   poisson     time-decayed attack/defence Poisson model (Maher/Dixon-Coles family, rho 0)
 *   dc          same with the Dixon-Coles low-score correction (rho -0.10)
 *   blend       average of elo and poisson
 *   v2-live     the live engine v2 code path (buildPredictionV2, whole-percent outputs)
 *
 * Every hyper-parameter below is fixed up front from the literature, NOT tuned on these
 * matches, so the comparison stays honest. Run: npx tsx src/backtestModels.ts
 */
import { supabase } from './supabaseClient.js';
import { buildPrediction, buildPredictionV2, DEFAULT_PRIORS, priorsFromResults, type BasePriors } from './computePredictions.js';
import { POISSON_LOOKBACK_DAYS, expectedGoals, fitPoisson, outcomeProbabilities, type PoissonFit } from './poissonModel.js';
import {
  brierScore,
  calibrationBuckets,
  classifyCandidate,
  computeMetrics,
  expectedCalibrationError,
  resolveOutcome,
  toClassProbs,
  type ClassProbs,
  type MatchRow,
  type Outcome,
  type PredictionRow,
} from './evaluation.js';

const CLASSES: Outcome[] = ['home', 'draw', 'away'];
const DAY = 86_400_000;

// ---- fixed hyper-parameters (not tuned) -------------------------------------------------
const ELO_K = 20;
const ELO_HOME = 65; // Elo points
// Poisson model parameters live in poissonModel.ts (shared with the live engine).
const DC_RHO = -0.1;
const BOOTSTRAP = 2000;

const PAGE = 1000;
async function fetchAll<T>(table: string, select: string, orderBy: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).order(orderBy).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

type Finished = MatchRow & { home_score: number; away_score: number; t: number };

// ---- v1 replay ----------------------------------------------------------------------------
function formBefore(history: Finished[], teamId: string, before: number) {
  const own: { gf: number; ga: number; pts: number }[] = [];
  for (let i = history.length - 1; i >= 0 && own.length < 5; i--) {
    const m = history[i];
    if (m.t >= before) continue;
    if (m.home_team_id === teamId) own.push({ gf: m.home_score, ga: m.away_score, pts: m.home_score > m.away_score ? 3 : m.home_score === m.away_score ? 1 : 0 });
    else if (m.away_team_id === teamId) own.push({ gf: m.away_score, ga: m.home_score, pts: m.away_score > m.home_score ? 3 : m.home_score === m.away_score ? 1 : 0 });
  }
  if (own.length === 0) return { pointsPerGame: 1.3, avgGoalsFor: 1.3, avgGoalsAgainst: 1.3, matchesCount: 0 };
  const n = own.length;
  return {
    pointsPerGame: own.reduce((s, x) => s + x.pts, 0) / n,
    avgGoalsFor: own.reduce((s, x) => s + x.gf, 0) / n,
    avgGoalsAgainst: own.reduce((s, x) => s + x.ga, 0) / n,
    matchesCount: n,
  };
}

function v1Probs(history: Finished[], m: MatchRow, before: number, priors: BasePriors): ClassProbs {
  const p = buildPrediction(formBefore(history, m.home_team_id, before), formBefore(history, m.away_team_id, before), priors);
  return { home: p.outcomes.home / 100, draw: p.outcomes.draw / 100, away: p.outcomes.away / 100 };
}

// ---- Elo + Davidson draws -----------------------------------------------------------------
function eloProbs(ratings: Map<string, number>, m: MatchRow, drawRate: number): ClassProbs {
  const rh = (ratings.get(m.home_team_id) ?? 1500) + ELO_HOME;
  const ra = ratings.get(m.away_team_id) ?? 1500;
  const ph = 10 ** (rh / 400);
  const pa = 10 ** (ra / 400);
  const nu = (2 * drawRate) / (1 - drawRate); // equal strength -> P(draw) = drawRate
  const d = nu * Math.sqrt(ph * pa);
  const z = ph + pa + d;
  return { home: ph / z, draw: d / z, away: pa / z };
}

function eloUpdate(ratings: Map<string, number>, m: Finished) {
  const rh = ratings.get(m.home_team_id) ?? 1500;
  const ra = ratings.get(m.away_team_id) ?? 1500;
  const e = 1 / (1 + 10 ** (-(rh + ELO_HOME - ra) / 400));
  const s = m.home_score > m.away_score ? 1 : m.home_score === m.away_score ? 0.5 : 0;
  const gd = Math.abs(m.home_score - m.away_score);
  const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8; // standard World Football Elo margin factor
  ratings.set(m.home_team_id, rh + ELO_K * mult * (s - e));
  ratings.set(m.away_team_id, ra - ELO_K * mult * (s - e));
}

// ---- Poisson (shared with the live engine) -------------------------------------------------
function poissonProbs(fit: PoissonFit, m: MatchRow, rho: number): ClassProbs {
  const l = expectedGoals(fit, m.home_team_id, m.away_team_id);
  return outcomeProbabilities(l.home, l.away, rho);
}

// ---- report helpers -----------------------------------------------------------------------
type Scored = { probs: ClassProbs; actual: Outcome };

function summary(samples: Scored[]) {
  const met = computeMetrics(samples, CLASSES)!;
  // overall ECE = mean of the per-class one-vs-rest ECEs (same definition evaluate reports)
  const ece = CLASSES.reduce((sum, c) => sum + expectedCalibrationError(calibrationBuckets(samples, c)), 0) / CLASSES.length;
  const avgDraw = samples.reduce((s, x) => s + (x.probs.draw ?? 0), 0) / samples.length;
  const fav = samples.map((x) => {
    const best = CLASSES.reduce((b, c) => ((x.probs[c] ?? 0) > (x.probs[b] ?? 0) ? c : b), 'home' as Outcome);
    return { p: x.probs[best] ?? 0, hit: best === x.actual };
  }).filter((f) => f.p >= 0.55);
  return {
    accuracy: +met.accuracy.toFixed(4),
    brier: +met.brier.toFixed(4),
    logLoss: +met.logLoss.toFixed(4),
    ece: +ece.toFixed(4),
    avgPredictedDraw: +avgDraw.toFixed(3),
    strongFavourites: { n: fav.length, avgPredicted: +(fav.reduce((s, f) => s + f.p, 0) / Math.max(fav.length, 1)).toFixed(3), actualHitRate: +(fav.filter((f) => f.hit).length / Math.max(fav.length, 1)).toFixed(3) },
  };
}

/** Paired bootstrap of the per-match Brier difference (model - stored): negative = better. */
function pairedBrierDiff(model: Scored[], base: Scored[]) {
  const diffs = model.map((s, i) => brierScore(s.probs, s.actual, CLASSES) - brierScore(base[i].probs, base[i].actual, CLASSES));
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const boots: number[] = [];
  for (let b = 0; b < BOOTSTRAP; b++) {
    let s = 0;
    for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rnd() * diffs.length)];
    boots.push(s / diffs.length);
  }
  boots.sort((x, y) => x - y);
  return { mean: +mean.toFixed(4), ci95: [+boots[Math.floor(0.025 * BOOTSTRAP)].toFixed(4), +boots[Math.floor(0.975 * BOOTSTRAP)].toFixed(4)], shareBetter: +(boots.filter((x) => x < 0).length / BOOTSTRAP).toFixed(3) };
}

async function main() {
  const matches = await fetchAll<MatchRow>('matches', 'id, sport, competition, status, home_score, away_score, home_team_id, away_team_id, kickoff_at', 'id');
  const predictions = await fetchAll<PredictionRow>('predictions', 'match_id, home_win_pct, draw_pct, away_win_pct, computed_at', 'match_id');
  const predByMatch = new Map(predictions.map((p) => [p.match_id, p]));

  const finished: Finished[] = matches
    .filter((m) => m.sport === 'football' && m.status === 'finished' && m.home_score != null && m.away_score != null)
    .map((m) => ({ ...m, home_score: m.home_score!, away_score: m.away_score!, t: new Date(m.kickoff_at).getTime() }))
    .sort((a, b) => a.t - b.t);

  const samples = matches
    .filter((m) => m.sport === 'football' && classifyCandidate(m, predByMatch.get(m.id)).ok)
    .map((m) => ({ m, t: new Date(m.kickoff_at).getTime(), actual: resolveOutcome('football', m.home_score!, m.away_score!)! }))
    .sort((a, b) => a.t - b.t);

  const out: Record<string, Scored[]> = { stored: [], 'v1-replay': [], 'v1+draw': [], elo: [], poisson: [], dc: [], blend: [], 'v2-live': [] };
  const ratings = new Map<string, number>();
  let eloCursor = 0;
  let fitDay = -1; let fit: PoissonFit | null = null;

  for (const s of samples) {
    // history strictly before this kickoff
    while (eloCursor < finished.length && finished[eloCursor].t < s.t) eloUpdate(ratings, finished[eloCursor++]);
    const history = finished.slice(0, eloCursor);
    const lastYear = history.filter((h) => h.t >= s.t - 365 * DAY);
    const priors = priorsFromResults(lastYear);
    const drawRate = priors.draw / 100;

    const day = Math.floor(s.t / DAY);
    if (day !== fitDay) {
      // fit on matches finished before the start of this kickoff's day (no same-day leakage)
      const dayStart = day * DAY;
      fit = fitPoisson(history.filter((h) => h.t < dayStart && h.t >= dayStart - POISSON_LOOKBACK_DAYS * DAY), dayStart);
      fitDay = day;
    }

    const elo = eloProbs(ratings, s.m, drawRate);
    const poi = poissonProbs(fit!, s.m, 0);
    out.stored.push({ probs: toClassProbs('football', predByMatch.get(s.m.id)!), actual: s.actual });
    out['v1-replay'].push({ probs: v1Probs(history, s.m, s.t, DEFAULT_PRIORS), actual: s.actual });
    out['v1+draw'].push({ probs: v1Probs(history, s.m, s.t, priors), actual: s.actual });
    out.elo.push({ probs: elo, actual: s.actual });
    out.poisson.push({ probs: poi, actual: s.actual });
    out.dc.push({ probs: poissonProbs(fit!, s.m, DC_RHO), actual: s.actual });
    const v2 = buildPredictionV2(formBefore(history, s.m.home_team_id, s.t), formBefore(history, s.m.away_team_id, s.t), fit!, s.m.home_team_id, s.m.away_team_id);
    out['v2-live'].push({ probs: { home: v2.outcomes.home / 100, draw: v2.outcomes.draw / 100, away: v2.outcomes.away / 100 }, actual: s.actual });
    out.blend.push({ probs: { home: (elo.home! + poi.home!) / 2, draw: (elo.draw! + poi.draw!) / 2, away: (elo.away! + poi.away!) / 2 }, actual: s.actual });
  }

  const actualDraw = samples.filter((s) => s.actual === 'draw').length / samples.length;
  console.log(JSON.stringify({
    n: samples.length,
    historyFinishedFootball: finished.length,
    period: [samples[0]?.m.kickoff_at, samples[samples.length - 1]?.m.kickoff_at],
    actualDrawRate: +actualDraw.toFixed(3),
    models: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, summary(v)])),
    brierVsStored: Object.fromEntries(Object.entries(out).filter(([k]) => k !== 'stored').map(([k, v]) => [k, pairedBrierDiff(v, out.stored)])),
    secondHalfOnly: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, summary(v.slice(Math.floor(v.length / 2)))])),
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
