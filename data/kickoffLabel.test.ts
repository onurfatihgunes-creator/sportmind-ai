import { kickoffParts, kickoffText } from './kickoffLabel';

const dict: Record<string, Record<string, string>> = {
  en: { 'explore.today': 'Today', 'explore.tomorrow': 'Tomorrow' },
  tr: { 'explore.today': 'Bugün', 'explore.tomorrow': 'Yarın' },
  de: { 'explore.today': 'Heute', 'explore.tomorrow': 'Morgen' },
  ar: { 'explore.today': 'اليوم', 'explore.tomorrow': 'غدًا' },
};
const tFor = (l: string) => (k: string) => dict[l][k];
const NOW = new Date(2026, 9, 13, 12, 0); // local noon
const at = (days: number, h = 22, m = 0) => ({ kickoff: 'Today, x', kickoffAt: new Date(2026, 9, 13 + days, h, m).toISOString() });

describe('kickoffParts', () => {
  it.each(['en', 'tr', 'de', 'ar'])('uses the app language for today and tomorrow (%s)', (l) => {
    expect(kickoffParts(at(0), tFor(l), l, NOW).day).toBe(dict[l]['explore.today']);
    expect(kickoffParts(at(1), tFor(l), l, NOW).day).toBe(dict[l]['explore.tomorrow']);
  });

  it('never leaves English words in the other languages', () => {
    for (const l of ['tr', 'de', 'ar']) {
      expect(kickoffText(at(0), tFor(l), l, NOW)).not.toMatch(/Today|Tomorrow/);
    }
  });

  it('names later days by weekday in that language', () => {
    expect(kickoffParts(at(3), tFor('de'), 'de', NOW).day).toMatch(/^[A-Za-zäöüÄÖÜ.]+$/);
    expect(kickoffParts(at(3), tFor('en'), 'en', NOW).day).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/);
  });

  it('keeps Latin digits for Arabic', () => {
    expect(kickoffParts(at(0, 21, 45), tFor('ar'), 'ar', NOW).time).toMatch(/[0-9]/);
  });

  it('falls back to the stored string for demo data without an instant', () => {
    expect(kickoffParts({ kickoff: 'Saturday, 18:30' }, tFor('tr'), 'tr', NOW)).toEqual({ day: 'Saturday', time: '18:30' });
  });
});
