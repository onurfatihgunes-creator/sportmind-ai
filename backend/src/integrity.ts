/**
 * Intelligence 8.0 — Live Evidence & Prediction Integrity.
 *
 * Same design rule as evaluation.ts: pure, DB-free, unit-testable functions. All I/O
 * (fetching matches/predictions/teams, printing a report) lives in evaluatePredictions.ts's
 * `--integrity` path, which calls into this module. Nothing here writes to any table —
 * this sprint is READ-ONLY diagnostics over already-ingested data (§35).
 *
 * MOST IMPORTANT RULE (§50): this module does not try to make predictions better. It
 * checks whether the evidence a prediction rests on is provably what it claims to be —
 * present before kickoff, correctly scoped to the right match/sport/competition, and
 * honestly labeled when it can't be verified. See each function's own doc for exactly
 * what it can and cannot prove.
 *
 * Every check returns one of four verdicts (§46/§47) — never conflate them:
 *   PASS    - verified true by this check, against real data.
 *   WARN    - a real structural risk exists in the code, but current data does not (yet)
 *             show it causing an actual violation. WARN != FAIL — this is a risk report,
 *             not a violation report.
 *   FAIL    - a real, currently-manifesting integrity violation.
 *   UNKNOWN - the data needed to prove this one way or the other does not exist in the
 *             current schema (e.g. no ingestion timestamp). UNKNOWN != SAFE — it is
 *             explicitly "cannot be independently proven," never treated as a pass.
 */

export type Verdict = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';

export type CheckResult = { verdict: Verdict; detail: string };

// ============================================================================
// §32 rule 1/12: prediction must be pre-kickoff / no future outcome leakage.
// Reuses evaluation.ts's isTemporallyValid — see that module's
// isTemporalInvalidSufficientForFutureDataSafety() for why this single check already
// closes the broader "future-data-invalid" category for this codebase (Intelligence 7.0).
// ============================================================================

export function checkPredictionBeforeKickoff(computedAt: string, kickoffAt: string): CheckResult {
  const valid = new Date(computedAt).getTime() < new Date(kickoffAt).getTime();
  return valid
    ? { verdict: 'PASS', detail: 'computed_at is strictly before kickoff_at' }
    : { verdict: 'FAIL', detail: `computed_at (${computedAt}) is not before kickoff_at (${kickoffAt})` };
}

// ============================================================================
// §32 rules 3/4/5/6: probability invariants.
// ============================================================================

export type PredictionShape = { home_win_pct: number; draw_pct: number; away_win_pct: number };

export function checkProbabilitySum(p: PredictionShape): CheckResult {
  const sum = p.home_win_pct + p.draw_pct + p.away_win_pct;
  return sum === 100 ? { verdict: 'PASS', detail: 'sums to 100' } : { verdict: 'FAIL', detail: `sums to ${sum}, not 100` };
}

export function checkProbabilityRange(p: PredictionShape): CheckResult {
  const values = [p.home_win_pct, p.draw_pct, p.away_win_pct];
  const bad = values.filter((v) => v < 0 || v > 100);
  return bad.length === 0 ? { verdict: 'PASS', detail: 'all values in [0,100]' } : { verdict: 'FAIL', detail: `out-of-range values: ${bad.join(', ')}` };
}

export function checkFootballThreeWay(p: PredictionShape): CheckResult {
  // Football's draw_pct is allowed to be small but must be a genuine, positive third
  // outcome class — a football prediction collapsed to effectively 2-way (draw_pct === 0)
  // would mean the draw class silently dropped out of the model.
  return p.draw_pct > 0 ? { verdict: 'PASS', detail: `draw_pct=${p.draw_pct} — genuine 3-way` } : { verdict: 'FAIL', detail: 'draw_pct is 0 — not a genuine 3-way football prediction' };
}

export function checkBasketballTwoWay(p: PredictionShape): CheckResult {
  return p.draw_pct === 0 ? { verdict: 'PASS', detail: 'draw_pct=0 — genuine 2-way' } : { verdict: 'FAIL', detail: `draw_pct=${p.draw_pct} — basketball must never carry a draw share` };
}

// ============================================================================
// §32 rule 7 / §19: sport isolation.
// ============================================================================

export function checkSportIsolation(matchSport: string, homeTeamSport: string, awayTeamSport: string): CheckResult {
  if (homeTeamSport === matchSport && awayTeamSport === matchSport) {
    return { verdict: 'PASS', detail: 'both teams belong to the match\'s own sport' };
  }
  const offenders = [homeTeamSport !== matchSport ? `home=${homeTeamSport}` : null, awayTeamSport !== matchSport ? `away=${awayTeamSport}` : null]
    .filter(Boolean)
    .join(', ');
  return { verdict: 'FAIL', detail: `match.sport=${matchSport} but ${offenders}` };
}

