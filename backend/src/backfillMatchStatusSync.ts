import { supabase } from './supabaseClient.js';
import { MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE } from './fetchFixtures.js';

/**
 * One-off backfill for the status-sync gap fixed in fetchFixtures.ts/fetchBsdFixtures.ts/
 * fetchTurkishFixtures.ts: a match whose provider had already reported a real final score
 * but whose `status` never flipped to 'finished' (a provider status-vs-score eventual-
 * consistency lag those files' own upsertMatch now overrides going forward). Confirmed
 * live: 542704 (Ligue 1, football-data.org), bsd-215984, bsd-215985 (Süper Lig, BSD). This
 * filter's first run also caught La Liga 564685 — NOT a real result (a placeholder 0-0 on an
 * October fixture); reverted via backfillRevertFutureFalseFinish.ts, hence the age guard below.
 *
 * The rule here is the same one those ingestion fixes now apply on write: a non-null
 * score on a row that isn't already 'finished' is never a legitimate scheduled/upcoming
 * state for football — every football upsertMatch in this codebase writes
 * home_score/away_score null for a match that hasn't been played. 'postponed' rows are
 * excluded rather than reinterpreted — a postponed fixture can legitimately carry a
 * partial/void score from an abandoned match, which this backfill has no business
 * overriding.
 *
 * BASKETBALL IS DELIBERATELY EXCLUDED, THE HARD WAY: this filter's own first run wrongly
 * flipped 448 genuinely-still-scheduled NBA games to 'finished' before being caught and
 * killed — balldontlie's fake 0-0 placeholder on an unplayed game (see
 * fetchBasketballFixtures.ts's resolveNbaScore) is itself a non-null score, so the same
 * rule that correctly catches football's provider-lag bug false-positives on every single
 * not-yet-played NBA game. Reverted via backfillRevertNbaFalseFinish.ts. Basketball's own
 * scheduled-score bug has its own dedicated, status-safe backfill
 * (backfillNbaScheduledScores.ts, which only ever touches the score columns, never
 * status) — this filter must never re-overlap it.
 */
async function backfillMatchStatusSync() {
  const { data: rows, error } = await supabase
    .from('matches')
    .select('id, competition, sport, status, home_score, away_score')
    .eq('sport', 'football')
    // Same kickoff-age guard as fetchFixtures.ts's resolveFootballMatchStatus: a placeholder
    // 0-0 on a future fixture (La Liga 564685) or a live score must never read as final.
    .lt('kickoff_at', new Date(Date.now() - MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE * 60_000).toISOString())
    .neq('status', 'finished')
    .neq('status', 'postponed')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null);
  if (error) throw error;

  console.log(`Found ${rows?.length ?? 0} match rows with a real score stuck outside 'finished'.`);

  for (const row of rows ?? []) {
    const { error: updateError } = await supabase
      .from('matches')
      .update({ status: 'finished', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (updateError) throw updateError;
    console.log(`${row.id} (${row.sport}/${row.competition}): '${row.status}' -> 'finished' (${row.home_score}-${row.away_score})`);
  }

  console.log(`Backfilled ${rows?.length ?? 0} rows.`);
}

backfillMatchStatusSync().catch((error) => {
  console.error(error);
  process.exit(1);
});
