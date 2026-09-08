/**
 * Prediction Evaluation Loop — CLI report. Read-only: fetches matches/predictions/
 * team_form from Supabase (paginated — see §34, this dataset will keep growing) and runs
 * them through evaluation.ts's pure functions. Never writes to any table, never calls an
 * external provider — the whole point (§29) is that this can be re-run anytime, as often
 * as wanted, purely from what the ingestion pipeline already stored, without adding any
 * load or risk to that pipeline.
 *
 * Run with: npm run evaluate            (human-readable)
 *           npm run evaluate -- --json  (machine-readable, for tooling/CI)
 */
import { supabase } from './supabaseClient.js';
import { ENGINE_VERSION as FOOTBALL_ENGINE_VERSION } from './computePredictions.js';
import { ENGINE_VERSION as BASKETBALL_ENGINE_VERSION } from './computeBasketballPredictions.js';
import {
  calibrationBuckets,
  classifyCandidate,
  classifyCompetitionEvidence,
  classifyDataLevel,
  classifyDecisionGate,
  classifySampleSize,
  classRates,
  computeMetrics,
  monthKey,
  outcomeClasses,
  resolveOutcome,
  toClassProbs,
  uniformBaseline,
  alwaysHomeBaseline,
  baseRateBaseline,
  evaluateBaseline,
  expectedCalibrationError,
  wilsonInterval,
  extremeProbabilitySummary,
  rollingHistoricalBaseline,
  timeSplit,
  calibrationDriftAlert,
  xgSignalDirectionAgreement,
  buildHypothesisRegister,
  type MatchRow,
  type PredictionRow,
  type Outcome,
  type Sport,
} from './evaluation.js';
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
  type Verdict,
  type CheckResult,
} from './integrity.js';
import { H2H_REFRESH_INTERVAL_DAYS, PLAYER_CACHE_REFRESH_INTERVAL_DAYS } from './bsdEnrichment.js';

const PAGE = 1000;

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

type Sample = {
  match: MatchRow;
  probs: ReturnType<typeof toClassProbs>;
  actual: Outcome;
  dataLevel: ReturnType<typeof classifyDataLevel>;
  xgHome: number;
  xgAway: number;
};

type FullPredictionRow = PredictionRow & { xg_home: number; xg_away: number };

/**
 * Intelligence 8.0 §31: read-only diagnostic — `npm run evaluate -- --integrity`. Fetches
 * the minimal real data each check needs (never fabricates a value) and runs every
 * integrity.ts check across the CURRENT full dataset, not just the leakage-free evaluated
 * sample the rest of this file uses. Never writes anything (§35).
 */
