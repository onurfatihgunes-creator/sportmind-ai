/**
 * Offline backtest for the additional goal markets (goalMarkets.ts) against SportMind's
 * own real historical football matches — the mandatory evidence gate before any of
 * these markets ships (see the "ADDITIONAL MATCH MARKETS" audit's Phase 5). Read-only:
 * never writes to `matches`/`predictions`/`team_form`.
 *
 * NO DATA LEAKAGE: for each historical finished match, xgHome/xgAway are recomputed
 * using ONLY `team_form` rows whose match_date is strictly before that match's own
 * kickoff date — never the rows a team accumulated afterward. This mirrors
 * getFormStats()'s exact windowing (last RECENT_FORM_MATCHES real matches, same neutral
 * 1.3/1.3 baseline when a side has none yet) from computePredictions.ts, just replayed
 * match-by-match in time order instead of "as of right now" for a scheduled fixture.
 *
 * Reuses evaluation.ts's existing SampleEvidence/classifySampleSize tiers and
 * calibration-bucket shape rather than inventing a second reporting convention.
 */
import { supabase } from './supabaseClient.js';
import { computeGoalMarkets, overUnderProbability, bttsProbability, teamGoalLineProbability, type OverUnderLine } from './goalMarkets.js';
import { classifySampleSize, type SampleEvidence } from './evaluation.js';

const RECENT_FORM_MATCHES = 5; // must match computePredictions.ts

type FinishedMatch = {
  id: string;
  competition: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  home_score: number;
  away_score: number;
};

type FormRow = { team_id: string; match_date: string; goals_for: number; goals_against: number };

/** Same neutral-baseline rule as getFormStats() in computePredictions.ts — a side with
 * zero real prior matches gets the same placeholder, never a fabricated real average. */
function formStatsAsOf(rows: FormRow[], teamId: string, beforeDate: string): { avgGoalsFor: number; avgGoalsAgainst: number; matchesCount: number } {
  const prior = rows
    .filter((r) => r.team_id === teamId && r.match_date < beforeDate)
    .sort((a, b) => (a.match_date < b.match_date ? 1 : -1))
    .slice(0, RECENT_FORM_MATCHES);
  if (prior.length === 0) return { avgGoalsFor: 1.3, avgGoalsAgainst: 1.3, matchesCount: 0 };
  const goalsFor = prior.reduce((s, r) => s + r.goals_for, 0);
  const goalsAgainst = prior.reduce((s, r) => s + r.goals_against, 0);
  return { avgGoalsFor: goalsFor / prior.length, avgGoalsAgainst: goalsAgainst / prior.length, matchesCount: prior.length };
}

export type BacktestSample = {
  matchId: string;
  competition: string;
  xgHome: number;
  xgAway: number;
  bothHaveForm: boolean;
  bothTrusted: boolean; // >=3 real matches each, same MIN_TRUSTED_FORM_SAMPLE bar as data/dataConfidence.ts
  homeScore: number;
  awayScore: number;
};

/** Pure: replays the same xG formula match-by-match. Exported for direct unit testing
 * without a database (pass in already-fetched matches/form rows). */
export function buildBacktestSamples(matches: FinishedMatch[], formRows: FormRow[]): BacktestSample[] {
  return matches.map((m) => {
    const homeStats = formStatsAsOf(formRows, m.home_team_id, m.kickoff_at.slice(0, 10));
    const awayStats = formStatsAsOf(formRows, m.away_team_id, m.kickoff_at.slice(0, 10));
    const xgHome = Number(((homeStats.avgGoalsFor + awayStats.avgGoalsAgainst) / 2).toFixed(1));
    const xgAway = Number(((awayStats.avgGoalsFor + homeStats.avgGoalsAgainst) / 2).toFixed(1));
    return {
      matchId: m.id,
      competition: m.competition,
      xgHome,
      xgAway,
      bothHaveForm: homeStats.matchesCount > 0 && awayStats.matchesCount > 0,
      bothTrusted: homeStats.matchesCount >= 3 && awayStats.matchesCount >= 3,
      homeScore: m.home_score,
      awayScore: m.away_score,
    };
  });
}

export type MarketBacktestResult = { market: string; n: number; brier: number; evidence: SampleEvidence; calibration: { bucket: string; n: number; avgPredicted: number; actualRate: number }[] };

