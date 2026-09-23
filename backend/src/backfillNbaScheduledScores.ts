import { supabase } from './supabaseClient.js';

/**
 * One-off backfill for the NBA scheduled-score bug fixed in fetchBasketballFixtures.ts:
 * balldontlie returns 0 (not null) for an unplayed game's score, which upsertMatch used to
 * copy verbatim. Confirmed live: 559 scheduled NBA rows with a fake "0-0" score.
 *
 * Scoped tightly to the exact shape of the bug — `sport='basketball' AND status='scheduled'
 * AND home_score=0 AND away_score=0` — so this can only ever null out a row matching that
 * exact fake-score signature. 'finished' rows are never touched, matching the fix's own
 * "finished/live durumlarını bozma" requirement (a real 0-anything NBA final score doesn't
 * happen, but this filter doesn't even need to reason about that: it never inspects a
 * 'finished' row at all).
 */
async function backfillNbaScheduledScores() {
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id')
    .eq('sport', 'basketball')
    .eq('status', 'scheduled')
    .eq('home_score', 0)
    .eq('away_score', 0);
  if (error) throw error;

  console.log(`Found ${rows?.length ?? 0} scheduled NBA rows with a fake 0-0 score.`);
  if (!rows || rows.length === 0) return;

  const { error: updateError } = await supabase
    .from('matches')
    .update({ home_score: null, away_score: null, updated_at: new Date().toISOString() })
    .in('id', rows.map((r) => r.id));
  if (updateError) throw updateError;

  console.log(`Backfilled ${rows.length} rows (home_score/away_score -> null).`);
}

backfillNbaScheduledScores().catch((error) => {
  console.error(error);
  process.exit(1);
});