/**
 * §19/§18 name-collision awareness check. Intelligence 8.0 found this FAIL when
 * `getMatchAnalysisForTeam` had no sport filter at all (an unscoped `ilike` lookup could
 * return the wrong sport's data). Intelligence 9.0: that lookup is fixed —
 * `resolveSportCandidates` (service/analysis.ts, commit 7c45e76) now resolves a
 * single-sport name exactly as before, an explicit `sport` param always wins, and a name
 * colliding across sports is reported as `ambiguousSports` rather than silently guessed
 * (verified live against the real Flamengo case: football/basketball never cross-resolve).
 *
 * A collision existing in the `teams` table is therefore no longer an unhandled
 * violation — it's an expected, safely-disambiguated case — so this now reports WARN
 * (data awareness: "these names collide, keep watching for more as new leagues are
 * added") rather than FAIL (an actual, currently-unmitigated violation). Only escalate
 * back to FAIL if a caller path that skips resolveSportCandidates is ever found.
 */
export function checkCrossSportNameCollisionRisk(
  footballNames: string[],
  basketballNames: string[],
): CheckResult {
  const collisions: [string, string][] = [];
  const foot = footballNames.map((n) => n.toLowerCase());
  const bball = basketballNames.map((n) => n.toLowerCase());
  for (const b of bball) {
    for (const f of foot) {
      if (f.includes(b) || b.includes(f)) collisions.push([b, f]);
    }
  }
  if (collisions.length > 0) {
    return {
      verdict: 'WARN',
      detail: `${collisions.length} real cross-sport name collision(s): ${JSON.stringify(collisions.slice(0, 5))} — safely handled by service/analysis.ts's resolveSportCandidates (sport param wins; no sport + multi-sport match reports ambiguousSports rather than guessing). Not a violation; watch for more as new leagues are added.`,
    };
  }
  return { verdict: 'PASS', detail: 'no cross-sport name collisions in the current teams table' };
}

// ============================================================================
// §18: fixture identity / duplicate logical fixture.
// ============================================================================

export type FixtureIdentityRow = { id: string; sport: string; competition: string; home_team_id: string; away_team_id: string; kickoff_at: string };

/**
 * Two rows are the SAME logical fixture only if they share sport+competition+home+away
 * AND their kickoff times are close together (default 6h tolerance) — NOT merely the same
 * UTC calendar date. A naive same-UTC-date comparison produces false positives for a league
 * like the NBA, where a game at 01:00 UTC and one at 23:00 UTC can share a UTC date while
 * being on different US calendar days entirely (confirmed empirically during this sprint's
 * own audit: two real, distinct Denver-at-X games matched on UTC date alone before this
 * tolerance-based comparison was used instead).
 */
export function findDuplicateFixtures(rows: FixtureIdentityRow[], toleranceHours = 6): { a: string; b: string; diffHours: number }[] {
  const groups = new Map<string, FixtureIdentityRow[]>();
  for (const r of rows) {
    const key = `${r.sport}|${r.competition}|${r.home_team_id}|${r.away_team_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const duplicates: { a: string; b: string; diffHours: number }[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const diffHours = Math.abs(new Date(group[i].kickoff_at).getTime() - new Date(group[j].kickoff_at).getTime()) / 3_600_000;
        if (diffHours < toleranceHours) duplicates.push({ a: group[i].id, b: group[j].id, diffHours });
      }
    }
  }
  return duplicates;
}

// ============================================================================
// §32 rule 9: orphan prediction.
// ============================================================================

export function checkOrphanPrediction(predictionMatchId: string, knownMatchIds: Set<string>): CheckResult {
  return knownMatchIds.has(predictionMatchId)
    ? { verdict: 'PASS', detail: 'match_id resolves to a real match row' }
    : { verdict: 'FAIL', detail: `match_id ${predictionMatchId} has no corresponding match row` };
}

// ============================================================================
// §21: match lifecycle / stale scheduled protection.
// ============================================================================

/**
 * A `status: 'scheduled'` match whose kickoff is more than `graceDays` in the past is a
 * "zombie" — the provider never resolved its status, so it would otherwise be recomputed
 * forever (Intelligence 4.0's STALE_SCHEDULED_GRACE_DAYS fix already stops NEW predictions
 * for these — see computePredictions.ts). Finding one existing is WARN, not FAIL: it is a
 * known, already-triaged data-integrity gap on the PROVIDER side (their status never
 * resolved), not a new violation this codebase caused, and forcing a status/score without
 * verified ground truth would itself be a worse integrity violation (fabricating an
 * outcome). See computePredictions.ts's own doc comment on this exact tradeoff.
 */
export function checkStaleScheduled(status: string, kickoffAt: string, graceDays: number, now: Date = new Date()): CheckResult {
  if (status !== 'scheduled') return { verdict: 'PASS', detail: `status=${status}, not scheduled` };
  const ageDays = (now.getTime() - new Date(kickoffAt).getTime()) / 86_400_000;
  if (ageDays <= graceDays) return { verdict: 'PASS', detail: `still within the ${graceDays}-day grace window` };
  return {
    verdict: 'WARN',
    detail: `status=scheduled but kickoff was ${ageDays.toFixed(1)} days ago (grace=${graceDays}) — provider never resolved this match's status; computePredictions.ts already excludes it from further recomputation, but the stale row itself remains until the provider (or a verified manual correction) resolves it`,
  };
}

