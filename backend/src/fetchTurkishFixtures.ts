import { ACTIVE_WINDOW_DAYS, BSD_TIER1_LEAGUES, FORM_LOOKBACK_DAYS } from './config.js';
import { getLeagueMatches, SUPER_LIG_ID, type RflMatch } from './rapidApiFootball.js';
import { getCurrentSeason, getEvents, getLeagues, type BsdEvent } from './bsdFootball.js';
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

// BSD event ids are numeric and only ever collide with RapidAPI's own numeric ids by
// coincidence, not identity — prefixed distinctly from `ffld-` so the two providers can
// never write over each other's row for what might otherwise look like "the same id".
const bsdRawTeamId = (id: number) => `bsd-t${id}`;
const bsdMatchId = (id: number) => `bsd-${id}`;

async function upsertBsdTeam(id: string, name: string) {
  const { error } = await supabase.from('teams').upsert({
    id,
    name,
    short_code: name.slice(0, 3).toUpperCase(),
    sport: 'football',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// BSD's status vocabulary is richer than SportMind's 3-value `matches.status` (DB check
// constraint: 'scheduled' | 'finished' | 'postponed') — collapsed the same way
// fetchFixtures.ts already collapses football-data.org's own richer set (IN_PLAY/PAUSED/etc
// all fall through to 'scheduled' there too), so an in-progress match is still treated as
// upcoming/predictable rather than needing a status this schema has no room for.
function bsdStatusOf(event: BsdEvent) {
  if (event.status === 'finished') return 'finished';
  if (event.status === 'cancelled' || event.status === 'postponed') return 'postponed';
  return 'scheduled';
}

async function upsertBsdMatch(event: BsdEvent, homeId: string, awayId: string) {
  const { error } = await supabase.from('matches').upsert({
    id: bsdMatchId(event.id),
    competition: 'Süper Lig',
    sport: 'football',
    home_team_id: homeId,
    away_team_id: awayId,
    kickoff_at: event.event_date,
    status: bsdStatusOf(event),
    home_score: event.home_score,
    away_score: event.away_score,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordBsdFormIfFinished(event: BsdEvent, homeId: string, awayId: string) {
  if (event.status !== 'finished' || event.home_score == null || event.away_score == null) return;
  const home = event.home_score;
  const away = event.away_score;

  const matchDate = event.event_date.slice(0, 10);
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
 * Fallback fixture source for Süper Lig, used ONLY when RapidAPI's listing has no fixture
 * at or after today — confirmed live (2026-09-06) that this can genuinely happen: RapidAPI's
 * `/football-get-all-matches-by-league` for leagueid=71 kept returning just the 2025/26
 * season (last kickoff 2026-05-17) even after the real 2026/27 season had kicked off per
 * TFF, with no error and no season parameter to correct — the provider's own "current
 * season" listing simply hadn't rolled over yet. BSD (already used for Süper Lig
 * enrichment — see BSD_TIER1_LEAGUES/bsdEnrichment.ts) was confirmed live the same day to
 * already have the real "Super Lig 26/27" season (BSD league id 11, season id 1539) with
 * real fixtures on 2026-09-04..07 matching TFF's confirmed matchday window exactly.
 *
 * This only ever ADDS forward-looking coverage — it never touches historical rows (those
 * still come from RapidAPI within FORM_LOOKBACK_DAYS) — and self-disables the moment
 * RapidAPI's own listing catches up to the current season, with no manual toggle needed.
 */
async function fetchSuperLigFromBsd(windowStart: Date, windowEnd: Date): Promise<number> {
  const tier1 = BSD_TIER1_LEAGUES.find((l) => l.competition === 'Süper Lig');
  if (!tier1) return 0;

  const leagues = await getLeagues();
  const league = leagues.find((l) => l.name === tier1.bsdName && l.country === tier1.bsdCountry);
  if (!league) {
    console.log(`  BSD Süper Lig fallback: no league match for ${tier1.bsdName}/${tier1.bsdCountry} — skipping.`);
    return 0;
  }

  const season = await getCurrentSeason(league.id);
  if (!season) {
    console.log('  BSD Süper Lig fallback: no current season reported — skipping.');
    return 0;
  }

  const isoDate = (d: Date) => d.toISOString().slice(0, 10);
  const events = await getEvents({
    leagueId: league.id,
    seasonId: season.id,
    dateFrom: isoDate(windowStart),
    dateTo: isoDate(windowEnd),
  });

  for (const event of events) {
    const homeId = await resolveTeamId('football', bsdRawTeamId(event.home_team_id ?? event.id), event.home_team);
    const awayId = await resolveTeamId('football', bsdRawTeamId(event.away_team_id ?? event.id), event.away_team);
    await upsertBsdTeam(homeId, event.home_team);
    await upsertBsdTeam(awayId, event.away_team);
    await upsertBsdMatch(event, homeId, awayId);
    await recordBsdFormIfFinished(event, homeId, awayId);
  }

  return events.length;
}

/**
 * Pulls Süper Lig fixtures/results via the free-api-live-football-data RapidAPI listing (a
 * FotMob-backed provider) — confirmed to serve the current season without api-football's
 * free-tier season lock. The provider returns the whole season in one call, so this filters
 * client-side to the same active + lookback window as fetchFixtures.ts. Predictions are
 * computed by the regular computePredictions.ts pass afterwards — Süper Lig matches are
 * plain sport:'football' rows, no separate compute step needed.
 *
 * If RapidAPI's listing turns out to have nothing at/after today (see
 * fetchSuperLigFromBsd's doc comment for why that can happen despite a real current season
 * existing), BSD is used as a narrowly-scoped fallback for forward-looking fixtures only.
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

  console.log(`  ${matches.length} Süper Lig fixtures synced (RapidAPI)`);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const hasCurrentSeasonCoverage = matches.some((m) => new Date(m.status.utcTime) >= yesterday);

  if (!hasCurrentSeasonCoverage) {
    console.log('  RapidAPI Süper Lig has no fixtures at/after yesterday — falling back to BSD for current-season coverage.');
    try {
      const bsdCount = await fetchSuperLigFromBsd(today, windowEnd);
      console.log(`  ${bsdCount} Süper Lig fixtures synced (BSD fallback)`);
    } catch (error) {
      console.error('  BSD Süper Lig fallback failed:', error);
    }
  }
}
