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
