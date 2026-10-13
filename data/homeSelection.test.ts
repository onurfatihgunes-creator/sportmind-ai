/**
 * Regression coverage for Home's match quality filter: matches with no real analysis (a
 * placeholder split with no team-specific evidence, thin history, a malformed row) must never be
 * recommended on Home — neither in "Matches of the day" nor as "What stands out".
 */
import { eligibleHomeMatches, HERO_MATCH_LIMIT, selectHeroMatches, selectStandout } from './homeSelection';
import { matches as mockMatches, type Match, type Team } from './mockData';

const FULL_FORM: Team['form'] = ['W', 'D', 'L', 'W', 'W'];

function team(id: string, form: Team['form'] = FULL_FORM): Team {
  return { id, name: id, code: id.slice(0, 3).toUpperCase(), bg: '#ddd', fg: '#222', form, sport: 'football' };
}

function match(id: string, overrides: Partial<Match> = {}): Match {
  return {
    id,
    home: team(`${id}-h`),
    away: team(`${id}-a`),
    kickoff: 'Today',
    competition: 'Test League',
    sport: 'football',
    outcomes: { home: 50, draw: 27, away: 23 },
    xgHome: 1.4,
    xgAway: 1.1,
    recentAvgGoalsHome: 1.5,
    recentAvgGoalsAway: 1.2,
    factors: [
      { key: 'recentForm', home: 58, away: 42 },
      { key: 'homeAdvantage', home: 62, away: 38 },
    ],
    ...overrides,
  };
}

// The exact shape computePredictions.ts persists for a match where a team has no results.
const placeholder = (id: string) =>
  match(id, { factors: [{ key: 'homeAdvantage', home: 62, away: 38 }], outcomes: { home: 80, draw: 10, away: 10 } });
const thinHistory = (id: string) => match(id, { home: team(`${id}-h`, ['W', 'L']) });
const malformed = (id: string) => match(id, { outcomes: { home: 50, draw: 30, away: 30 } });

describe('eligibleHomeMatches', () => {
  it('keeps real analyses and drops placeholder, thin-history and malformed ones', () => {
    const ok = match('ok');
    const eligible = eligibleHomeMatches([ok, placeholder('p'), thinHistory('t'), malformed('m')]);
    expect(eligible.map((m) => m.id)).toEqual(['ok']);
  });

  it('can end up empty — never padded with a fabricated match', () => {
    expect(eligibleHomeMatches([placeholder('p'), thinHistory('t')])).toEqual([]);
  });

  it('does not touch the input list (Explore and the other screens keep the full list)', () => {
    const all = [match('ok'), placeholder('p')];
    eligibleHomeMatches(all);
    expect(all).toHaveLength(2);
  });

  it('keeps the demo/mock dataset working: every mock match is a sufficient analysis', () => {
    expect(eligibleHomeMatches(mockMatches)).toHaveLength(mockMatches.length);
  });
});

describe('selectHeroMatches — Matches of the day', () => {
  it('never recommends a match that has no real analysis, even with the highest percentage', () => {
    const hero = selectHeroMatches(eligibleHomeMatches([placeholder('p'), match('ok')]));
    expect(hero.map((m) => m.id)).toEqual(['ok']);
  });

  it('ranks by the strongest favourite and caps the carousel', () => {
    const many = Array.from({ length: HERO_MATCH_LIMIT + 3 }, (_, i) =>
      match(`m${i}`, { outcomes: { home: 40 + i, draw: 30, away: 30 - i } }),
    );
    const hero = selectHeroMatches(eligibleHomeMatches(many));
    expect(hero).toHaveLength(HERO_MATCH_LIMIT);
    expect(hero[0].id).toBe(`m${HERO_MATCH_LIMIT + 2}`);
  });
});

describe('selectStandout — What stands out', () => {
  it('cannot be won by a placeholder: its fixed 62/38 home prior would otherwise look like the clearest driver', () => {
    const real = match('real', { factors: [{ key: 'recentForm', home: 53, away: 47 }, { key: 'homeAdvantage', home: 62, away: 38 }] });
    // Without the gate the placeholder's |62-50| beats the real match's best real factor.
    expect(selectStandout([placeholder('p'), real])?.match.id).toBe('p');
    expect(selectStandout(eligibleHomeMatches([placeholder('p'), real]))?.match.id).toBe('real');
  });

  it('is null when nothing qualifies', () => {
    expect(selectStandout(eligibleHomeMatches([placeholder('p'), thinHistory('t')]))).toBeNull();
  });
});
