/** Corporate/legal tags clubs carry in the data feed ("Manchester United FC", "Club Brugge KV",
 *  "AS Roma"). They add length but not identity, so the compact name drops them. */
const LEGAL_TAGS = new Set([
  'fc', 'cf', 'afc', 'sc', 'ssc', 'kv', 'osc', 'fk', 'sk', 'ac', 'as', 'bk', 'sv', 'ud', 'cd', 'rsc',
]);

/** "Club Atlético de Madrid" -> "Atlético Madrid": a leading "Club", one word, then "de". */
const CLUB_DE = /^club\s+(\S+)\s+de\s+(.+)$/i;

const MIN_LENGTH = 3;

/**
 * A shorter way to write a team's name for narrow columns (legend labels, expected-goals
 * cards, the matchup header at large font scales). It only removes what carries no identity —
 * legal tags at either end and the "Club … de …" connector — so two different clubs never
 * collapse into the same label ("Manchester United FC" stays "Manchester United", never
 * "Man"). Names with nothing to drop are returned unchanged, and the result is never empty.
 */
export function compactTeamName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return name;

  let working = trimmed;
  const clubDe = CLUB_DE.exec(working);
  if (clubDe) working = `${clubDe[1]} ${clubDe[2]}`;

  let words = working.split(' ');
  while (words.length > 2 && LEGAL_TAGS.has(words[0].toLowerCase())) words = words.slice(1);
  while (words.length > 2 && LEGAL_TAGS.has(words[words.length - 1].toLowerCase())) words = words.slice(0, -1);
  // Two-word names like "Arsenal FC" / "FC Porto": drop the tag only if a real word remains.
  if (words.length === 2) {
    if (LEGAL_TAGS.has(words[1].toLowerCase()) && words[0].length >= MIN_LENGTH) words = [words[0]];
    else if (LEGAL_TAGS.has(words[0].toLowerCase()) && words[1].length >= MIN_LENGTH) words = [words[1]];
  }

  const result = words.join(' ');
  return result.length >= MIN_LENGTH ? result : trimmed;
}
