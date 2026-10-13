import { goalsTrend, isFormStale, summarizeTeamForm, type FormRow } from './teamForm';

const row = (d: string, result: string, gf: number, ga: number): FormRow => ({ match_date: d, result, goals_for: gf, goals_against: ga });

describe('summarizeTeamForm', () => {
  it('takes the last 5 results oldest-to-newest regardless of row order, and the newest date', () => {
    const rows = [row('2026-05-03', 'D', 0, 0), row('2026-05-17', 'W', 1, 0), row('2026-04-25', 'W', 2, 0), row('2026-05-09', 'L', 2, 4), row('2026-04-17', 'L', 0, 2)];
    const s = summarizeTeamForm(rows);
    expect(s.form).toEqual(['L', 'W', 'D', 'L', 'W']);
    expect(s.lastResultAt).toBe('2026-05-17');
    // 5 rows only: no prior window, so no trend rather than a guess
    expect(s.attackTrend).toBeUndefined();
    expect(s.defenceTrend).toBeUndefined();
  });

  it('calls a trend only with at least 3 recent and 3 prior results, and flips defence', () => {
    const recent = [0, 1, 2, 3, 4].map((i) => row(`2026-09-${20 - i}`, 'W', 3, 0));
    const prior = [0, 1, 2, 3, 4].map((i) => row(`2026-08-${20 - i}`, 'L', 0, 3));
    const s = summarizeTeamForm([...recent, ...prior]);
    expect(s.attackTrend).toBe('up');
    expect(s.defenceTrend).toBe('up'); // conceding less is an improvement
  });

  it('is empty for a team with no rows', () => {
    expect(summarizeTeamForm([])).toEqual({ form: [], attackTrend: undefined, defenceTrend: undefined, lastResultAt: undefined });
  });
});

describe('goalsTrend', () => {
  it('stays neutral inside the threshold', () => {
    const h = Array.from({ length: 10 }, () => ({ goalsFor: 1, goalsAgainst: 1 }));
    expect(goalsTrend(h, 'goalsFor')).toBe('neutral');
  });
});

describe('isFormStale', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  it('treats a last result from May as stale in October (the Antalyaspor case)', () => {
    expect(isFormStale('2026-05-17', now)).toBe(true);
    expect(isFormStale('2026-10-05', now)).toBe(false);
    expect(isFormStale(undefined, now)).toBe(true);
  });
});
