/**
 * Analysis Intelligence Engine — deterministic, explainable signal computation over
 * SportMind's own already-ingested data. Deliberately pure/DB-free: every function here
 * takes already-fetched rows and returns a value, so the same input always produces the
 * same output (see MASTER PROMPT PHASE 2 §9) and so it can be unit-tested without a
 * database (§18). All I/O (fetching team_form/matches/BSD tables, writing analysis_changes)
 * lives in service/analysis.ts and bsdEnrichment.ts, which call into this module.
 *
 * This is an EXPLANATION layer over the existing prediction (computePredictions.ts) —
 * it never changes a prediction percentage, only explains the data behind one. See §2.
 *
 * Every signal is honest about missing data: an unavailable metric is reported as
 * `available: false`, never a fabricated or zero-defaulted value (§11).
 */

export type SignalConfidence = 'none' | 'low' | 'medium' | 'high';
export type Side = 'home' | 'away';
export type Advantage = Side | 'even' | null;

export type SignalCategory = 'FORM' | 'ATTACK' | 'DEFENCE' | 'POSSESSION' | 'HOME_ADVANTAGE' | 'H2H';

export type Signal = {
  category: SignalCategory;
  metric: string;
  available: boolean;
  homeValue: number | null;
  awayValue: number | null;
  advantage: Advantage;
  magnitude: number; // 0..1 — normalized size of the home/away gap, 0 when not available
  confidence: SignalConfidence;
  source: string;
  timestamp: string | null;
  note?: string;
};

const CONFIDENCE_WEIGHT: Record<SignalConfidence, number> = { none: 0, low: 0.33, medium: 0.66, high: 1 };

function unavailableSignal(category: SignalCategory, metric: string, source: string, note: string): Signal {
  return {
    category,
    metric,
    available: false,
    homeValue: null,
    awayValue: null,
    advantage: null,
    magnitude: 0,
    confidence: 'none',
    source,
    timestamp: null,
    note,
  };
}

function confidenceFromSampleSize(n: number): SignalConfidence {
  if (n === 0) return 'none';
  if (n <= 2) return 'low';
  if (n <= 4) return 'medium';
  return 'high';
}

/** Maps a raw home/away gap onto 0..1 via a fixed scale — deliberately simple (linear,
 * clamped) rather than a fitted curve, since there is not enough historical outcome data
 * to fit one honestly yet (same caveat as computePredictions.ts's v1 formula). */
function magnitudeFromGap(gap: number, scale: number): number {
  return Math.min(1, Math.abs(gap) / scale);
}

function advantageFromGap(gap: number, epsilon: number): Advantage {
  if (Math.abs(gap) < epsilon) return 'even';
  return gap > 0 ? 'home' : 'away';
}

// ---------------------------------------------------------------------------
// A. FORM
// ---------------------------------------------------------------------------

export type FormRow = { result: 'W' | 'D' | 'L'; goals_for: number; goals_against: number };

export type FormAggregate = {
  matchesCount: number;
  pointsPerGame: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  cleanSheetRate: number; // 0..1
  formString: string; // oldest -> newest, e.g. "LWDWW"
};

/** `rows` must already be ordered most-recent-first (as team_form is queried elsewhere). */
export function aggregateForm(rows: FormRow[]): FormAggregate {
  if (rows.length === 0) {
    return { matchesCount: 0, pointsPerGame: 0, avgGoalsFor: 0, avgGoalsAgainst: 0, cleanSheetRate: 0, formString: '' };
  }
  const points = rows.reduce((sum, r) => sum + (r.result === 'W' ? 3 : r.result === 'D' ? 1 : 0), 0);
  const goalsFor = rows.reduce((sum, r) => sum + r.goals_for, 0);
  const goalsAgainst = rows.reduce((sum, r) => sum + r.goals_against, 0);
  const cleanSheets = rows.filter((r) => r.goals_against === 0).length;

  return {
    matchesCount: rows.length,
    pointsPerGame: points / rows.length,
    avgGoalsFor: goalsFor / rows.length,
    avgGoalsAgainst: goalsAgainst / rows.length,
    cleanSheetRate: cleanSheets / rows.length,
    formString: [...rows].reverse().map((r) => r.result).join(''),
  };
}

