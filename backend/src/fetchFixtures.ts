import { ACTIVE_WINDOW_DAYS, COMPETITIONS, FORM_LOOKBACK_DAYS } from './config.js';
import { getCompetitionMatches, sleep, type FdMatch, type FdTeam } from './footballData.js';
import { supabase } from './supabaseClient.js';
import { resolveTeamId } from './teamIdentity.js';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function upsertTeam(id: string, team: FdTeam) {
  const { error } = await supabase.from('teams').upsert({
    id,
    name: team.name,
    short_code: team.tla,
    crest_url: team.crest,
    sport: 'football',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * football-data.org's status vocabulary is richer than FINISHED/POSTPONED (IN_PLAY,
 * PAUSED, SUSPENDED, AWARDED, ...) and has been observed to lag behind the score itself
 * settling (a match can carry a real, non-null final score while `status` hasn't
 * flipped to FINISHED yet on the provider's own side) — confirmed live: match 542704
 * stuck at `status='scheduled'` with a real 0-0 final score, aged out of the
 * active/lookback fetch window so it was never re-fetched to self-correct. A real,
 * non-null score is itself the authoritative signal a match has concluded (this is only
 * ever called with one null for a match that hasn't been played — see
 * recordFormIfFinished's identical null-check), so it overrides an ambiguous/unmapped
 * status string rather than silently falling through to 'scheduled'. Exported standalone
 * so the status decision is directly testable — see fetchFixtures.test.ts.
 */
export function resolveFootballMatchStatus(
  providerStatus: string,
  homeScore: number | null,
  awayScore: number | null,
): 'scheduled' | 'finished' | 'postponed' {
  if (providerStatus === 'POSTPONED') return 'postponed';
  const hasFinalScore = homeScore !== null && awayScore !== null;
  return providerStatus === 'FINISHED' || hasFinalScore ? 'finished' : 'scheduled';
}

async function upsertMatch(match: FdMatch, competitionName: string, homeId: string, awayId: string) {
  const status = resolveFootballMatchStatus(match.status, match.score.fullTime.home, match.score.fullTime.away);

  const { error } = await supabase.from('matches').upsert({
    id: String(match.id),
    competition: competitionName,
    home_team_id: homeId,
    away_team_id: awayId,
    kickoff_at: match.utcDate,
    status,
    home_score: match.score.fullTime.home,
    away_score: match.score.fullTime.away,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordFormIfFinished(match: FdMatch, homeId: string, awayId: string) {
  if (match.status !== 'FINISHED') return;
  const { home, away } = match.score.fullTime;
  if (home === null || away === null) return;

  const matchDate = match.utcDate.slice(0, 10);
  const rows = [
    {
      team_id: homeId,
      match_date: matchDate,
      result: home > away ? 'W' : home === away ? 'D' : 'L',
      goals_for: home,
      goals_against: away,
    },
    {
      team_id: awayId,
      match_date: matchDate,
      result: away > home ? 'W' : home === away ? 'D' : 'L',
      goals_for: away,
      goals_against: home,
    },
  ];
  const { error } = await supabase.from('team_form').upsert(rows);
  if (error) throw error;
}

/**
 * Pulls, per competition: the upcoming active-window fixtures (to analyse) plus the last
 * FORM_LOOKBACK_DAYS of finished matches (to keep team_form current for the recent-form
 * calculation). Run on a schedule via GitHub Actions — see .github/workflows/data-pipeline.yml.
 */
export async function fetchFixtures() {
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + ACTIVE_WINDOW_DAYS);
  const formStart = new Date(today);
  formStart.setDate(formStart.getDate() - FORM_LOOKBACK_DAYS);

  for (const competition of COMPETITIONS) {
    console.log(`Fetching ${competition.name}...`);

    // One competition's failure (rate limit, transient network error, a malformed
    // response) must not skip every competition after it in the array — this loop used
    // to have no isolation at all, and fetchFixtures() itself is called unwrapped in
    // index.ts, so a single bad competition here previously killed the entire pipeline
    // run: no Süper Lig sync, no predictions, no BSD enrichment, no basketball. Same
    // per-item isolation principle already used for BSD enrichment's per-match loop.
    try {
      const matches = await getCompetitionMatches(competition.code, isoDate(formStart), isoDate(windowEnd));

      for (const match of matches) {
        const homeId = await resolveTeamId('football', String(match.homeTeam.id), match.homeTeam.name);
        const awayId = await resolveTeamId('football', String(match.awayTeam.id), match.awayTeam.name);
        await upsertTeam(homeId, match.homeTeam);
        await upsertTeam(awayId, match.awayTeam);
        await upsertMatch(match, competition.name, homeId, awayId);
        await recordFormIfFinished(match, homeId, awayId);
      }

      console.log(`  ${matches.length} matches synced`);
    } catch (error) {
      console.error(`  ${competition.name} sync failed, continuing with the next competition:`, error);
    }
    // Free tier is rate-limited to a handful of requests per minute — be polite between competitions.
    await sleep(6000);
  }
}
