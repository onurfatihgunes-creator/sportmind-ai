/**
 * V3 Phase B — separate basketball Elo engine (SHADOW ONLY: nothing here is wired into the
 * pipeline or shown to users; the live basketball engine is computeBasketballPredictions.ts).
 *
 * Pre-registered parameters (fixed BEFORE the prospective test, NOT fitted to its games):
 *   K = 20, margin-of-victory multiplier
 *   ((MOV + 3)^0.8) / (7.5 + 0.006 * winner's Elo edge) and a 25% reversion toward 1505
 *   between seasons — the published FiveThirtyEight NBA Elo design.
 *   Home advantage = 40 Elo: the value that fit best (log-likelihood grid) on games BEFORE the
 *   test start — first 1,125 live games, then confirmed on 4,232 games Oct 2023 - Nov 2026 incl.
 *   balldontlie history (home win rate 54.7%); 30-50 were all within 0.0005 log-loss. The literature value
 *   of 100 over-predicted home wins (61% predicted vs ~52-55% actual in recent NBA seasons).
 *   Rest variant (secondary hypothesis): a team on the second night of a back-to-back plays at
 *   -25 Elo. That value is a fixed a-priori assumption, deliberately not tuned.
 *
 * Pure and deterministic: given games in kickoff order it yields, for every game, the
 * probability computed from games that finished strictly earlier (a game never sees its own
 * result), so the same code serves a retrospective walk-forward and the prospective shadow test.
 */

export const ELO_PARAMS = {
  k: 20,
  homeAdvantage: 40,
  initialRating: 1500,
  seasonMean: 1505,
  seasonReversion: 0.25,
  /** A team idle for longer than this is treated as starting a new season. */
  newSeasonGapDays: 60,
  backToBackPenalty: 25,
  /** Second game within this many hours of the previous one = back-to-back. */
  backToBackHours: 36,
} as const;

export const ELO_MODEL_VERSION = 'elo-v1';
export const ELO_REST_MODEL_VERSION = 'elo-rest-v1';

export type EloGame = { id: string; home: string; away: string; t: number; homeScore: number | null; awayScore: number | null };

export function winProbability(eloDiff: number): number {
  return 1 / (1 + 10 ** (-eloDiff / 400));
}

/** FiveThirtyEight NBA margin-of-victory multiplier; `winnerEloEdge` includes home advantage. */
export function movMultiplier(mov: number, winnerEloEdge: number): number {
  return (mov + 3) ** 0.8 / (7.5 + 0.006 * winnerEloEdge);
}

export type PreGame = {
  gameId: string;
  /** P(home win), base Elo */
  pHome: number;
  /** P(home win), Elo with the back-to-back adjustment */
  pHomeRest: number;
  homeBackToBack: boolean;
  awayBackToBack: boolean;
  homeRestDays: number | null;
  awayRestDays: number | null;
  /** games each team had played (in our data) before this one — the evidence behind the rating */
  homeGamesPlayed: number;
  awayGamesPlayed: number;
};

type TeamState = { rating: number; lastPlayed: number | null; games: number };

/**
 * Walks games in time order. Unfinished games (null score) get a pre-game probability but
 * never update ratings. Games are processed in kickoff order; within identical kickoff times
 * no game can involve the same team twice, so order inside a tie does not matter.
 */
export function runElo(games: readonly EloGame[]): Map<string, PreGame> {
  const p = ELO_PARAMS;
  const teams = new Map<string, TeamState>();
  const state = (id: string) => {
    let s = teams.get(id);
    if (!s) {
      s = { rating: p.initialRating, lastPlayed: null, games: 0 };
      teams.set(id, s);
    }
    return s;
  };
  const out = new Map<string, PreGame>();
  const sorted = [...games].sort((a, b) => a.t - b.t);

  for (const g of sorted) {
    const h = state(g.home);
    const a = state(g.away);
    for (const s of [h, a]) {
      if (s.lastPlayed !== null && g.t - s.lastPlayed > p.newSeasonGapDays * 86_400_000) {
        s.rating = (1 - p.seasonReversion) * s.rating + p.seasonReversion * p.seasonMean;
      }
    }
    const restDays = (s: TeamState) => (s.lastPlayed === null ? null : (g.t - s.lastPlayed) / 86_400_000);
    const b2b = (s: TeamState) => s.lastPlayed !== null && g.t - s.lastPlayed <= p.backToBackHours * 3_600_000;
    const diff = h.rating + p.homeAdvantage - a.rating;
    const restAdj = (b2b(a) ? p.backToBackPenalty : 0) - (b2b(h) ? p.backToBackPenalty : 0);

    out.set(g.id, {
      gameId: g.id,
      pHome: winProbability(diff),
      pHomeRest: winProbability(diff + restAdj),
      homeBackToBack: b2b(h),
      awayBackToBack: b2b(a),
      homeRestDays: restDays(h),
      awayRestDays: restDays(a),
      homeGamesPlayed: h.games,
      awayGamesPlayed: a.games,
    });

    if (g.homeScore === null || g.awayScore === null || g.homeScore === g.awayScore) continue;
    const homeWon = g.homeScore > g.awayScore;
    const expected = winProbability(diff);
    const winnerEdge = homeWon ? diff : -diff;
    const shift = p.k * movMultiplier(Math.abs(g.homeScore - g.awayScore), winnerEdge) * ((homeWon ? 1 : 0) - expected);
    h.rating += shift;
    a.rating -= shift;
    h.lastPlayed = g.t;
    a.lastPlayed = g.t;
    h.games++;
    a.games++;
  }
  return out;
}