async function runIntegrityAudit() {
  const matches = await fetchAll<{
    id: string;
    sport: string;
    competition: string;
    status: string;
    home_team_id: string;
    away_team_id: string;
    kickoff_at: string;
  }>('matches', 'id, sport, competition, status, home_team_id, away_team_id, kickoff_at');
  const predictions = await fetchAll<FullPredictionRow & { factors: unknown }>(
    'predictions',
    'match_id, home_win_pct, draw_pct, away_win_pct, computed_at, xg_home, xg_away, factors',
  );
  const teams = await fetchAll<{ id: string; name: string; sport: string }>('teams', 'id, name, sport');
  const teamForm = await fetchAll<{ team_id: string }>('team_form', 'team_id');
  const h2hRows = await fetchAll<{ match_id: string; updated_at: string }>('match_h2h', 'match_id, updated_at').catch(() => []);
  const playerCacheRows = await fetchAll<{ id: number; updated_at: string }>('bsd_players', 'id, updated_at').catch(() => []);

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const knownMatchIds = new Set(matches.map((m) => m.id));
  const formCountByTeam = new Map<string, number>();
  for (const r of teamForm) formCountByTeam.set(r.team_id, (formCountByTeam.get(r.team_id) ?? 0) + 1);

  const results: { rule: string; result: CheckResult }[] = [];
  const tally: Record<Verdict, number> = { PASS: 0, WARN: 0, FAIL: 0, UNKNOWN: 0 };
  function record(rule: string, result: CheckResult) {
    results.push({ rule, result });
    tally[result.verdict]++;
  }

  // 1/12: prediction before kickoff (temporal integrity / future-outcome-leakage-by-proxy)
  for (const p of predictions) {
    const m = matchById.get(p.match_id);
    if (!m) continue;
    record(`prediction-before-kickoff:${p.match_id}`, checkPredictionBeforeKickoff(p.computed_at, m.kickoff_at));
  }

  // 3/4/5/6: probability invariants + football 3-way / basketball 2-way
  for (const p of predictions) {
    const m = matchById.get(p.match_id);
    record(`probability-sum:${p.match_id}`, checkProbabilitySum(p));
    record(`probability-range:${p.match_id}`, checkProbabilityRange(p));
    if (m?.sport === 'football') record(`football-3way:${p.match_id}`, checkFootballThreeWay(p));
    if (m?.sport === 'basketball') record(`basketball-2way:${p.match_id}`, checkBasketballTwoWay(p));
  }

  // 7: sport isolation
  for (const m of matches) {
    const home = teamById.get(m.home_team_id);
    const away = teamById.get(m.away_team_id);
    if (home && away) record(`sport-isolation:${m.id}`, checkSportIsolation(m.sport, home.sport, away.sport));
  }
  const footballNames = teams.filter((t) => t.sport === 'football').map((t) => t.name);
  const basketballNames = teams.filter((t) => t.sport === 'basketball').map((t) => t.name);
  record('cross-sport-name-collision-risk', checkCrossSportNameCollisionRisk(footballNames, basketballNames));

  // 8: duplicate logical fixture
  const duplicates = findDuplicateFixtures(matches);
  record('duplicate-logical-fixture', duplicates.length === 0 ? { verdict: 'PASS', detail: '0 duplicates across all matches' } : { verdict: 'FAIL', detail: `${duplicates.length} duplicate(s): ${JSON.stringify(duplicates.slice(0, 5))}` });

  // 9: orphan prediction
  for (const p of predictions) record(`orphan-prediction:${p.match_id}`, checkOrphanPrediction(p.match_id, knownMatchIds));

  // stale scheduled protection
  for (const m of matches) record(`stale-scheduled:${m.id}`, checkStaleScheduled(m.status, m.kickoff_at, 3));

  // 10: zero-form fabricated factors
  for (const p of predictions) {
    const m = matchById.get(p.match_id);
    if (!m) continue;
    const homeFormN = formCountByTeam.get(m.home_team_id) ?? 0;
    const awayFormN = formCountByTeam.get(m.away_team_id) ?? 0;
    const factorCount = Array.isArray(p.factors) ? p.factors.length : 0;
    record(`zero-form-integrity:${p.match_id}`, checkZeroFormFactorIntegrity(homeFormN, awayFormN, factorCount));
  }

  // 11: historical immutability (structural, not per-row)
  record('historical-immutability', predictionWritesAreScopedToScheduledMatchesOnly() ? { verdict: 'PASS', detail: 'computePredictions()/computeBasketballPredictions() only ever query status=scheduled — see integrity.ts doc' } : { verdict: 'FAIL', detail: 'structural claim failed' });

  // data confidence vs prediction confidence (structural)
  record('data-confidence-independence', dataConfidenceIsIndependentOfPredictionProbability() ? { verdict: 'PASS', detail: 'confidencePct and dataConfidencePct are separate, independently-computed fields — see service/analysis.ts' } : { verdict: 'FAIL', detail: 'structural claim failed' });

  // data freshness for the two evidence types with a codified refresh interval
  const h2hFreshness = h2hRows.map((r) => classifyFreshness(r.updated_at, H2H_REFRESH_INTERVAL_DAYS));
  const playerCacheFreshness = playerCacheRows.map((r) => classifyFreshness(r.updated_at, PLAYER_CACHE_REFRESH_INTERVAL_DAYS));
  const freshnessSummary = {
    h2h: { n: h2hRows.length, fresh: h2hFreshness.filter((f) => f === 'FRESH').length, aging: h2hFreshness.filter((f) => f === 'AGING').length, stale: h2hFreshness.filter((f) => f === 'STALE').length },
    playerMarketValueCache: { n: playerCacheRows.length, fresh: playerCacheFreshness.filter((f) => f === 'FRESH').length, aging: playerCacheFreshness.filter((f) => f === 'AGING').length, stale: playerCacheFreshness.filter((f) => f === 'STALE').length },
    teamForm: 'UNKNOWN — no ingestion timestamp column exists (only match_date, the date of the match a row DESCRIBES)',
    lineupsAvailability: 'UNKNOWN — refreshed every ~6h enrichment run, but no codified staleness threshold exists in code to classify against',
  };

  return {
    generatedAt: new Date().toISOString(),
    counts: { matches: matches.length, predictions: predictions.length, teams: teams.length },
    tally,
    freshness: freshnessSummary,
    failures: results.filter((r) => r.result.verdict === 'FAIL'),
    warnings: results.filter((r) => r.result.verdict === 'WARN'),
  };
}

