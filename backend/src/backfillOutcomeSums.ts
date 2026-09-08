import { supabase } from './supabaseClient.js';
import { normalizeOutcomes } from './computePredictions.js';

/**
 * One-off backfill for rows written by the pre-fix (independent Math.round) version of
 * normalizeOutcomes, before 5168cea. Only `finished`-match rows actually need this: any
 * row for a still-`scheduled` match self-heals on the next data-pipeline run once the fix
 * is deployed, since computePredictions()/computeBasketballPredictions() only recompute
 * `status = 'scheduled'` matches and upsert the whole row.
 *
 * Re-applies normalizeOutcomes to the already-stored (buggy) integers rather than
 * recomputing from team_form — for `finished` matches that data has moved on since the
 * original computation, so a fresh recompute would change more than just the rounding.
 * This only touches rows currently summing to something other than 100.
 */
async function backfillOutcomeSums() {
  const { data: predictions, error } = await supabase
    .from('predictions')
    .select('match_id, home_win_pct, draw_pct, away_win_pct');
  if (error) throw error;

  const bad = (predictions ?? []).filter(
    (p) => p.home_win_pct + p.draw_pct + p.away_win_pct !== 100,
  );
  console.log(`Found ${bad.length} prediction rows not summing to 100.`);

  for (const row of bad) {
    const fixed = normalizeOutcomes(row.home_win_pct, row.draw_pct, row.away_win_pct);
    const { error: updateError } = await supabase
      .from('predictions')
      .update({ home_win_pct: fixed.home, draw_pct: fixed.draw, away_win_pct: fixed.away })
      .eq('match_id', row.match_id);
    if (updateError) throw updateError;
    console.log(
      `${row.match_id}: ${row.home_win_pct}/${row.draw_pct}/${row.away_win_pct} -> ${fixed.home}/${fixed.draw}/${fixed.away}`,
    );
  }

  console.log(`Backfilled ${bad.length} rows.`);
}

backfillOutcomeSums().catch((error) => {
  console.error(error);
  process.exit(1);
});
