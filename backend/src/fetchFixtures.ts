import { ACTIVE_WINDOW_DAYS, COMPETITIONS, FORM_LOOKBACK_DAYS } from './config.js';
import { getCompetitionMatches, sleep, type FdMatch, type FdTeam } from './footballData.js';
import { supabase } from './supabaseClient.js';

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function upsertTeam(team: FdTeam) {
  const { error } = await supabase.from('teams').upsert({
    id: String(team.id),
    name: team.name,
    short_code: team.tla,
    crest_url: team.crest,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function upsertMatch(match: FdMatch, competitionName: string) {
  const status =
    match.status === 'FINISHED' ? 'finished' : match.status === 'POSTPONED' ? 'postponed' : 'scheduled';

  const { error } = await supabase.from('matches').upsert({
    id: String(match.id),
    competition: competitionName,
    home_team_id: String(match.homeTeam.id),
    away_team_id: String(match.awayTeam.id),
    kickoff_at: match.utcDate,
    status,
    home_score: match.score.fullTime.home,
    away_score: match.score.fullTime.away,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordFormIfFinished(match: FdMatch) {
  if (match.status !== 'FINISHED') return;
  const { home, away } = match.score.fullTime;
  if (home === null || away === null) return;

  const matchDate = match.utcDate.slice(0, 10);
  const rows = [
    {
      team_id: String(match.homeTeam.id),
      match_date: matchDate,
      result: home > away ? 'W' : home === away ? 'D' : 'L',
      goals_for: home,
      goals_against: away,
    },
    {
      team_id: String(match.awayTeam.id),
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

    const matches = await getCompetitionMatches(competition.code, isoDate(formStart), isoDate(windowEnd));

    for (const match of matches) {
      await upsertTeam(match.homeTeam);
      await upsertTeam(match.awayTeam);
      await upsertMatch(match, competition.name);
      await recordFormIfFinished(match);
    }

    console.log(`  ${matches.length} matches synced`);
    // Free tier is rate-limited to a handful of requests per minute — be polite between competitions.
    await sleep(6000);
  }
}
