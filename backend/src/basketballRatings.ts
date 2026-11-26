/**
 * Basketball candidate #2 (SHADOW ONLY, not wired into the pipeline): margin-based team ratings
 * (Massey / SRS family). Each game says "home margin = home advantage + rating(home) -
 * rating(away) + noise"; ratings are a time-weighted ridge least-squares fit of that over games
 * finished before the day of the game, and P(home win) = Phi(predicted margin / SIGMA).
 *
 * Pre-registered parameters (fixed before the prospective test, not tuned on it):
 *   half-life 120 days (recent games count more; the off-season decays old form naturally),
 *   ridge = 4 pseudo-games pulling each rating toward league average (0),
 *   SIGMA = 12 points (the usual spread of NBA game margins around expectation).
 *   Home advantage is not a constant: it is estimated in each fit from the training games.
 */
import type { EloGame } from './basketballElo.js';

export const MARGIN_PARAMS = { halfLifeDays: 120, ridgeGames: 4, sigma: 12, iterations: 60 } as const;
export const MARGIN_MODEL_VERSION = 'margin-v1';

const DAY = 86_400_000;

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 erf approximation, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export type MarginFit = { ratings: Map<string, number>; homeAdvantage: number; games: number };

/** Ridge fit on finished games strictly before `at` (ms). */
export function fitMargins(games: readonly EloGame[], at: number): MarginFit {
  const p = MARGIN_PARAMS;
  const xi = Math.LN2 / p.halfLifeDays;
  const train = games
    .filter((g) => g.t < at && g.homeScore !== null && g.awayScore !== null)
    .map((g) => ({ h: g.home, a: g.away, m: g.homeScore! - g.awayScore!, w: Math.exp((-xi * (at - g.t)) / DAY) }));
  const r = new Map<string, number>();
  for (const g of train) {
    r.set(g.h, 0);
    r.set(g.a, 0);
  }
  let hca = 0;
  for (let it = 0; it < p.iterations; it++) {
    let num = 0;
    let den = 0;
    for (const g of train) {
      num += g.w * (g.m - r.get(g.h)! + r.get(g.a)!);
      den += g.w;
    }
    hca = den > 0 ? num / den : 0;
    const n = new Map<string, number>();
    const d = new Map<string, number>();
    for (const t of r.keys()) {
      n.set(t, 0);
      d.set(t, p.ridgeGames);
    }
    for (const g of train) {
      n.set(g.h, n.get(g.h)! + g.w * (g.m - hca + r.get(g.a)!));
      d.set(g.h, d.get(g.h)! + g.w);
      n.set(g.a, n.get(g.a)! + g.w * (-(g.m - hca) + r.get(g.h)!));
      d.set(g.a, d.get(g.a)! + g.w);
    }
    for (const t of r.keys()) r.set(t, n.get(t)! / d.get(t)!);
  }
  return { ratings: r, homeAdvantage: hca, games: train.length };
}

/** Walk-forward: one fit per calendar day (UTC), from games finished before that day. */
export function runMarginRatings(games: readonly EloGame[]): Map<string, { pHome: number; predictedMargin: number }> {
  const out = new Map<string, { pHome: number; predictedMargin: number }>();
  const sorted = [...games].sort((a, b) => a.t - b.t);
  let fitDay = -1;
  let fit: MarginFit | null = null;
  for (const g of sorted) {
    const day = Math.floor(g.t / DAY);
    if (day !== fitDay) {
      fit = fitMargins(sorted, day * DAY);
      fitDay = day;
    }
    const margin = fit!.homeAdvantage + (fit!.ratings.get(g.home) ?? 0) - (fit!.ratings.get(g.away) ?? 0);
    out.set(g.id, { pHome: normalCdf(margin / MARGIN_PARAMS.sigma), predictedMargin: margin });
  }
  return out;
}