export function computeFormSignal(home: FormAggregate, away: FormAggregate, timestamp: string | null): Signal {
  if (home.matchesCount === 0 && away.matchesCount === 0) {
    return unavailableSignal('FORM', 'points_per_game', 'team_form', 'No recent results for either team yet.');
  }
  const gap = home.pointsPerGame - away.pointsPerGame;
  return {
    category: 'FORM',
    metric: 'points_per_game',
    available: true,
    homeValue: Number(home.pointsPerGame.toFixed(2)),
    awayValue: Number(away.pointsPerGame.toFixed(2)),
    advantage: advantageFromGap(gap, 0.15),
    magnitude: magnitudeFromGap(gap, 2), // a 2 PPG gap (e.g. 3.0 vs 1.0) is treated as maximal
    confidence: confidenceFromSampleSize(Math.min(home.matchesCount, away.matchesCount)),
    source: 'team_form',
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// B/C/D. ATTACK / DEFENCE / POSSESSION
// ---------------------------------------------------------------------------

/** One team's BSD-derived per-match sample, already resolved to "for this team" vs
 * "against this team" by the caller (which knows which side — home/away — the team
 * played in each of its own recent matches). Only matches where BSD actually recorded
 * non-null values are included by the caller — never a zero-filled placeholder. */
export type BsdTeamMatchSample = {
  xgFor: number | null;
  xgAgainst: number | null;
  shotsFor: number | null;
  shotsOnTargetFor: number | null;
  possession: number | null;
  // The underlying match_stats_raw row's own updated_at — NOT the prediction's or any
  // other table's timestamp. Used so a BSD-derived signal reports how fresh the BSD data
  // itself is, never borrowing a different table's freshness (§8: "old data = fresh").
  updatedAt: string | null;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Most recent of a set of ISO timestamps (nulls ignored) — null only when none exist. */
export function latestOf(timestamps: (string | null)[]): string | null {
  const real = timestamps.filter((t): t is string => t !== null);
  if (real.length === 0) return null;
  return real.reduce((latest, t) => (new Date(t).getTime() > new Date(latest).getTime() ? t : latest));
}

export function computeAttackSignals(
  homeForm: FormAggregate,
  awayForm: FormAggregate,
  homeBsd: BsdTeamMatchSample[],
  awayBsd: BsdTeamMatchSample[],
  formTimestamp: string | null,
): Signal[] {
  const signals: Signal[] = [];

  if (homeForm.matchesCount === 0 && awayForm.matchesCount === 0) {
    signals.push(unavailableSignal('ATTACK', 'goals_scored_per_game', 'team_form', 'No recent results for either team yet.'));
  } else {
    const gap = homeForm.avgGoalsFor - awayForm.avgGoalsFor;
    signals.push({
      category: 'ATTACK',
      metric: 'goals_scored_per_game',
      available: true,
      homeValue: Number(homeForm.avgGoalsFor.toFixed(2)),
      awayValue: Number(awayForm.avgGoalsFor.toFixed(2)),
      advantage: advantageFromGap(gap, 0.2),
      magnitude: magnitudeFromGap(gap, 1.5),
      confidence: confidenceFromSampleSize(Math.min(homeForm.matchesCount, awayForm.matchesCount)),
      source: 'team_form',
      timestamp: formTimestamp,
    });
  }

  const homeXg = average(homeBsd.map((s) => s.xgFor).filter((v): v is number => v !== null));
  const awayXg = average(awayBsd.map((s) => s.xgFor).filter((v): v is number => v !== null));
  if (homeXg === null || awayXg === null) {
    signals.push(unavailableSignal('ATTACK', 'expected_goals_for', 'bsd_match_stats', 'No BSD match-stats coverage for recent matches of one or both teams.'));
  } else {
    const gap = homeXg - awayXg;
    signals.push({
      category: 'ATTACK',
      metric: 'expected_goals_for',
      available: true,
      homeValue: Number(homeXg.toFixed(2)),
      awayValue: Number(awayXg.toFixed(2)),
      advantage: advantageFromGap(gap, 0.15),
      magnitude: magnitudeFromGap(gap, 1.2),
      confidence: confidenceFromSampleSize(Math.min(homeBsd.length, awayBsd.length)),
      source: 'bsd_match_stats',
      // The BSD samples' own freshness, not the prediction's or form's.
      timestamp: latestOf([...homeBsd.map((s) => s.updatedAt), ...awayBsd.map((s) => s.updatedAt)]),
    });
  }

  return signals;
}

export function computeDefenceSignals(
  homeForm: FormAggregate,
  awayForm: FormAggregate,
  homeBsd: BsdTeamMatchSample[],
  awayBsd: BsdTeamMatchSample[],
  formTimestamp: string | null,
): Signal[] {
  const signals: Signal[] = [];

  if (homeForm.matchesCount === 0 && awayForm.matchesCount === 0) {
    signals.push(unavailableSignal('DEFENCE', 'goals_conceded_per_game', 'team_form', 'No recent results for either team yet.'));
  } else {
    // Lower goals-against is the stronger defence, so the gap is inverted relative to ATTACK.
    const gap = awayForm.avgGoalsAgainst - homeForm.avgGoalsAgainst;
    signals.push({
      category: 'DEFENCE',
      metric: 'goals_conceded_per_game',
      available: true,
      homeValue: Number(homeForm.avgGoalsAgainst.toFixed(2)),
      awayValue: Number(awayForm.avgGoalsAgainst.toFixed(2)),
      advantage: advantageFromGap(gap, 0.2),
      magnitude: magnitudeFromGap(gap, 1.5),
      confidence: confidenceFromSampleSize(Math.min(homeForm.matchesCount, awayForm.matchesCount)),
      source: 'team_form',
      timestamp: formTimestamp,
    });

    signals.push({
      category: 'DEFENCE',
      metric: 'clean_sheet_rate',
      available: true,
      homeValue: Number(homeForm.cleanSheetRate.toFixed(2)),
      awayValue: Number(awayForm.cleanSheetRate.toFixed(2)),
      advantage: advantageFromGap(homeForm.cleanSheetRate - awayForm.cleanSheetRate, 0.1),
      magnitude: magnitudeFromGap(homeForm.cleanSheetRate - awayForm.cleanSheetRate, 0.6),
      confidence: confidenceFromSampleSize(Math.min(homeForm.matchesCount, awayForm.matchesCount)),
      source: 'team_form',
      timestamp: formTimestamp,
    });
  }

  const homeXga = average(homeBsd.map((s) => s.xgAgainst).filter((v): v is number => v !== null));
  const awayXga = average(awayBsd.map((s) => s.xgAgainst).filter((v): v is number => v !== null));
  if (homeXga === null || awayXga === null) {
    signals.push(unavailableSignal('DEFENCE', 'expected_goals_against', 'bsd_match_stats', 'No BSD match-stats coverage for recent matches of one or both teams.'));
  } else {
    const gap = awayXga - homeXga;
    signals.push({
      category: 'DEFENCE',
      metric: 'expected_goals_against',
      available: true,
      homeValue: Number(homeXga.toFixed(2)),
      awayValue: Number(awayXga.toFixed(2)),
      advantage: advantageFromGap(gap, 0.15),
      magnitude: magnitudeFromGap(gap, 1.2),
      confidence: confidenceFromSampleSize(Math.min(homeBsd.length, awayBsd.length)),
      source: 'bsd_match_stats',
      timestamp: latestOf([...homeBsd.map((s) => s.updatedAt), ...awayBsd.map((s) => s.updatedAt)]),
    });
  }

  return signals;
}

export function computePossessionSignal(homeBsd: BsdTeamMatchSample[], awayBsd: BsdTeamMatchSample[]): Signal {
  const homePoss = average(homeBsd.map((s) => s.possession).filter((v): v is number => v !== null));
  const awayPoss = average(awayBsd.map((s) => s.possession).filter((v): v is number => v !== null));
  if (homePoss === null || awayPoss === null) {
    return unavailableSignal('POSSESSION', 'avg_possession_pct', 'bsd_match_stats', 'No BSD possession data for recent matches of one or both teams.');
  }
  const gap = homePoss - awayPoss;
  return {
    category: 'POSSESSION',
    metric: 'avg_possession_pct',
    available: true,
    homeValue: Number(homePoss.toFixed(1)),
    awayValue: Number(awayPoss.toFixed(1)),
    advantage: advantageFromGap(gap, 3),
    magnitude: magnitudeFromGap(gap, 20),
    confidence: confidenceFromSampleSize(Math.min(homeBsd.length, awayBsd.length)),
    source: 'bsd_match_stats',
    timestamp: latestOf([...homeBsd.map((s) => s.updatedAt), ...awayBsd.map((s) => s.updatedAt)]),
  };
}

// ---------------------------------------------------------------------------
// F. HOME ADVANTAGE
// ---------------------------------------------------------------------------

/** Reuses the exact fixed prior computePredictions.ts already applies (62/38) — not a
 * new number, just surfaced as an explainable signal rather than only a hidden factor. */
export function computeHomeAdvantageSignal(homePriorPct: number, awayPriorPct: number): Signal {
  return {
    category: 'HOME_ADVANTAGE',
    metric: 'fixed_prior_pct',
    available: true,
    homeValue: homePriorPct,
    awayValue: awayPriorPct,
    advantage: 'home',
    magnitude: magnitudeFromGap(homePriorPct - awayPriorPct, 40),
    confidence: 'medium', // a league-wide historical prior, not team-specific data — never 'high'
    source: 'fixed_prior',
    timestamp: null,
  };
}

// ---------------------------------------------------------------------------
// G. H2H — sourced from BSD's /events/{id}/h2h/ (see bsdEnrichment.ts's persistH2H).
// Deliberately damped (§4: "H2H'yi prediction'ın ana belirleyicisi yapma") — confidence
// is capped at 'medium' regardless of sample size, same conservative treatment as the
// fixed home-advantage prior, since head-to-head history is suggestive context, not a
// team's current form.
// ---------------------------------------------------------------------------

export type H2HAggregate = {
  totalMatches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
};

export function computeH2HSignal(h2h: H2HAggregate | null, timestamp: string | null): Signal {
  // total_matches: 0 is BSD's own "no indexed history for this pair" — never treated as
  // a 0-0 record, and a null h2h (not yet ingested / not BSD-covered) is identical.
  if (h2h === null || h2h.totalMatches === 0) {
    return unavailableSignal('H2H', 'head_to_head_win_rate', 'bsd_h2h', 'No head-to-head history available for this pair.');
  }

  const homeRate = h2h.homeWins / h2h.totalMatches;
  const awayRate = h2h.awayWins / h2h.totalMatches;
  const gap = homeRate - awayRate;

  return {
    category: 'H2H',
    metric: 'head_to_head_win_rate',
    available: true,
    homeValue: Number(homeRate.toFixed(2)),
    awayValue: Number(awayRate.toFixed(2)),
    advantage: advantageFromGap(gap, 0.1),
    magnitude: magnitudeFromGap(gap, 0.5),
    // Capped at 'medium': a small sample (e.g. 2-3 historical meetings) never earns
    // 'high' confidence regardless of how lopsided the record looks.
    confidence: h2h.totalMatches >= 5 ? 'medium' : 'low',
    source: 'bsd_h2h',
    timestamp,
  };
}

// ---------------------------------------------------------------------------
// E. SQUAD / PLAYER IMPACT
// ---------------------------------------------------------------------------

export type AvailabilityRow = {
  team: Side;
  playerName: string;
  status: string;
  reason: string | null;
  // Real, provider-sourced market value (EUR) for this player when resolved — see
  // bsdEnrichment.ts's resolvePlayerMarketValue. null/undefined when not resolved
  // (no bsd_player_id, cache miss not yet backfilled, or BSD had no value for them).
  marketValueEur?: number | null;
};
export type PlayerImpactLevel = 'low' | 'medium' | 'high';

export type PlayerImpactEntry = {
  team: Side;
  playerName: string;
  status: string;
  reason: string | null;
  impact: PlayerImpactLevel;
  confidence: SignalConfidence;
  source: string;
};

const CERTAIN_ABSENCE_STATUSES = new Set(['injured', 'suspended']);

/** A market value at or above this is treated as "clearly a first-team/star-caliber
 * player" across SportMind's actual Tier-1 scope (top-5 European leagues + UCL +
 * Süper Lig) — chosen as a conservative, round, defensible floor rather than fitted to
 * any specific league, so it stays honest across very different league value scales. */
const HIGH_IMPACT_MARKET_VALUE_EUR = 20_000_000;

/**
 * §7/§12: a player's importance is only ever raised above 'medium' when a REAL,
 * provider-sourced number backs it (market_value_eur from BSD's /players/{id}/ — see
 * resolvePlayerMarketValue's caching policy) — never guessed from name recognition or
 * aggregated from the sparse, name-less match_player_stats endpoint. No market value
 * resolved -> stays capped at 'medium', exactly as before this was added.
 */
export function derivePlayerImpact(rows: AvailabilityRow[]): PlayerImpactEntry[] {
  return rows.map((r) => {
    const certain = CERTAIN_ABSENCE_STATUSES.has(r.status);
    const isKeyByMarketValue = certain && (r.marketValueEur ?? 0) >= HIGH_IMPACT_MARKET_VALUE_EUR;
    return {
      team: r.team,
      playerName: r.playerName,
      status: r.status,
      reason: r.reason,
      impact: isKeyByMarketValue ? 'high' : certain ? 'medium' : 'low',
      confidence: isKeyByMarketValue ? 'high' : certain ? 'medium' : 'low',
      source: isKeyByMarketValue ? 'bsd_lineups+bsd_players' : 'bsd_lineups',
    };
  });
}

export type SquadDepthSignal = Signal & { homeCertainAbsences: number; awayCertainAbsences: number };

export function computeSquadDepthSignal(availability: AvailabilityRow[], timestamp: string | null): SquadDepthSignal {
  const homeCertain = availability.filter((r) => r.team === 'home' && CERTAIN_ABSENCE_STATUSES.has(r.status)).length;
  const awayCertain = availability.filter((r) => r.team === 'away' && CERTAIN_ABSENCE_STATUSES.has(r.status)).length;

  if (availability.length === 0) {
    return {
      ...unavailableSignal('DEFENCE', 'squad_depth', 'bsd_lineups', 'No lineup/availability data yet for this match.'),
      category: 'DEFENCE',
      homeCertainAbsences: 0,
      awayCertainAbsences: 0,
    };
  }

  const gap = awayCertain - homeCertain; // more away absences favours home, matching advantageFromGap's sign convention
  return {
    category: 'DEFENCE',
    metric: 'squad_depth',
    available: true,
    homeValue: homeCertain,
    awayValue: awayCertain,
    advantage: advantageFromGap(gap, 1),
    magnitude: magnitudeFromGap(gap, 4),
    confidence: 'medium',
    source: 'bsd_lineups',
    timestamp,
    homeCertainAbsences: homeCertain,
    awayCertainAbsences: awayCertain,
  };
}

// ---------------------------------------------------------------------------
// H. CONFIDENCE — data quality/consistency, NOT the prediction's own win probability
// (§12: these are explicitly different things; predictions.home_win_pct etc. are
// untouched by this module).
// ---------------------------------------------------------------------------

export type OverallConfidence = {
  pct: number; // 0..100
  level: SignalConfidence;
  availableSignals: number;
  totalSignals: number;
};

export function computeOverallConfidence(signals: Signal[]): OverallConfidence {
  if (signals.length === 0) return { pct: 0, level: 'none', availableSignals: 0, totalSignals: 0 };

  const available = signals.filter((s) => s.available);
  const coverage = available.length / signals.length;
  const avgConfidenceWeight = available.length === 0 ? 0 : available.reduce((sum, s) => sum + CONFIDENCE_WEIGHT[s.confidence], 0) / available.length;

  const pct = Math.round(100 * (0.5 * coverage + 0.5 * avgConfidenceWeight));
  const level: SignalConfidence = pct >= 75 ? 'high' : pct >= 50 ? 'medium' : pct >= 25 ? 'low' : 'none';

  return { pct, level, availableSignals: available.length, totalSignals: signals.length };
}

// ---------------------------------------------------------------------------
// F./6. KEY FACTORS
// ---------------------------------------------------------------------------

export type KeyFactor = {
  key: string;
  title: string;
  explanation: string;
  impact: Advantage;
  confidence: SignalConfidence;
  supportingData: Record<string, number | string | null>;
};

function formatTeamName(side: Side, homeName: string, awayName: string): string {
  return side === 'home' ? homeName : awayName;
}

/**
 * Ranks real, available signals (plus squad depth) by confidence-weighted magnitude and
 * returns the top 3-5 as explainable factors. A signal that is unavailable, or whose
 * advantage is 'even'/null, never becomes a key factor (§6: "yalnızca gerçek veriden
 * üret" — no factor is ever synthesized to fill a quota).
 */
export function deriveKeyFactors(
  signals: Signal[],
  squadDepth: SquadDepthSignal,
  homeName: string,
  awayName: string,
): KeyFactor[] {
  type Candidate = { signal: Signal; weight: number; toFactor: () => KeyFactor };
  const candidates: Candidate[] = [];

  for (const s of signals) {
    if (!s.available || s.advantage === 'even' || s.advantage === null) continue;
    const leader = formatTeamName(s.advantage, homeName, awayName);
    // H2H is explicitly damped (§4: never the primary driver) — historical meetings
    // between these two teams specifically, as opposed to either team's current form,
    // stay a secondary/tie-breaking signal rather than competing equally with FORM/ATTACK.
    const categoryDamping = s.category === 'H2H' ? 0.6 : 1;
    const weight = CONFIDENCE_WEIGHT[s.confidence] * s.magnitude * categoryDamping;
    if (weight <= 0) continue;

    candidates.push({
      signal: s,
      weight,
      toFactor: () => ({
        key: `${s.category.toLowerCase()}_${s.metric}`,
        title: `${leader} advantage: ${s.metric.replace(/_/g, ' ')}`,
        explanation: `${leader} leads on ${s.metric.replace(/_/g, ' ')} (home ${s.homeValue} vs away ${s.awayValue}), based on ${s.source}.`,
        impact: s.advantage,
        confidence: s.confidence,
        supportingData: { homeValue: s.homeValue, awayValue: s.awayValue, source: s.source },
      }),
    });
  }

  if (squadDepth.available && squadDepth.advantage !== 'even' && squadDepth.advantage !== null) {
    const weakSide: Side = squadDepth.advantage === 'home' ? 'away' : 'home';
    const weakCount = weakSide === 'home' ? squadDepth.homeCertainAbsences : squadDepth.awayCertainAbsences;
    if (weakCount > 0) {
      const weakName = formatTeamName(weakSide, homeName, awayName);
      candidates.push({
        signal: squadDepth,
        // Squad absences are weighted slightly above their raw magnitude — a confirmed
        // injury/suspension is concrete, unlike a statistical gap — but still bounded by
        // the same 0..1 magnitude scale, never forced to the top artificially.
        weight: CONFIDENCE_WEIGHT[squadDepth.confidence] * Math.min(1, squadDepth.magnitude * 1.2),
        toFactor: () => ({
          key: 'squad_depth_absence',
          title: `${weakName} missing ${weakCount} key player${weakCount > 1 ? 's' : ''}`,
          explanation: `${weakName} has ${weakCount} player(s) ruled out (injured/suspended) for this match, based on bsd_lineups.`,
          impact: squadDepth.advantage,
          confidence: squadDepth.confidence,
          supportingData: { homeCertainAbsences: squadDepth.homeCertainAbsences, awayCertainAbsences: squadDepth.awayCertainAbsences },
        }),
      });
    }
  }

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates.slice(0, 5).map((c) => c.toFactor());
}

// ---------------------------------------------------------------------------
// 8. CHANGE INTELLIGENCE — pure comparators. Callers (bsdEnrichment.ts) own reading
// the "previous" state from the DB and writing the resulting change rows; these
// functions never touch I/O so they stay unit-testable and duplicate-safe by
// construction (same previous/next in -> same result out, §18 idempotency tests).
// ---------------------------------------------------------------------------

export type DetectedChange = {
  changeType: string;
  category: string;
  previousValue: string | null;
  newValue: string;
};

/** Returns null when there is nothing to report: no prior state (`hasPriorState` is
 * false — the very first time this match was ever enriched, §8 "İlk ingestion'da
 * previous value yoksa change oluşturma"), or the value genuinely didn't change. */
export function detectLineupStatusChange(hasPriorState: boolean, previous: string | null, next: string): DetectedChange | null {
  if (!hasPriorState) return null;
  if (previous === next) return null;
  return { changeType: 'lineup_status_changed', category: 'squad', previousValue: previous, newValue: next };
}

/** `previousNames`/`nextNames` are the unavailable-player names for one team on one
 * match, before and after this enrichment run. Only emits changes when there WAS a
 * previous snapshot to compare against. */
export function detectAvailabilityDelta(hasPriorState: boolean, previousNames: string[], nextNames: string[]): DetectedChange[] {
  if (!hasPriorState) return [];
  const prevSet = new Set(previousNames);
  const nextSet = new Set(nextNames);

  const changes: DetectedChange[] = [];
  for (const name of nextNames) {
    if (!prevSet.has(name)) changes.push({ changeType: 'player_unavailable', category: 'squad', previousValue: null, newValue: name });
  }
  for (const name of previousNames) {
    if (!nextSet.has(name)) changes.push({ changeType: 'player_available_again', category: 'squad', previousValue: name, newValue: name });
  }
  return changes;
}
