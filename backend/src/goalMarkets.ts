/**
 * Additional football goal markets (Over/Under totals, BTTS, team goal lines, correct
 * score) — derived MATHEMATICALLY from the exact same xG the engine already computes
 * and shows (`xgHome`/`xgAway` in computePredictions.ts's `buildPrediction`), not a
 * second/parallel prediction system. Pure, DB-free, deterministic (same design rule as
 * evaluation.ts/analysisEngine.ts) so it is directly unit-testable and reusable from
 * both the live prediction pipeline and the offline backtest in backtestGoalMarkets.ts.
 *
 * MODEL: home goals ~ Poisson(xgHome), away goals ~ Poisson(xgAway), independent of
 * each other. This is the standard, textbook baseline goal model for football (Maher
 * 1982) — chosen because it needs no input beyond what SportMind already validates and
 * displays (xgHome/xgAway), and every market below is a direct, well-known mathematical
 * consequence of that one assumption, not a separate invented mechanic per market.
 *
 * LIMITS OF THE INDEPENDENCE ASSUMPTION (stated once, applies to every market here):
 * real matches have some negative correlation between home/away goals (a team that goes
 * 2-0 up tends to sit back, reducing further goals both ways) that a plain independent
 * Poisson model does not capture. This is a known, accepted simplification of the
 * baseline model, not an oversight — backtestGoalMarkets.ts checks empirically whether
 * it still calibrates acceptably on SportMind's own real historical matches before any
 * market here ships. xgHome/xgAway themselves are a simple recent-goal-average, not a
 * shot-quality xG model — every market inherits that same limitation from the existing
 * engine; nothing here claims a more precise input than the one already on screen.
 */

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** P(X = k) for X ~ Poisson(lambda). */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

/** P(X <= k) for X ~ Poisson(lambda). */
export function poissonCdf(k: number, lambda: number): number {
  let sum = 0;
  for (let i = 0; i <= k; i++) sum += poissonPmf(i, lambda);
  return sum;
}

export type OverUnderLine = 1.5 | 2.5 | 3.5;
export const OVER_UNDER_LINES: OverUnderLine[] = [1.5, 2.5, 3.5];

/** Total goals (home + away) is Poisson(xgHome + xgAway) — the sum of two independent
 * Poisson variables is itself Poisson with the summed rate; no separate distribution to
 * derive. `line` is always X.5, so "over" is exactly `1 - P(total <= floor(line))`. */
export function overUnderProbability(xgHome: number, xgAway: number, line: OverUnderLine): { over: number; under: number } {
  const lambda = xgHome + xgAway;
  const under = poissonCdf(Math.floor(line), lambda);
  return { over: 1 - under, under };
}

/** Both Teams To Score — P(home >= 1) * P(away >= 1) under independence. */
export function bttsProbability(xgHome: number, xgAway: number): { yes: number; no: number } {
  const pHomeZero = poissonPmf(0, xgHome);
  const pAwayZero = poissonPmf(0, xgAway);
  const no = pHomeZero + pAwayZero - pHomeZero * pAwayZero; // P(home=0 OR away=0)
  return { yes: 1 - no, no };
}

/** One side's own goal line (e.g. "home over 1.5") — the same Poisson(xg) already used
 * for that side alone, no cross-team term. */
export function teamGoalLineProbability(xg: number, line: OverUnderLine): { over: number; under: number } {
  const under = poissonCdf(Math.floor(line), xg);
  return { over: 1 - under, under };
}

export type ScorelineProbability = { home: number; away: number; probability: number };

/** Joint scoreline grid P(home=i, away=j) = Poisson(i; xgHome) * Poisson(j; xgAway),
 * capped at MAX_GOALS a side (realistic upper bound for football; the tail beyond this
 * is negligible — see this function's own test for the exact residual). Returned sorted
 * most-to-least likely; caller decides how many to surface. */
const MAX_GOALS_PER_SIDE = 8;

export function scorelineDistribution(xgHome: number, xgAway: number): ScorelineProbability[] {
  const rows: ScorelineProbability[] = [];
  for (let h = 0; h <= MAX_GOALS_PER_SIDE; h++) {
    for (let a = 0; a <= MAX_GOALS_PER_SIDE; a++) {
      rows.push({ home: h, away: a, probability: poissonPmf(h, xgHome) * poissonPmf(a, xgAway) });
    }
  }
  return rows.sort((x, y) => y.probability - x.probability);
}

export type GoalMarkets = {
  overUnder: Record<OverUnderLine, { over: number; under: number }>;
  btts: { yes: number; no: number };
  teamGoals: {
    home: Record<OverUnderLine, { over: number; under: number }>;
    away: Record<OverUnderLine, { over: number; under: number }>;
  };
  /** Top-N most likely scorelines only — a 100%-summing full grid is not meant for
   * direct display (see this module's header doc: MAX_GOALS_PER_SIDE bounds the tail). */
  topScorelines: ScorelineProbability[];
};

/** Everything computed from one (xgHome, xgAway) pair — deterministic, pure, no I/O.
 * `topN` bounds how many scorelines the caller gets back (UI only ever shows a
 * handful — see match/[id].tsx's own "a few highest-probability results" requirement). */
export function computeGoalMarkets(xgHome: number, xgAway: number, topN = 5): GoalMarkets {
  const overUnder = {} as Record<OverUnderLine, { over: number; under: number }>;
  const teamGoalsHome = {} as Record<OverUnderLine, { over: number; under: number }>;
  const teamGoalsAway = {} as Record<OverUnderLine, { over: number; under: number }>;
  for (const line of OVER_UNDER_LINES) {
    overUnder[line] = overUnderProbability(xgHome, xgAway, line);
    teamGoalsHome[line] = teamGoalLineProbability(xgHome, line);
    teamGoalsAway[line] = teamGoalLineProbability(xgAway, line);
  }
  return {
    overUnder,
    btts: bttsProbability(xgHome, xgAway),
    teamGoals: { home: teamGoalsHome, away: teamGoalsAway },
    topScorelines: scorelineDistribution(xgHome, xgAway).slice(0, topN),
  };
}