async function main() {
  if (process.argv.includes('--integrity')) {
    const report = await runIntegrityAudit();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const asJson = process.argv.includes('--json');

  const matches = await fetchAll<MatchRow>(
    'matches',
    'id, sport, competition, status, home_score, away_score, home_team_id, away_team_id, kickoff_at',
  );
  const predictions = await fetchAll<FullPredictionRow>(
    'predictions',
    'match_id, home_win_pct, draw_pct, away_win_pct, computed_at, xg_home, xg_away',
  );
  const teamForm = await fetchAll<{ team_id: string; match_date: string }>('team_form', 'team_id, match_date');

  const predByMatch = new Map(predictions.map((p) => [p.match_id, p]));
  const formCountByTeam = new Map<string, number>();
  for (const r of teamForm) formCountByTeam.set(r.team_id, (formCountByTeam.get(r.team_id) ?? 0) + 1);

  // §32: every candidate is accounted for exactly once, valid or excluded-with-a-reason.
  const exclusions: Record<string, number> = {};
  const samplesBySport: Record<Sport, Sample[]> = { football: [], basketball: [] };

  for (const m of matches) {
    const p = predByMatch.get(m.id);
    const verdict = classifyCandidate(m, p);
    if (!verdict.ok) {
      exclusions[verdict.reason] = (exclusions[verdict.reason] ?? 0) + 1;
      continue;
    }
    const sport = m.sport as Sport;
    const actual = resolveOutcome(sport, m.home_score!, m.away_score!)!;
    const probs = toClassProbs(sport, p!);
    const homeFormN = formCountByTeam.get(m.home_team_id) ?? 0;
    const awayFormN = formCountByTeam.get(m.away_team_id) ?? 0;
    const dataLevel = classifyDataLevel(Math.min(homeFormN, awayFormN));
    samplesBySport[sport].push({ match: m, probs, actual, dataLevel, xgHome: p!.xg_home, xgAway: p!.xg_away });
  }

  const report: Record<string, unknown> = { generatedAt: new Date().toISOString() };

  report.dataset = {
    totalMatches: matches.length,
    totalPredictions: predictions.length,
    exclusions,
    validSamples: { football: samplesBySport.football.length, basketball: samplesBySport.basketball.length },
    futureDataInvalid: {
      additionalExclusions: 0,
      conclusion:
        'temporal_invalid is already sufficient as the future-data-invalid gate for this codebase — see isTemporalInvalidSufficientForFutureDataSafety() in evaluation.ts for the structural argument (computePredictions only targets scheduled/future-kickoff matches; team_form is only ever written post-hoc). An empirical per-row proxy was tried and REJECTED: comparing every team_form row against computed_at flagged 40/45 samples, but that only detects "this team has played more matches since" (expected, harmless), not real leakage — confirmed via direct query. No schema change (an ingestion timestamp on team_form) exists to do better than this structural argument, and none is being added this sprint.',
    },
  };

  for (const sport of ['football', 'basketball'] as Sport[]) {
    const classes = outcomeClasses(sport);
    const samples = samplesBySport[sport];
    const overall = computeMetrics(samples, classes);
    const sortedByTime = [...samples].sort((a, b) => a.match.kickoff_at.localeCompare(b.match.kickoff_at));
    const decisionGate = classifyDecisionGate(samples.length);

    const accuracyCI = overall
      ? wilsonInterval(Math.round(overall.accuracy * overall.n), overall.n)
      : null;

    const baselines = overall
      ? [
          uniformBaseline(classes),
          alwaysHomeBaseline(classes),
          { ...baseRateBaseline(classes, classRates(samples, classes)), name: 'base-rate (IN-SAMPLE, not future-safe)' },
        ].map((b) => ({
          name: b.name,
          ...evaluateBaseline(samples, b, classes),
        }))
      : [];

    // §c/§e: future-safe rolling-historical baseline — walk-forward over time-sorted
    // samples, each prediction using only strictly-earlier samples' class rates.
    const rolling = rollingHistoricalBaseline(sortedByTime, classes, 5);
    const rollingHistoricalMetrics = computeMetrics(rolling.evaluated, classes);
    const rollingHistoricalBaselineReport = {
      excludedForHistory: rolling.excludedForHistory,
      metrics: rollingHistoricalMetrics,
      note: 'FUTURE-SAFE (walk-forward): each prediction uses only class rates from strictly earlier matches, unlike the base-rate baseline above which is in-sample.',
    };

    // §d: time-split scaffolding — architecture only, explicitly not used for any
    // conclusion this sprint.
    const split = timeSplit(sortedByTime, 0.7, 0.15);
    const timeSplitReport = {
      sizes: { train: split.train.length, validation: split.validation.length, test: split.test.length },
      note:
        samples.length < 150
          ? 'INSUFFICIENT FOR ROBUST HOLDOUT — built as reusable architecture for when sample size grows, not used for any conclusion this sprint.'
          : 'sample size supports a holdout split, but no holdout-based conclusion is drawn this sprint per the "measure, do not tune" mandate.',
    };

    const calibration: Record<string, ReturnType<typeof calibrationBuckets>> = {};
    for (const c of classes) calibration[c] = calibrationBuckets(samples, c);

    const eceByClass: Record<string, number> = {};
    for (const c of classes) eceByClass[c] = expectedCalibrationError(calibration[c]);
    const eceOverall =
      Object.values(eceByClass).filter((v) => !Number.isNaN(v)).length > 0
        ? Object.values(eceByClass).filter((v) => !Number.isNaN(v)).reduce((a, x) => a + x, 0) /
          Object.values(eceByClass).filter((v) => !Number.isNaN(v)).length
        : NaN;
    const driftAlert = calibrationDriftAlert(samples.length, Number.isNaN(eceOverall) ? 0 : eceOverall, 0.1);

    const extremeProbabilities = extremeProbabilitySummary(samples, classes);

    const xgSignal = xgSignalDirectionAgreement(samples);

    const byCompetition: Record<string, unknown> = {};
    if (sport === 'football') {
      const comps = [...new Set(samples.map((s) => s.match.competition))];
      for (const comp of comps) {
        const subset = samples.filter((s) => s.match.competition === comp);
        byCompetition[comp] = {
          n: subset.length,
          evidence: classifyCompetitionEvidence(subset.length),
          metrics: computeMetrics(subset, classes),
          note: 'n<30 insufficient / 30-99 directional / >=100 meaningful — never a "best league" claim (§x multiple-comparisons caution).',
        };
      }
    }

    const byDataLevel: Record<string, unknown> = {};
    for (const level of ['none', 'limited', 'good', 'full'] as const) {
      const subset = samples.filter((s) => s.dataLevel === level);
      byDataLevel[level] = { n: subset.length, metrics: computeMetrics(subset, classes) };
    }

    const monthGroups = new Map<string, Sample[]>();
    for (const s of samples) {
      const key = monthKey(s.match.kickoff_at);
      if (!monthGroups.has(key)) monthGroups.set(key, []);
      monthGroups.get(key)!.push(s);
    }
    const byMonthMetrics: Record<string, unknown> = {};
    for (const [key, subset] of [...monthGroups.entries()].sort()) {
      byMonthMetrics[key] = { n: subset.length, evidence: classifySampleSize(subset.length), metrics: computeMetrics(subset, classes) };
    }

    const rollingLast30 = sortedByTime.slice(-30);
    const rollingLast100 = sortedByTime.slice(-100);

    const homeActualRate = overall ? classRates(samples, classes).home ?? null : null;
    const drawBucket = calibration['draw']?.[0] ?? null;
    const extremeLow = extremeProbabilities.find((b) => b.band === 'low(<20%)') ?? null;
    const extremeHigh = extremeProbabilities.find((b) => b.band === 'high(>80%)') ?? null;
    const competitionEvidenceLevels = Object.values(byCompetition).map((c: any) => c.evidence as string) as any;

    const hypotheses = buildHypothesisRegister({
      n: samples.length,
      decisionGate,
      engineBrier: overall?.brier ?? Infinity,
      baseRateBrier: baselines.find((b) => b.name.startsWith('base-rate'))?.brier ?? Infinity,
      drawBucketBias: drawBucket ? drawBucket.bias : null,
      homeAdvantagePredicted: { home: 62, away: 38 },
      homeActualRate,
      fullDataMetrics: (byDataLevel as any).full?.metrics ?? null,
      limitedOrNoneDataMetrics: (byDataLevel as any).limited?.metrics ?? (byDataLevel as any).none?.metrics ?? null,
      extremeLowBias: extremeLow?.bias ?? null,
      extremeHighBias: extremeHigh?.bias ?? null,
      xgAgreementRate: Number.isNaN(xgSignal.agreementRate) ? null : xgSignal.agreementRate,
      competitionEvidenceLevels,
    });

    report[sport] = {
      overall: overall ?? 'NO METRICS (n=0)',
      accuracyConfidenceInterval95: accuracyCI,
      decisionGate,
      baselines,
      rollingHistoricalBaseline: rollingHistoricalBaselineReport,
      timeSplit: timeSplitReport,
      calibration,
      expectedCalibrationError: { byClass: eceByClass, overall: eceOverall },
      calibrationDriftAlert: driftAlert,
      extremeProbabilities,
      xgSignalDirectionAgreement: xgSignal,
      byCompetition: sport === 'football' ? byCompetition : undefined,
      byDataLevel,
      byMonth: byMonthMetrics,
      rolling: {
        last30: { n: rollingLast30.length, metrics: computeMetrics(rollingLast30, classes) },
        last100: { n: rollingLast100.length, metrics: computeMetrics(rollingLast100, classes) },
      },
      hypotheses,
    };
  }

  report.engine = {
    football: { version: FOOTBALL_ENGINE_VERSION, formulaChanged: false },
    basketball: { version: BASKETBALL_ENGINE_VERSION, formulaChanged: false },
    versioning:
      'No schema/engine_version column exists (predictions.factors is a documented, consumed jsonb shape — adding a marker there would be a breaking contract change). ENGINE_VERSION is a lightweight code-level constant; the real audit trail is git history. DEFERRED again this sprint, consistent with 5.0/6.0.',
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== SPORTMIND PREDICTION EVALUATION ===');
    console.log(JSON.stringify(report.dataset, null, 2));
    for (const sport of ['football', 'basketball']) {
      console.log(`\n--- ${sport.toUpperCase()} ---`);
      console.log(JSON.stringify((report as any)[sport].overall, null, 2));
      console.log('baselines:', JSON.stringify((report as any)[sport].baselines, null, 2));
    }
    console.log('\n(run with --json for the full machine-readable report)');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
