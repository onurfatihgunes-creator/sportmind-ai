import { env } from './config.js';

const BASE_URL = 'https://api.football-data.org/v4';

export type FdTeam = {
  id: number;
  name: string;
  tla: string; // three-letter code, e.g. "ARS"
  crest: string;
};

export type FdMatch = {
  id: number;
  utcDate: string;
  status: 'SCHEDULED' | 'TIMED' | 'FINISHED' | 'POSTPONED' | string;
  competition: { code: string; name: string };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
};

async function fdGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': env.footballDataApiKey },
  });
  if (!res.ok) {
    throw new Error(`football-data.org ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Matches for a competition within a date range (inclusive), e.g. the active window or a recent-form lookback. */
export async function getCompetitionMatches(
  competitionCode: string,
  dateFrom: string,
  dateTo: string,
): Promise<FdMatch[]> {
  const data = await fdGet<{ matches: FdMatch[] }>(
    `/competitions/${competitionCode}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
  );
  return data.matches;
}

/** Free-tier rate limit is a handful of calls per minute — always pause between requests in a loop. */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
