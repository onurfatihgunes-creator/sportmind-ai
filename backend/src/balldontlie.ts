import { env } from './config.js';

const BASE_URL = 'https://api.balldontlie.io/v1';

export type BdlTeam = {
  id: number;
  full_name: string;
  abbreviation: string;
};

export type BdlGame = {
  id: number;
  datetime: string;
  status: string;
  home_team_score: number | null;
  visitor_team_score: number | null;
  home_team: BdlTeam;
  visitor_team: BdlTeam;
};

async function bdlGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: env.balldontlieApiKey as string },
  });
  if (!res.ok) {
    throw new Error(`balldontlie ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAllTeams(): Promise<BdlTeam[]> {
  const data = await bdlGet<{ data: BdlTeam[] }>('/teams?per_page=100');
  return data.data;
}

/** Free tier is rate-limited to 5 requests/min, so this pauses generously between
 * paginated pages rather than assuming a single page covers the whole date range. */
export async function getGamesInRange(startDate: string, endDate: string): Promise<BdlGame[]> {
  const games: BdlGame[] = [];
  let cursor: number | undefined;
  do {
    const cursorParam = cursor !== undefined ? `&cursor=${cursor}` : '';
    const data = await bdlGet<{ data: BdlGame[]; meta: { next_cursor: number | null } }>(
      `/games?start_date=${startDate}&end_date=${endDate}&per_page=100${cursorParam}`,
    );
    games.push(...data.data);
    cursor = data.meta.next_cursor ?? undefined;
    if (cursor !== undefined) await sleep(13000);
  } while (cursor !== undefined);
  return games;
}
