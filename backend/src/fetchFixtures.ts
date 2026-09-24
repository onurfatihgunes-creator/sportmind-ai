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
 * flipped to FINISHED yet on the provider's own side) — the reason this override exists
 * (BSD-sourced Süper Lig rows bsd-215984/985 were stuck 'scheduled' with real scores). It is
 * NOT for 0-0 placeholders: Ligue 1 542704, once believed to be such a stuck result, is a
 * match BSD reports as canceled (see the CANCELLED mapping below).
 *
 * A non-null score overrides an ambiguous status ONLY once the match has had time to
 * finish (kickoff at least MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE ago). Without that
 * guard, the first version of this rule misfired both ways, confirmed live: (1) the
 * provider sends a placeholder 0-0 for some unplayed fixtures — La Liga 564685, kicking
 * off weeks from now, was flipped to 'finished'; (2) a match in progress carries a live,
 * non-final score and was marked finished mid-game. Exported standalone (with an
 * injectable `now`) so the decision is directly testable — see fetchFixtures.test.ts.
 */
export const MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE = 180;

export function resolveFootballMatchStatus(
  providerStatus: string,
  homeScore: number | null,
  awayScore: number | null,
  kickoffIso: string,
  now: Date = new Date(),
): 'scheduled' | 'finished' | 'postponed' {
  // CANCELLED folds into 'postponed' exactly as the BSD/RapidAPI paths already collapse
  // their own cancelled state (the matches.status check constraint has no room for a 4th
  // value). Unmapped, a cancelled fixture's placeholder 0-0 fell through to the score
  // override below — confirmed live: Ligue 1 542704 (Nantes v Toulouse, 2026-05-17, BSD
  // reports it 'canceled') was written as a finished 0-0 that never happened.
  if (providerStatus === 'POSTPONED' || providerStatus === 'CANCELLED') return 'postponed';
  if (providerStatus === 'FINISHED') return 'finished';
  const hasScore = homeScore !== null && awayScore !== null;
  const minutesSinceKickoff = (now.getTime() - new Date(kickoffIso).getTime()) / 60_000;
  return hasScore && minutesSinceKickoff >= MIN_MINUTES_SINCE_KICKOFF_FOR_SCORE_OVERRIDE ? 'finished' : 'scheduled';
}

/**
 * A score is only ever persisted for a match that is actually finished. Providers send
 * placeholder scores for matches that never produced one — a 0-0 on an unplayed or
 * cancelled fixture (La Liga 564685, Ligue 1 542704; balldontlie does the same for NBA, see
 * fetchBasketballFixtures.ts's resolveNbaScore) — and persisting them made a non-null
 * score look like evidence of a played match to every later reader. Exported so all
 * football fetchers share one rule; see fetchFixtures.test.ts.
 */
export function persistedScore(status: 'scheduled' | 'finished' | 'postponed', score: number | null | undefined): number | null {
  return status === 'finished' ? (score ?? null) : null;
}

async function upsertMatch(match: FdMatch, competitionName: string, homeId: string, awayId: string) {
  const status = resolveFootballMatchStatus(match.status, match.score.fullTime.home, match.score.fullTime.away, match.utcDate);

  const { error } = await supabase.from('matches').upsert({
    id: String(match.id),
    competition: competitionName,
    home_team_id: homeId,
    away_team_id: awayId,
    kickoff_at: match.utcDate,
    status,
    home_score: persistedScore(status, match.score.fullTime.home),
    away_score: persistedScore(status, match.score.fullTime.away),
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