function binaryCalibrationBuckets(preds: number[], actuals: number[]): { bucket: string; n: number; avgPredicted: number; actualRate: number }[] {
  const buckets: { lo: number; preds: number[]; actuals: number[] }[] = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, preds: [], actuals: [] }));
  for (let i = 0; i < preds.length; i++) {
    const idx = Math.min(9, Math.floor(preds[i] * 10));
    buckets[idx].preds.push(preds[i]);
    buckets[idx].actuals.push(actuals[i]);
  }
  return buckets
    .filter((b) => b.preds.length > 0)
    .map((b) => ({
      bucket: `${Math.round(b.lo * 100)}-${Math.round((b.lo + 0.1) * 100)}%`,
      n: b.preds.length,
      avgPredicted: b.preds.reduce((a, x) => a + x, 0) / b.preds.length,
      actualRate: b.actuals.reduce((a, x) => a + x, 0) / b.actuals.length,
    }));
}

/** §H1-style check, mirroring evaluation.ts's existing "does the engine beat the
 * in-sample base rate" hypothesis for the 1X2 model: a market that cannot beat "always
 * guess the sample's own observed frequency" carries no real predictive value, no
 * matter how plausible its calibration buckets look in isolation. */
function baseRateBrier(acts: (0 | 1)[]): number {
  const n = acts.length;
  if (n === 0) return NaN;
  const rate = acts.reduce<number>((s, a) => s + a, 0) / n;
  return acts.reduce<number>((sum, a) => sum + (rate - a) ** 2, 0) / n;
}

export function backtestBinaryMarket(name: string, samples: BacktestSample[], predict: (s: BacktestSample) => number, actual: (s: BacktestSample) => 0 | 1): MarketBacktestResult & { baseRateBrier: number; beatsBaseRate: boolean } {
  const preds = samples.map(predict);
  const acts = samples.map(actual);
  const n = samples.length;
  const brier = n === 0 ? NaN : preds.reduce((sum, p, i) => sum + (p - acts[i]) ** 2, 0) / n;
  const baseline = baseRateBrier(acts);
  return { market: name, n, brier, evidence: classifySampleSize(n), calibration: binaryCalibrationBuckets(preds, acts), baseRateBrier: baseline, beatsBaseRate: brier < baseline };
}

export function scorelineHitRates(samples: BacktestSample[]): { n: number; top1: number; top3: number; top5: number } {
  let top1 = 0, top3 = 0, top5 = 0;
  for (const s of samples) {
    const ranked = computeGoalMarkets(s.xgHome, s.xgAway, 20).topScorelines;
    const rank = ranked.findIndex((r) => r.home === s.homeScore && r.away === s.awayScore);
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 3) top3++;
    if (rank >= 0 && rank < 5) top5++;
  }
  const n = samples.length;
  return { n, top1: n ? top1 / n : NaN, top3: n ? top3 / n : NaN, top5: n ? top5 / n : NaN };
}

/** Same "does match-specific input actually help" check as baseRateBrier, applied to
 * correct score: does the model's OWN per-match xG-derived ranking beat simply always
 * guessing this sample's single most common scorelines (no match-specific input at
 * all)? If not, the per-match xG variation isn't adding anything a fixed league-wide
 * list wouldn't already give. */
