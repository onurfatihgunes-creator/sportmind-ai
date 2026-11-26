/**
 * Football goal model (engine v2) — pure, no I/O.
 *
 * Each team gets an attack and a defence strength, fitted on recently finished matches with
 * time decay (recent matches count more) and shrinkage (a team with little data is pulled
 * toward average). Expected goals for a match follow from those strengths plus a measured
 * home advantage; the home/draw/away probabilities follow from the two Poisson goal
 * distributions. It is the Maher / Dixon-Coles family of models, without the low-score
 * correction (that variant did not help in the walk-forward comparison).
 *
 * Chosen by a walk-forward comparison on 563 real, pre-kickoff-predicted matches (Nov 2026,
 * src/backtestModels.ts): Brier 0.578 vs 0.609 for the v1 formula (95% CI of the difference
 * -0.041..-0.010), accuracy 55.6% vs 50.8%, average predicted draw 22.9% vs an actual 21.1%.
 * The hyper-parameters below were fixed from the literature before that comparison and were
 * not tuned on it.
 */

export const POISSON_HALF_LIFE_DAYS = 180;
export const POISSON_LOOKBACK_DAYS = 540;
/** Pseudo-matches at league-average level added to every team (shrinkage). */
export const POISSON_SHRINK_MATCHES = 3;
/** Below this many training matches the model is not trusted and v1 is used instead. */
export const POISSON_MIN_TRAINING_MATCHES = 200;
const ITERATIONS = 40;
const MAX_GOALS = 10;
const DAY = 86_400_000;

export type TrainingMatch = {
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  /** kickoff time in ms */
  t: number;
};

export type PoissonFit = {
  /** attack multiplier per team (1 = average) */
  att: Map<string, number>;
  /** defence multiplier per team (1 = average, LOWER = better defence) */
  def: Map<string, number>;
  /** away-side goal rate for two average teams */
  c: number;
  /** home goal multiplier (measured home advantage) */
  home: number;
  /** number of training matches */
  n: number;
};

/** Fits the model on matches finished before `at` (ms), within the lookback window. */
export function fitPoisson(all: readonly TrainingMatch[], at: number, options?: { lookbackDays?: number }): PoissonFit {
  const lookback = (options?.lookbackDays ?? POISSON_LOOKBACK_DAYS) * DAY;
  const train = all.filter((m) => m.t < at && m.t >= at - lookback);
  const xi = Math.LN2 / POISSON_HALF_LIFE_DAYS;
  const rows = train.map((m) => ({ m, w: Math.exp((-xi * (at - m.t)) / DAY) }));
  const teams = new Set<string>();
  for (const { m } of rows) {
    teams.add(m.home_team_id);
    teams.add(m.away_team_id);
  }
  const att = new Map<string, number>();
  const def = new Map<string, number>();
  for (const t of teams) {
    att.set(t, 1);
    def.set(t, 1);
  }
  let wSum = 0;
  let hg = 0;
  let ag = 0;
  for (const { m, w } of rows) {
    wSum += w;
    hg += w * m.home_score;
    ag += w * m.away_score;
  }
  let c = Math.max(0.1, ag / Math.max(wSum, 1e-9));
  let home = Math.max(0.5, hg / Math.max(ag, 1e-9));
  const k = POISSON_SHRINK_MATCHES;

  for (let it = 0; it < ITERATIONS; it++) {
    const num = new Map<string, number>();
    const den = new Map<string, number>();
    for (const t of teams) {
      num.set(t, k * c * 1.1);
      den.set(t, k * c * 1.1);
    }
    for (const { m, w } of rows) {
      num.set(m.home_team_id, num.get(m.home_team_id)! + w * m.home_score);
      den.set(m.home_team_id, den.get(m.home_team_id)! + w * c * home * def.get(m.away_team_id)!);
      num.set(m.away_team_id, num.get(m.away_team_id)! + w * m.away_score);
      den.set(m.away_team_id, den.get(m.away_team_id)! + w * c * def.get(m.home_team_id)!);
    }
    for (const t of teams) att.set(t, num.get(t)! / den.get(t)!);

    const dn = new Map<string, number>();
    const dd = new Map<string, number>();
    for (const t of teams) {
      dn.set(t, k * c * 1.1);
      dd.set(t, k * c * 1.1);
    }
    for (const { m, w } of rows) {
      dn.set(m.away_team_id, dn.get(m.away_team_id)! + w * m.home_score);
      dd.set(m.away_team_id, dd.get(m.away_team_id)! + w * c * home * att.get(m.home_team_id)!);
      dn.set(m.home_team_id, dn.get(m.home_team_id)! + w * m.away_score);
      dd.set(m.home_team_id, dd.get(m.home_team_id)! + w * c * att.get(m.away_team_id)!);
    }
    for (const t of teams) def.set(t, dn.get(t)! / dd.get(t)!);

    let hExp = 0;
    let aExp = 0;
    for (const { m, w } of rows) {
      hExp += w * c * att.get(m.home_team_id)! * def.get(m.away_team_id)!;
      aExp += w * c * att.get(m.away_team_id)! * def.get(m.home_team_id)!;
    }
    if (hExp > 0) home = hg / hExp;
    if (aExp > 0) c = c * (ag / aExp);
  }
  return { att, def, c, home, n: train.length };
}

function poissonPmf(lambda: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lambda);
  for (let g = 0; g <= MAX_GOALS; g++) {
    out.push(p);
    p = (p * lambda) / (g + 1);
  }
  return out;
}

/** Expected goals for both sides. An unknown team is treated as average (multiplier 1). */
export function expectedGoals(fit: PoissonFit, homeId: string, awayId: string): { home: number; away: number } {
  return {
    home: fit.c * fit.home * (fit.att.get(homeId) ?? 1) * (fit.def.get(awayId) ?? 1),
    away: fit.c * (fit.att.get(awayId) ?? 1) * (fit.def.get(homeId) ?? 1),
  };
}

/** Home/draw/away probabilities (0-1, summing to 1). `rho` is the Dixon-Coles correction (0 = off). */
export function outcomeProbabilities(lambdaHome: number, lambdaAway: number, rho = 0): { home: number; draw: number; away: number } {
  const ph = poissonPmf(lambdaHome);
  const pa = poissonPmf(lambdaAway);
  let h = 0;
  let d = 0;
  let a = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      let p = ph[i] * pa[j];
      if (rho !== 0) {
        if (i === 0 && j === 0) p *= 1 - lambdaHome * lambdaAway * rho;
        else if (i === 0 && j === 1) p *= 1 + lambdaHome * rho;
        else if (i === 1 && j === 0) p *= 1 + lambdaAway * rho;
        else if (i === 1 && j === 1) p *= 1 - rho;
      }
      if (i > j) h += p;
      else if (i === j) d += p;
      else a += p;
    }
  }
  const z = h + d + a;
  return { home: h / z, draw: d / z, away: a / z };
}

/** Goals a team would concede per match against an average attack at a neutral venue —
 *  the opponent-adjusted defence figure (lower = better). */
export function defenceRating(fit: PoissonFit, teamId: string): number {
  return fit.c * Math.sqrt(fit.home) * (fit.def.get(teamId) ?? 1);
}
