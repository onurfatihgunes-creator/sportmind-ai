/**
 * One shared answer to "do we have enough real recent history to trust this" — used
 * anywhere a screen would otherwise treat a team's `form` sample size as a signal on its
 * own terms. Before this existed, three different places asked essentially the same
 * question with three different (undocumented, accidentally-different) bars:
 *   - match/[id].tsx's win-probability caveat: any sample at all vs. none (>0 vs 0)
 *   - TeamIntelligence's form-trend chip: same (>0 vs 0)
 *   - liveData.ts's attack/defence trend (`goalsTrend`): explicitly requires >=3 real
 *     matches in both the recent and prior window before calling a direction at all
 * The third one is the considered, already-shipped bar — it was picked deliberately
 * ("a team with less history than that gets no trend rather than a guess from a
 * too-small sample"), not a placeholder. Reusing it here means the whole app agrees on
 * what "enough data" means, rather than each screen inventing its own threshold.
 */
export const MIN_TRUSTED_FORM_SAMPLE = 3;

export type FormDataLevel = 'full' | 'limited' | 'none';

/** `form` is already capped at 5 recent results (see liveData.ts) — 5 is as "full" as this
 * data source ever gets, 1-2 is a real but thin sample, 0 is none at all. */
export function formDataLevel(form: readonly unknown[]): FormDataLevel {
  if (form.length === 0) return 'none';
  if (form.length < MIN_TRUSTED_FORM_SAMPLE) return 'limited';
  return 'full';
}

/** A match's two teams don't always have matching data richness — the weaker side of the
 * pair is what should drive any user-facing caveat, since a confident number for one team
 * and a guess for the other is still, overall, a less-trustworthy prediction. */
export function matchFormDataLevel(homeForm: readonly unknown[], awayForm: readonly unknown[]): FormDataLevel {
  const levels = [formDataLevel(homeForm), formDataLevel(awayForm)];
  if (levels.includes('none')) return 'none';
  if (levels.includes('limited')) return 'limited';
  return 'full';
}

/** True when a form sample is too thin to trust ANY direction/label derived from it —
 * the shared gate for anything that would otherwise silently compute a signal from 1-2
 * matches (e.g. a naive win/loss tally). Deliberately the same bar as `goalsTrend`'s. */
export function hasTrustedFormSample(form: readonly unknown[]): boolean {
  return form.length >= MIN_TRUSTED_FORM_SAMPLE;
}

// ---------------------------------------------------------------------------
// Home's "is this analysis fit to recommend" gate.
//
// Home surfaces matches as the day's recommendations, so a prediction percentage alone is not
// enough: backend/src/computePredictions.ts (and the basketball twin) writes a valid-looking
// 3-way split for EVERY match, falling back to a league-average baseline for a team with no
// results. The same code is explicit about what is real evidence and what is not — when either
// team has no recent results, `factors` carries ONLY the fixed home prior (see
// `bothTeamsHaveForm` there). This gate reuses those existing definitions instead of adding a
// threshold of its own: the backend's own evidence contract, plus this file's
// MIN_TRUSTED_FORM_SAMPLE for "enough real recent matches".
// ---------------------------------------------------------------------------

/** The factor keys the backend emits when it has no team-specific evidence — fixed priors,
 *  not signals about these two teams. */
const PRIOR_ONLY_FACTOR_KEYS: ReadonlySet<string> = new Set(['homeAdvantage', 'homeCourtAdvantage']);

type AnalysisFields = {
  outcomes: { home: number; draw: number; away: number };
  xgHome: number;
  xgAway: number;
  factors: readonly { key: string; home: number; away: number }[];
  home: { form: readonly unknown[] };
  away: { form: readonly unknown[] };
};

/** A usable 3-way split: finite whole-percent shares that account for the whole (draw is 0 for
 *  basketball, so only the sum is constrained). Anything else is a malformed row. */
export function hasValidOutcomes(outcomes: AnalysisFields['outcomes']): boolean {
  const shares = [outcomes.home, outcomes.draw, outcomes.away];
  return shares.every((n) => Number.isInteger(n) && n >= 0 && n <= 100) && shares[0] + shares[1] + shares[2] === 100;
}

/** At least one factor that is evidence about these two teams, not just the fixed prior. */
export function hasTeamSpecificEvidence(factors: AnalysisFields['factors']): boolean {
  if (!Array.isArray(factors) || factors.length === 0) return false;
  const wellFormed = factors.every((f) => typeof f?.key === 'string' && Number.isFinite(f.home) && Number.isFinite(f.away));
  return wellFormed && factors.some((f) => !PRIOR_ONLY_FACTOR_KEYS.has(f.key));
}

/**
 * True only for an analysis built on real, sufficient data: a valid split, finite expected
 * values, team-specific evidence in `factors`, and at least MIN_TRUSTED_FORM_SAMPLE real recent
 * results for BOTH teams (the weaker side decides, as everywhere else in the app).
 */
export function hasSufficientAnalysis(match: AnalysisFields): boolean {
  return (
    hasValidOutcomes(match.outcomes) &&
    Number.isFinite(match.xgHome) &&
    Number.isFinite(match.xgAway) &&
    hasTeamSpecificEvidence(match.factors) &&
    matchFormDataLevel(match.home.form, match.away.form) === 'full'
  );
}