export function scorelineBaselineHitRates(samples: BacktestSample[]): { n: number; top1: number; top3: number; top5: number } {
  const counts = new Map<string, number>();
  for (const s of samples) {
    const key = `${s.homeScore}-${s.awayScore}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  let top1 = 0, top3 = 0, top5 = 0;
  for (const s of samples) {
    const key = `${s.homeScore}-${s.awayScore}`;
    const rank = ranked.indexOf(key);
    if (rank === 0) top1++;
    if (rank >= 0 && rank < 3) top3++;
    if (rank >= 0 && rank < 5) top5++;
  }
  const n = samples.length;
  return { n, top1: n ? top1 / n : NaN, top3: n ? top3 / n : NaN, top5: n ? top5 / n : NaN };
}

/** Supabase caps a single `select` at 1000 rows by default — both source tables here
 * exceed that (1999 finished matches, 5699 team_form rows as of this audit), so a plain
 * unpaginated query would silently work off an arbitrary ~50% slice and skew every
 * number below. Pages through with `.range()` until a page comes back short. */
async function fetchAll<T>(table: string, select: string, apply: (q: any) => any): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];
  for (;;) {
    const { data, error } = await apply(supabase.from(table).select(select).range(from, from + pageSize - 1));
    if (error) throw error;
    all.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const matches = await fetchAll<FinishedMatch>(
    'matches',
    'id, competition, home_team_id, away_team_id, kickoff_at, home_score, away_score',
    (q) => q.eq('sport', 'football').eq('status', 'finished').not('home_score', 'is', null).not('away_score', 'is', null).order('kickoff_at', { ascending: true }),
  );
  const formRows = await fetchAll<FormRow>('team_form', 'team_id, match_date, goals_for, goals_against', (q) => q);

  const samples = buildBacktestSamples(matches, formRows);
  const trusted = samples.filter((s) => s.bothTrusted);
  const withForm = samples.filter((s) => s.bothHaveForm);

  console.log(`Total finished football matches: ${samples.length}`);
  console.log(`Both sides have >=1 real prior match: ${withForm.length}`);
  console.log(`Both sides have >=3 real prior matches (trusted): ${trusted.length}\n`);

  for (const pool of [{ label: 'ALL (>=1 real match each side)', samples: withForm }, { label: 'TRUSTED (>=3 real matches each side)', samples: trusted }]) {
    console.log(`=== ${pool.label} — n=${pool.samples.length} ===`);

    for (const line of [1.5, 2.5, 3.5] as OverUnderLine[]) {
      const r = backtestBinaryMarket(
        `Over ${line}`,
        pool.samples,
        (s) => overUnderProbability(s.xgHome, s.xgAway, line).over,
        (s) => (s.homeScore + s.awayScore > line ? 1 : 0),
      );
      console.log(`Over ${line}: n=${r.n} brier=${r.brier.toFixed(4)} vs base-rate=${r.baseRateBrier.toFixed(4)} beats=${r.beatsBaseRate} evidence=${r.evidence}`);
      for (const b of r.calibration) console.log(`  ${b.bucket}: n=${b.n} predicted=${(b.avgPredicted * 100).toFixed(1)}% actual=${(b.actualRate * 100).toFixed(1)}%`);
    }

    const btts = backtestBinaryMarket('BTTS', pool.samples, (s) => bttsProbability(s.xgHome, s.xgAway).yes, (s) => (s.homeScore >= 1 && s.awayScore >= 1 ? 1 : 0));
    console.log(`BTTS Yes: n=${btts.n} brier=${btts.brier.toFixed(4)} vs base-rate=${btts.baseRateBrier.toFixed(4)} beats=${btts.beatsBaseRate} evidence=${btts.evidence}`);
    for (const b of btts.calibration) console.log(`  ${b.bucket}: n=${b.n} predicted=${(b.avgPredicted * 100).toFixed(1)}% actual=${(b.actualRate * 100).toFixed(1)}%`);

    for (const [sideLabel, xgKey, scoreKey] of [['Home', 'xgHome', 'homeScore'], ['Away', 'xgAway', 'awayScore']] as const) {
      for (const line of [0.5, 1.5, 2.5] as OverUnderLine[]) {
        const r = backtestBinaryMarket(
          `${sideLabel} Over ${line}`,
          pool.samples,
          (s) => teamGoalLineProbability(s[xgKey], line).over,
          (s) => (s[scoreKey] > line ? 1 : 0),
        );
        console.log(`${sideLabel} Over ${line}: n=${r.n} brier=${r.brier.toFixed(4)} vs base-rate=${r.baseRateBrier.toFixed(4)} beats=${r.beatsBaseRate} evidence=${r.evidence}`);
        for (const b of r.calibration) console.log(`  ${b.bucket}: n=${b.n} predicted=${(b.avgPredicted * 100).toFixed(1)}% actual=${(b.actualRate * 100).toFixed(1)}%`);
      }
    }

    const scoreline = scorelineHitRates(pool.samples);
    const scorelineBaseline = scorelineBaselineHitRates(pool.samples);
    console.log(`Correct score hit-rate (model): n=${scoreline.n} top1=${(scoreline.top1 * 100).toFixed(1)}% top3=${(scoreline.top3 * 100).toFixed(1)}% top5=${(scoreline.top5 * 100).toFixed(1)}%`);
    console.log(`Correct score hit-rate (fixed most-common-scorelines baseline): top1=${(scorelineBaseline.top1 * 100).toFixed(1)}% top3=${(scorelineBaseline.top3 * 100).toFixed(1)}% top5=${(scorelineBaseline.top5 * 100).toFixed(1)}%`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
