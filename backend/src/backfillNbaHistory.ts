/**
 * One-off NBA history backfill (Nov 2026, owner-approved) from balldontlie's free tier into
 * `historical_basketball_games` (sql/add_historical_basketball_games.sql). Writes ONLY to that
 * table. Free tier: 5 requests/minute, so pages are spaced 13 s apart.
 *
 *   npx tsx src/backfillNbaHistory.ts            (seasons 2022, 2023, 2024 and 2025 up to our live data)
 *
 * Only finished games with both scores. Games at or after the earliest NBA kickoff already in
 * `matches` are skipped (that period is live data). Idempotent: upsert on id.
 */
import { env } from './config.js';
import { supabase } from './supabaseClient.js';

const SEASONS = [2022, 2023, 2024, 2025];
const PAGE_GAP_MS = 13_000;

type Game = { id: number; date: string; datetime?: string | null; season: number; postseason: boolean; status: string; home_team_score: number; visitor_team_score: number; home_team: { id: number }; visitor_team: { id: number } };

async function main() {
  if (!env.balldontlieApiKey) throw new Error('BALLDONTLIE_API_KEY missing');
  const { data: first, error } = await supabase.from('matches').select('kickoff_at').eq('sport', 'basketball').order('kickoff_at').limit(1).maybeSingle();
  if (error) throw error;
  const cutoff = first ? Date.parse(first.kickoff_at) : Infinity;
  console.log(`Live NBA data starts ${first?.kickoff_at ?? '-'}; history stops before that.`);

  let requests = 0;
  for (const season of SEASONS) {
    let cursor: number | null | undefined;
    let kept = 0;
    let seen = 0;
    do {
      if (requests > 0) await new Promise((r) => setTimeout(r, PAGE_GAP_MS));
      const url = `https://api.balldontlie.io/v1/games?seasons[]=${season}&per_page=100${cursor ? `&cursor=${cursor}` : ''}`;
      requests++;
      const res = await fetch(url, { headers: { Authorization: env.balldontlieApiKey } });
      if (!res.ok) throw new Error(`balldontlie ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { data: Game[]; meta: { next_cursor?: number | null } };
      seen += body.data.length;
      const rows = body.data
        .filter((g) => g.status === 'Final' && g.home_team_score > 0 && g.visitor_team_score > 0 && g.home_team_score !== g.visitor_team_score)
        .map((g) => ({
          id: `bdl-${g.id}`,
          season: g.season,
          postseason: g.postseason,
          kickoff_at: g.datetime ?? `${g.date}T00:00:00Z`,
          home_team_id: `bdl-${g.home_team.id}`,
          away_team_id: `bdl-${g.visitor_team.id}`,
          home_score: g.home_team_score,
          away_score: g.visitor_team_score,
        }))
        .filter((r) => Date.parse(r.kickoff_at) < cutoff);
      if (rows.length) {
        const { error: upErr } = await supabase.from('historical_basketball_games').upsert(rows, { onConflict: 'id' });
        if (upErr) throw upErr;
      }
      kept += rows.length;
      cursor = body.meta.next_cursor;
    } while (cursor);
    console.log(`  season ${season}: ${kept} finished games kept (of ${seen} listed)`);
  }
  console.log(`Done. Requests: ${requests}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
