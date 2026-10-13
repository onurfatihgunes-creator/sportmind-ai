import type { Match } from './mockData';

type T = (key: string) => string;

const DAY_MS = 86_400_000;

/** BCP-47 tag for the app language. Arabic keeps Latin digits, like every other number in the app. */
export function localeFor(language: string): string {
  return language.startsWith('ar') ? 'ar-u-nu-latn' : language;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export type KickoffParts = { day: string; time: string };

/**
 * The kickoff as the person should read it: a day word ("Today" / "Tomorrow" / weekday) and a local
 * time, both in the app language and the device's timezone. Built from the real kickoff instant —
 * the old `match.kickoff` string was English ("Today, 10:00 PM") and was being split on commas in
 * seven places, so TR/DE/AR showed English. Demo data without an instant falls back to its string.
 */
export function kickoffParts(match: Pick<Match, 'kickoff' | 'kickoffAt'>, t: T, language: string, now: Date = new Date()): KickoffParts {
  if (!match.kickoffAt) {
    const [day, ...rest] = match.kickoff.split(',');
    return { day: day.trim(), time: rest.join(',').trim() };
  }
  const d = new Date(match.kickoffAt);
  const locale = localeFor(language);
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY_MS);
  const day = diff === 0 ? t('explore.today') : diff === 1 ? t('explore.tomorrow') : d.toLocaleDateString(locale, { weekday: 'short' });
  return { day, time };
}

/** "Today, 10:00 PM" in the app language — for single-line subtitles. */
export function kickoffText(match: Pick<Match, 'kickoff' | 'kickoffAt'>, t: T, language: string, now?: Date): string {
  const { day, time } = kickoffParts(match, t, language, now);
  return time ? `${day}, ${time}` : day;
}