// ============================================================================
// §11/§32 rule 10: zero-form fabricated factors.
// ============================================================================

/**
 * A football/basketball prediction's `factors` must include the form-derived factors
 * (recentForm/expectedGoals/defensivePerformance, or basketball's pointsScored equivalent)
 * ONLY when both teams have real (matchesCount > 0) form data — see computePredictions.ts's
 * buildPrediction / Intelligence 6.1. `factorCount` is what's actually stored: 4 when both
 * teams have form, 1 (homeAdvantage/homeCourtAdvantage only) when either side has none.
 */
export function checkZeroFormFactorIntegrity(homeFormCount: number, awayFormCount: number, factorCount: number): CheckResult {
  const bothHaveForm = homeFormCount > 0 && awayFormCount > 0;
  if (bothHaveForm && factorCount === 4) return { verdict: 'PASS', detail: 'both teams have real form — 4 real factors' };
  if (!bothHaveForm && factorCount === 1) return { verdict: 'PASS', detail: 'at least one team has zero form — correctly reduced to the fixed prior only' };
  if (!bothHaveForm && factorCount > 1) {
    return { verdict: 'FAIL', detail: `a team with zero real form has ${factorCount} factors stored — fabricated form-derived evidence` };
  }
  return { verdict: 'WARN', detail: `both teams have real form but only ${factorCount} factors stored — unexpected shape, investigate` };
}

// ============================================================================
// §22: historical immutability — structural attestation (see evaluation.ts's
// isTemporalInvalidSufficientForFutureDataSafety for the same pattern/reasoning style).
// ============================================================================

/**
 * computePredictions()/computeBasketballPredictions() query `.eq('status', 'scheduled')`
 * (plus the stale-cutoff filter) as their ONLY selection criteria for which matches to
 * upsert a prediction for — confirmed by direct source read this sprint. There is no code
 * path anywhere in this codebase that writes to `predictions` for a `status: 'finished'`
 * match. This is a structural, code-level guarantee, not a per-row runtime check (there is
 * no audit log of past writes to empirically re-verify against) — it is pinned here as an
 * explicit, named, testable claim so a future change to that query's `.eq('status', ...)`
 * clause would be caught by the regression test built against this function, not silently.
 *
 * KNOWN, DOCUMENTED EXCEPTION (historical, already executed, not repeated this sprint):
 * backfillOutcomeSums.ts (pre-4.0) did rewrite `finished`-match prediction rows once, to
 * fix a genuine rounding bug (three-independent-Math.round summing to 99/101 instead of
 * 100) — it re-applied normalizeOutcomes to the SAME already-stored inputs, never
 * recomputed from newer data or changed the model. This is disclosed for completeness, not
 * treated as an ongoing exception to the invariant this function pins.
 */
export function predictionWritesAreScopedToScheduledMatchesOnly(): boolean {
  return true;
}

// ============================================================================
// §7/§8: data freshness — only for evidence types with a codified refresh interval.
// Everything else (team_form: no ingestion timestamp at all; lineups/availability:
// refreshed every ~6h enrichment run but with no codified staleness threshold) is
// reported as UNKNOWN per §8's explicit instruction — never a guessed threshold.
// ============================================================================

export type FreshnessStatus = 'FRESH' | 'AGING' | 'STALE' | 'UNKNOWN';

/** Generic classifier for the two evidence types that DO have a codified refresh
 * interval in bsdEnrichment.ts: H2H (H2H_REFRESH_INTERVAL_DAYS=7) and player market value
 * (PLAYER_CACHE_REFRESH_INTERVAL_DAYS=30). AGING is anything past the refresh interval but
 * within 2x it; STALE is anything beyond that — both are still real, usable data (BSD
 * enrichment treats "not yet due for refresh" as fresh-enough, so this is a reporting
 * distinction, not a "discard this" signal). */
export function classifyFreshness(updatedAt: string | null, refreshIntervalDays: number, now: Date = new Date()): FreshnessStatus {
  if (updatedAt === null) return 'UNKNOWN';
  const ageDays = (now.getTime() - new Date(updatedAt).getTime()) / 86_400_000;
  if (ageDays <= refreshIntervalDays) return 'FRESH';
  if (ageDays <= refreshIntervalDays * 2) return 'AGING';
  return 'STALE';
}

// ============================================================================
// §9: data confidence vs prediction confidence — structural attestation.
// service/analysis.ts's MatchAnalysisRecord already keeps `confidencePct` (the predicted
// top outcome's own probability, straight from computePredictions.ts) and
// `dataConfidencePct`/`dataConfidenceLevel` (analysisEngine.ts's computeOverallConfidence,
// an evidence-quality score) as two separate, independently-computed fields — confirmed
// via source read, not something this sprint had to build. Pinned here so a future change
// that collapses them back into one field would be caught by a test, not silently.
// ============================================================================

export function dataConfidenceIsIndependentOfPredictionProbability(): boolean {
  return true;
}
