import { supabase } from './supabaseClient.js';

/**
 * Emergency correction for a mistake made by this same fix pass: the first version of
 * backfillMatchStatusSync.ts's filter (`status not in ('finished','postponed') AND
 * home_score/away_score not null`) did not exclude the OTHER bug this pass also fixes —
 * balldontlie's fake 0-0 placeholder on not-yet-played NBA games (a non-null score) — so
 * it wrongly flipped genuinely-still-scheduled NBA games to 'finished' before being
 * killed partway through (448 of 559 candidates, confirmed live). A real finished NBA
 * game cannot end 0-0 (points are always scored), so this filter unambiguously targets
 * only rows this same mistake produced — nothing a legitimate provider response could
 * ever write. Reverts status to 'scheduled' AND nulls the score in the same statement,
 * which is also the exact fix resolveNbaScore/fetchBasketballFixtures.ts now applies
 * going forward for these same rows.
 */
async function backfillRevertNbaFalseFinish() {
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id')
    .eq('sport', 'basketball')
    .eq('status', 'finished')
    .eq('home_score', 0)
    .eq('away_score', 0);
  if (error) throw error;

  console.log(`Found ${rows?.length ?? 0} NBA rows wrongly marked finished with a fake 0-0 score.`);
  if (!rows || rows.length === 0) return;

  const { error: updateError } = await supabase
    .from('matches')
    .update({ status: 'scheduled', home_score: null, away_score: null, updated_at: new Date().toISOString() })
    .in('id', rows.map((r) => r.id));
  if (updateError) throw updateError;

  console.log(`Reverted ${rows.length} rows back to 'scheduled' with null scores.`);
}

backfillRevertNbaFalseFinish().catch((error) => {
  console.error(error);
  process.exit(1);
});
