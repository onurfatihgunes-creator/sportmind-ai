import { supabase } from './supabaseClient.js';

/**
 * Cross-provider team identity resolution — additive, ingestion-only, never
 * touches prediction/analysis logic.
 *
 * Real defect this fixes: football-data.org and the RapidAPI Süper Lig
 * provider each write their own team row for the same real-world team when
 * it appears in both (e.g. a Turkish club in both Süper Lig and the
 * Champions League) — "Fenerbahçe" (ffld-8695) vs "Fenerbahçe SK" (613).
 * That splits the team's `team_form` history across two ids, so
 * computePredictions.ts's recent-form lookup for whichever id has no
 * history silently falls back to the neutral baseline instead of the
 * team's real form — a genuine accuracy loss, not a cosmetic one.
 *
 * Scope, deliberately conservative:
 *   - Only applied to NEWLY seen teams. Already-split historical rows
 *     (confirmed live: Fenerbahçe, Galatasaray, and a balldontlie Denver
 *     Nuggets duplicate) are NOT retroactively merged here — that needs a
 *     real migration decision (which id survives, how matches/team_form/
 *     predictions get reassigned), not a silent ingestion-time side effect.
 *   - Matched within the same `sport` only, so "Real Madrid" (football)
 *     can never merge with an unrelated basketball club of a similar name.
 *   - Exact match on a normalized name only — no fuzzy/edit-distance
 *     matching, so it never merges two genuinely different clubs that
 *     happen to share a word.
 *
 * Normalization rules, each confirmed against a real provider-name pair
 * from a live BSD-vs-SportMind coverage audit (2026-09-03) — not guessed:
 *
 *   1. Diacritics/punctuation folded (Fenerbahçe -> fenerbahce, M'gladbach
 *      -> m gladbach).
 *   2. Standalone numeric tokens dropped — providers embed founding years
 *      or squad numbers a short name omits: "Bologna FC 1909" -> BSD's
 *      "Bologna"; "TSG 1899 Hoffenheim" -> BSD's "TSG Hoffenheim";
 *      "SV 07 Elversberg" -> BSD's "SV Elversberg".
 *   3. A short (<=4 letter) token that is ALL-CAPS IN THE ORIGINAL name is
 *      treated as a club legal-form abbreviation and dropped, on EITHER
 *      side of the name — not just the end. Confirmed cases where the
 *      abbreviation is a PREFIX, which the old end-anchored suffix regex
 *      never caught: "AFC Bournemouth" -> BSD's "Bournemouth"; "SS Lazio"
 *      -> BSD's "Lazio"; "Angers SCO" -> BSD's "Angers"; "ES Troyes AC" ->
 *      BSD's "Troyes". Case is read BEFORE lowercasing specifically so
 *      this rule can tell "AFC" (a legal-form abbreviation, dropped) apart
 *      from "Real" or "Racing" (real identity words that are only
 *      capitalized, never dropped).
 *   4. A small, fixed stopword list for generic words no short name ever
 *      keeps: "club", "de", "of", "the", "football", "futbol", "calcio" —
 *      confirmed against "Real Sociedad de Fútbol" -> BSD's "Real
 *      Sociedad" and "Club Atlético de Madrid" -> BSD's "Atletico Madrid".
 *      Never a real club's own name at Tier-1 level, so this stays a short
 *      fixed list rather than a general filter.
 *
 * What this deliberately does NOT attempt: "Mönchengladbach" vs
 * "M'gladbach" are different words, not a punctuation/case variant of the
 * same one — see KNOWN_ALIASES below for that class of case, added
 * explicitly and by name rather than guessed at by a fuzzier rule.
 */

const NUMERIC_TOKEN_RE = /^\d+\.?$/;
const STOPWORDS = new Set(['club', 'de', 'of', 'the', 'football', 'futbol', 'calcio']);

function isLegalFormAbbreviation(originalToken: string): boolean {
  const letters = originalToken.replace(/[^A-Za-z]/g, '');
  return letters.length > 0 && letters.length <= 4 && letters === letters.toUpperCase();
}

export function normalizeTeamName(name: string): string {
  const foldedTokens = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics (Fenerbahçe -> Fenerbahce)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  const kept = foldedTokens.filter((token) => {
    if (NUMERIC_TOKEN_RE.test(token)) return false;
    if (STOPWORDS.has(token.toLowerCase())) return false;
    if (isLegalFormAbbreviation(token)) return false;
    return true;
  });

  // Never reduce a name to nothing — a team whose entire name happens to
  // look like an abbreviation (rare, none seen in Tier-1 data) keeps its
  // original tokens rather than normalizing to an empty, universally-equal
  // string, which would be the one way this function could cause a false
  // merge.
  const finalTokens = kept.length > 0 ? kept : foldedTokens;

  const base = finalTokens.join(' ').toLowerCase();
  return KNOWN_ALIASES[base] ?? base;
}

/**
 * Explicit, named exceptions for real-name variants normalization cannot
 * safely generalize — confirmed live, not hypothetical. Keyed and valued by
 * the already-normalized form (lowercase, tokens joined by single spaces).
 * Add an entry only after seeing the real mismatched pair in a coverage
 * audit; this is not a place to pre-guess alternate club names.
 */
const KNOWN_ALIASES: Record<string, string> = {
  // "Borussia Mönchengladbach" (football-data.org) vs BSD's "Borussia
  // M'gladbach" — an abbreviation, not a spelling variant. The apostrophe
  // splits "M'gladbach" into tokens "M" + "gladbach", and the lone "M"
  // itself is then dropped by the legal-form-abbreviation rule above
  // (1 letter, all-caps in the original) — leaving "borussia gladbach",
  // which still doesn't equal "borussia monchengladbach" and needs this
  // explicit mapping rather than a fuzzier rule that would risk similar
  // false merges elsewhere.
  'borussia gladbach': 'borussia monchengladbach',
};

const cache = new Map<string, string | null>(); // `${sport}:${normalizedName}` -> existing team id

/**
 * Returns the id this team should be stored under: an existing team's id if
 * one with a matching normalized name already exists for this sport,
 * otherwise `rawId` unchanged (today's behaviour for a genuinely new team).
 */
export async function resolveTeamId(sport: string, rawId: string, name: string): Promise<string> {
  const normalized = normalizeTeamName(name);
  const cacheKey = `${sport}:${normalized}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? rawId;
  }

  // rawId itself is a cheap first check — if this exact id is already the
  // canonical row (the common case on every run after the first), skip the
  // name-based lookup entirely.
  const { data: byId } = await supabase.from('teams').select('id').eq('id', rawId).maybeSingle();
  if (byId) {
    cache.set(cacheKey, byId.id);
    return byId.id;
  }

  const { data: candidates, error } = await supabase.from('teams').select('id, name').eq('sport', sport);
  if (error) throw error;

  const match = (candidates ?? []).find((t) => normalizeTeamName(t.name) === normalized);
  cache.set(cacheKey, match?.id ?? null);
  return match?.id ?? rawId;
}
