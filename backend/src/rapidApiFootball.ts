import { env } from './config.js';

const HOST = 'free-api-live-football-data.p.rapidapi.com';
const BASE_URL = `https://${HOST}`;

// Süper Lig's id on this provider (FotMob-derived), confirmed live via
// /football-get-leagues-list-all-with-country — Türkiye -> Süper Lig -> id 71.
export const SUPER_LIG_ID = 71;

export type RflMatch = {
  id: string;
  home: { id: string; name: string; score: number };
  away: { id: string; name: string; score: number };
  status: {
    utcTime: string;
    finished: boolean;
    started: boolean;
    cancelled: boolean;
  };
};

export async function getLeagueMatches(leagueId: number): Promise<RflMatch[]> {
  const res = await fetch(`${BASE_URL}/football-get-all-matches-by-league?leagueid=${leagueId}`, {
    headers: {
      'x-rapidapi-host': HOST,
      'x-rapidapi-key': env.rapidApiFootballKey as string,
    },
  });
  if (!res.ok) {
    throw new Error(
      `free-api-live-football-data /football-get-all-matches-by-league failed: ${res.status} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as { status: string; response: { matches: RflMatch[] } };
  if (body.status !== 'success') {
    throw new Error(`free-api-live-football-data returned non-success status: ${JSON.stringify(body)}`);
  }
  return body.response.matches;
}
