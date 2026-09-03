import { ACTIVE_WINDOW_DAYS, FORM_LOOKBACK_DAYS } from './config.js';
import { getLeagueMatches, SUPER_LIG_ID, type RflMatch } from './rapidApiFootball.js';
import { supabase } from './supabaseClient.js';
import { resolveTeamId } from './teamIdentity.js';

// Prefixed to keep this provider's raw ids from colliding with football-data.org's and
// balldontlie's ids — the fallback id when resolveTeamId finds no existing cross-provider
// match by name (see teamIdentity.ts).
const rawTeamId = (id: string) => `ffld-${id}`;
const matchId = (id: string) => `ffld-${id}`;

async function upsertTeam(id: string, team: { name: string }) {
  const { error } = await supabase.from('teams').upsert({
    id,
    name: team.name,
    short_code: team.name.slice(0, 3).toUpperCase(),
    sport: 'football',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

function statusOf(match: RflMatch) {
  if (match.status.cancelled) return 'postponed';
  if (match.status.finished) return 'finished';
  return 'scheduled';
}

async function upsertMatch(match: RflMatch, homeId: string, awayId: string) {
  const { error } = await supabase.from('matches').upsert({
    id: matchId(match.id),
    competition: 'Süper Lig',
    sport: 'football',
    home_team_id: homeId,
    away_team_id: awayId,
    kickoff_at: match.status.utcTime,
    status: statusOf(match),
    home_score: match.home.score,
    away_score: match.away.score,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordFormIfFinished(match: RflMatch, homeId: string, awayId: string) {
  if (!match.status.finished) return;
  const home = match.home.score;
  const away = match.away.score;

  const matchDate = match.status.utcTime.slice(0, 10);
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
 * Pulls Süper Lig fixtures/results via the free-api-live-football-data RapidAPI listing (a
 * FotMob-backed provider) — confirmed to serve the current season without api-football's
 * free-tier season lock. The provider returns the whole season in one call, so this filters
 * client-side to the same active + lookback window as fetchFixtures.ts. Predictions are
 * computed by the regular computePredictions.ts pass afterwards — Süper Lig matches are
 * plain sport:'football' rows, no separate compute step needed.
 */
export async function fetchTurkishFixtures() {
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + ACTIVE_WINDOW_DAYS);
  const formStart = new Date(today);
  formStart.setDate(formStart.getDate() - FORM_LOOKBACK_DAYS);

  const allMatches = await getLeagueMatches(SUPER_LIG_ID);
  const matches = allMatches.filter((m) => {
    const kickoff = new Date(m.status.utcTime);
    return kickoff >= formStart && kickoff <= windowEnd;
  });

  for (const match of matches) {
    const homeId = await resolveTeamId('football', rawTeamId(match.home.id), match.home.name);
    const awayId = await resolveTeamId('football', rawTeamId(match.away.id), match.away.name);
    await upsertTeam(homeId, match.home);
    await upsertTeam(awayId, match.away);
    await upsertMatch(match, homeId, awayId);
    await recordFormIfFinished(match, homeId, awayId);
  }

  console.log(`  ${matches.length} Süper Lig fixtures synced`);
}
