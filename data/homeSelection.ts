import { hasSufficientAnalysis } from './dataConfidence';
import { favouredOutcome, type Match } from './mockData';

/** How many of the day's matches Home's carousel shows. */
export const HERO_MATCH_LIMIT = 6;

/**
 * The matches Home is allowed to recommend: only those whose analysis is real and sufficient
 * (see hasSufficientAnalysis). A match with no prediction row never reaches the client at all
 * (liveData.ts drops it), so what this removes is the rest of the bad states — a placeholder
 * split with no team-specific evidence, thin recent history, or a malformed row. Applies to
 * Home's recommendation surfaces only; Explore and every other screen keep the full list.
 */
export function eligibleHomeMatches(matches: readonly Match[]): Match[] {
  return matches.filter(hasSufficientAnalysis);
}

/** "Matches of the day": the eligible matches ranked by the model's strongest favourite. */
export function selectHeroMatches(eligible: readonly Match[]): Match[] {
  return [...eligible]
    .sort((a, b) => favouredOutcome(b).probability - favouredOutcome(a).probability)
    .slice(0, HERO_MATCH_LIMIT);
}

/**
 * "What stands out" — deterministic, and on a genuinely different axis from the carousel (which
 * ranks by raw prediction confidence): the single match whose strongest real factor has the
 * largest magnitude (|factor.home - 50|), i.e. the analysis with the clearest single driver.
 * Ties broken by confidence. Requires at least one real factor — a match with none can never be
 * selected — and if nothing qualifies, null: the section is hidden rather than guessing or
 * falling back to a random/popular team.
 */
export function selectStandout(eligible: readonly Match[]): { match: Match; factor: Match['factors'][number] } | null {
  let bestMatch: Match | null = null;
  let bestFactor: Match['factors'][number] | null = null;
  let bestMagnitude = -1;
  for (const m of eligible) {
    if (m.factors.length === 0) continue;
    const topFactor = [...m.factors].sort((a, b) => Math.abs(b.home - 50) - Math.abs(a.home - 50))[0];
    const magnitude = Math.abs(topFactor.home - 50);
    const better =
      magnitude > bestMagnitude ||
      (magnitude === bestMagnitude && bestMatch && favouredOutcome(m).probability > favouredOutcome(bestMatch).probability);
    if (better) {
      bestMatch = m;
      bestFactor = topFactor;
      bestMagnitude = magnitude;
    }
  }
  return bestMatch && bestFactor ? { match: bestMatch, factor: bestFactor } : null;
}
