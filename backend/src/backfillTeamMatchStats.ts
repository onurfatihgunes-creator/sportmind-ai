import { supabase } from './supabaseClient.js';
import { parseTeamMatchStats } from './matchStatsParsing.js';

/**
 * One-off backfill: promotes match_stats_raw's already-fetched, already-stored `raw`
 * payloads into the new typed team_match_stats table — see
 * sql/add_match_incidents_and_team_stats.sql for why. Zero new BSD API calls: every row
 * this touches was already paid for by the existing enrichment pipeline. Safe to re-run
 * (upsert on the primary key `(match_id, side)`).
 */
async function backfillTeamMatchStats() {
  const { data: rawRows, error } = await supabase.from('match_stats_raw').select('match_id, bsd_event_id, raw');
  if (error) throw error;
  console.log(`Found ${rawRows?.length ?? 0} match_stats_raw rows.`);

  const matchIds = (rawRows ?? []).map((r) => r.match_id);
  const { data: matches, error: matchErr } = await supabase.from('matches').select('id, home_team_id, away_team_id').in('id', matchIds);
  if (matchErr) throw matchErr;
  const byId = new Map((matches ?? []).map((m) => [m.id, m]));

  let written = 0;
  let skippedNoMatch = 0;
  for (const row of rawRows ?? []) {
    const match = byId.get(row.match_id);
    if (!match) {
      skippedNoMatch++;
      continue;
    }
    const parsedRows = parseTeamMatchStats(row.match_id, match.home_team_id, match.away_team_id, row.bsd_event_id, row.raw as { home?: Record<string, unknown>; away?: Record<string, unknown> });
    if (parsedRows.length === 0) continue;
    const { error: upsertError } = await supabase.from('team_match_stats').upsert(parsedRows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (upsertError) throw upsertError;
    written += parsedRows.length;
  }

  console.log(`Backfilled ${written} team_match_stats rows (skipped ${skippedNoMatch} with no matching match).`);
}

backfillTeamMatchStats().catch((error) => {
  console.error(error);
  process.exit(1);
});
