import { supabase } from './supabaseClient.js';

/**
 * Corrects a second mistake from this same fix line: the first version of the "non-null
 * score overrides status" rule (fetchFixtures.ts) had no kickoff-age guard, so the
 * provider's placeholder 0-0 on an unplayed fixture — La Liga 564685, kicking off
 * 2026-10-21 — was written as status='finished' by both backfillMatchStatusSync.ts and the
 * next scheduled pipeline run. A match that has not kicked off yet cannot be finished, so
 * `status='finished' AND kickoff_at > now` unambiguously targets only rows this mistake
 * produced (confirmed live: exactly one). Reverts status to 'scheduled' and nulls the
 * placeholder score, matching what the fixed ingestion now writes.
 */
async function backfillRevertFutureFalseFinish() {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, competition, kickoff_at, home_score, away_score')
    .eq('status', 'finished')
    .gt('kickoff_at', nowIso);
  if (error) throw error;

  console.log(`Found ${rows?.length ?? 0} 'finished' matches with a future kickoff.`);
  for (const row of rows ?? []) {
    const { error: updateError } = await supabase
      .from('matches')
      .update({ status: 'scheduled', home_score: null, away_score: null, updated_at: nowIso })
      .eq('id', row.id);
    if (updateError) throw updateError;
    console.log(`${row.id} (${row.competition}, kickoff ${row.kickoff_at}): finished ${row.home_score}-${row.away_score} -> scheduled/null`);
  }
}

backfillRevertFutureFalseFinish().catch((error) => {
  console.error(error);
  process.exit(1);
});
