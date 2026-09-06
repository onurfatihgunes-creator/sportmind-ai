import type { Sport } from './mockData';

export type CompetitionInfo = { name: string; country: string; region: string; sport: Sport };

/**
 * Static registry describing the competitions SportMind actually ingests today — country
 * and region are used purely for discovery UX (CompetitionPicker grouping, team-search
 * disambiguation subtitles), never for filtering match data itself (match.sport /
 * match.competition remain the source of truth there).
 *
 * Deliberately limited to the competitions the app currently has real data for. This is
 * NOT the full list BSD could support (see the coverage audit) — adding speculative
 * entries for leagues with no real fixtures yet would violate the same "never show a
 * competition without real data behind it" rule the rest of the app follows. Extend this
 * list only alongside actually ingesting a new competition (Phase 3), not ahead of it.
 */
export const COMPETITIONS: CompetitionInfo[] = [
  { name: 'Premier League', country: 'England', region: 'Europe', sport: 'football' },
  { name: 'La Liga', country: 'Spain', region: 'Europe', sport: 'football' },
  { name: 'Serie A', country: 'Italy', region: 'Europe', sport: 'football' },
  { name: 'Bundesliga', country: 'Germany', region: 'Europe', sport: 'football' },
  { name: 'Ligue 1', country: 'France', region: 'Europe', sport: 'football' },
  // Matches BSD_TIER1_LEAGUES' own country value for this one on the backend
  // (backend/src/config.ts) — Champions League isn't a single nation's competition.
  { name: 'Champions League', country: 'Europe', region: 'Europe', sport: 'football' },
  { name: 'Süper Lig', country: 'Turkey', region: 'Europe', sport: 'football' },
  { name: 'NBA', country: 'USA', region: 'North America', sport: 'basketball' },
];

const byName = new Map(COMPETITIONS.map((c) => [c.name, c]));

/** Returns undefined for a real competition the registry hasn't caught up to yet —
 * callers must degrade gracefully (e.g. an "Other" grouping), never hide the competition. */
export function getCompetitionInfo(name: string): CompetitionInfo | undefined {
  return byName.get(name);
}
