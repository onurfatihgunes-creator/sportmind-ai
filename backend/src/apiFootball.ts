import { env } from './config.js';

const BASE_URL = 'https://v3.football.api-sports.io';

export type AfTeam = {
  id: number;
  name: string;
  code: string | null;
};

export type AfFixture = {
  fixture: { id: number; date: string; status: { short: string } };
  teams: { home: AfTeam; away: AfTeam };
  goals: { home: number | null; away: number | null };
};

async function afGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-apisports-key': env.apiFootballKey as string },
  });
  if (!res.ok) {
    throw new Error(`api-football ${path} failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { response: T; errors?: unknown };
  if (body.errors && Array.isArray(body.errors) ? body.errors.length > 0 : Object.keys(body.errors ?? {}).length > 0) {
    throw new Error(`api-football ${path} returned errors: ${JSON.stringify(body.errors)}`);
  }
  return body.response;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Looks the league id up by name rather than hardcoding a possibly-stale id — league ids
 * are stable per api-sports.io's docs, but resolving it live avoids silently querying the
 * wrong league if that ever changes. */
export async function resolveSuperLigId(): Promise<number> {
  const leagues = await afGet<{ league: { id: number; name: string }; country: { name: string } }[]>(
    '/leagues?search=Super Lig',
  );
  const match = leagues.find((l) => l.country.name === 'Turkey');
  if (!match) throw new Error('Could not resolve Süper Lig league id from api-football /leagues');
  return match.league.id;
}

export async function getFixtures(leagueId: number, season: number, from: string, to: string): Promise<AfFixture[]> {
  return afGet<AfFixture[]>(`/fixtures?league=${leagueId}&season=${season}&from=${from}&to=${to}`);
}
