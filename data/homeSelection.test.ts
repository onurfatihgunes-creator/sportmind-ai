import { HOME_DAY_WINDOW_HOURS, HOME_POOL_PER_SPORT } from './matchWindow';
import { homeCandidatePool } from './homeSelection';
import type { Match } from './mockData';

const NOW = new Date('2026-10-13T17:00:00Z');
const at = (hoursFromNow: number, id = String(hoursFromNow)): Match =>
  ({ id, kickoffAt: new Date(NOW.getTime() + hoursFromNow * 3_600_000).toISOString() }) as unknown as Match;

describe('homeCandidatePool — "matches of the day"', () => {
  it('excludes matches that have already started or finished', () => {
    const pool = homeCandidatePool([at(-30), at(-3), at(-0.5), at(1)], NOW);
    expect(pool.map((m) => m.id)).toEqual(['1']);
  });

  it('excludes matches further out than the day window (a week of football, an NBA opener a week away)', () => {
    const week = [at(2), at(23.9), at(HOME_DAY_WINDOW_HOURS), at(48), at(7 * 24)];
    expect(homeCandidatePool(week, NOW).map((m) => m.id)).toEqual(['2', '23.9']);
  });

  it('is empty — not padded with far-away matches — when nothing qualifies (basketball off-season)', () => {
    expect(homeCandidatePool([at(7 * 24), at(7 * 24 + 5)], NOW)).toEqual([]);
  });

  it('judges instants, so the same kickoff qualifies identically whatever the device timezone', () => {
    const kickoff = '2026-10-13T20:00:00+03:00'; // = 17:00Z, i.e. exactly "now"
    const m = { id: 'x', kickoffAt: kickoff } as unknown as Match;
    expect(homeCandidatePool([m], NOW)).toHaveLength(1);
    expect(homeCandidatePool([m], new Date('2026-10-13T17:00:01Z'))).toHaveLength(0);
  });

  it('is soonest first and capped', () => {
    const many = Array.from({ length: 60 }, (_, i) => at(23 - i * 0.3, `m${i}`));
    const pool = homeCandidatePool(many, NOW);
    expect(pool).toHaveLength(HOME_POOL_PER_SPORT);
    expect([...pool].map((m) => m.kickoffAt)).toEqual([...pool].map((m) => m.kickoffAt).sort());
  });

  it('keeps demo data that has no kickoff instant, so offline demo mode still shows something', () => {
    const demo = [{ id: 'a' }, { id: 'b' }] as unknown as Match[];
    expect(homeCandidatePool(demo, NOW).map((m) => m.id)).toEqual(['a', 'b']);
  });
});
