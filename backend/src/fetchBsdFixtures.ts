import { ACTIVE_WINDOW_DAYS, BSD_FIXTURE_LEAGUES, FORM_LOOKBACK_DAYS } from './config.js';
import { getCurrentSeason, getEvents, getLeagues, type BsdEvent, type BsdLeague } from './bsdFootball.js';
import { supabase } from './supabaseClient.js';
import { resolveTeamId } from './teamIdentity.js';

/**
 * Config-driven BSD fixture ingestion for BSD_FIXTURE_LEAGUES — competitions where BSD is
 * the primary source, not just enrichment (contrast bsdEnrichment.ts, which only attaches
 * lineups/stats/H2H to matches another source already created). Structurally the same
 * pattern fetchTurkishFixtures.ts's `fetchSuperLigFromBsd` already proved out for Süper
 * Lig — same id-prefixing scheme (so a team/match BSD ids can never collide with another
 * provider's), same season-resolved-per-run approach (no hardcoded season id anywhere),
 * same "record team_form only when a match has actually finished" rule. Left as a
 * separate, parallel implementation rather than refactoring that one to share this code:
 * Süper Lig's fallback is a narrow, already-audited safety net for one specific provider
 * gap, and this generalizes the pattern for genuinely BSD-first leagues without touching it.
 */

// Same prefixing convention as fetchTurkishFixtures.ts's BSD fallback — BSD's own team/
// event ids are already globally unique across leagues, so reusing the identical `bsd-t`/
// `bsd-` prefixes here (rather than inventing a second scheme) means a team that happens
// to appear under both a BSD_FIXTURE_LEAGUES competition and the Süper Lig BSD fallback
// resolves to the same row instead of duplicating it.
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

// Same status collapse as fetchTurkishFixtures.ts's BSD path — BSD's richer status
// vocabulary folds into SportMind's 3-value `matches.status` check constraint.
function bsdStatusOf(event: BsdEvent) {
  if (event.status === 'finished') return 'finished';
  if (event.status === 'cancelled' || event.status === 'postponed') return 'postponed';
  return 'scheduled';
}

async function upsertBsdMatch(event: BsdEvent, competition: string, homeId: string, awayId: string) {
  const { error } = await supabase.from('matches').upsert({
    id: bsdMatchId(event.id),
    competition,
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

type BsdFixtureLeagueConfig = (typeof BSD_FIXTURE_LEAGUES)[number];

async function fetchOneLeague(
  leagueConfig: BsdFixtureLeagueConfig,
  leagues: BsdLeague[],
  windowStart: Date,
  windowEnd: Date,
): Promise<number> {
  const league = leagues.find((l) => l.name === leagueConfig.bsdName && l.country === leagueConfig.bsdCountry);
  if (!league) {
    console.log(`  BSD fixtures (${leagueConfig.competition}): no league match for ${leagueConfig.bsdName}/${leagueConfig.bsdCountry} — skipping.`);
    return 0;
  }

  const season = await getCurrentSeason(league.id);
  if (!season) {
    console.log(`  BSD fixtures (${leagueConfig.competition}): no current season reported — skipping.`);
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
    await upsertBsdMatch(event, leagueConfig.competition, homeId, awayId);
    await recordBsdFormIfFinished(event, homeId, awayId);
  }

  return events.length;
}

/** Syncs every BSD_FIXTURE_LEAGUES competition. One league's failure (a name/country
 * mismatch against BSD's current catalog, no current season reported, a transient BSD
 * error) must never block another — same isolation principle already used for BSD
 * enrichment's per-match loop and the basketball/Süper-Lig isolation in index.ts. */
export async function fetchBsdFixtureLeagues() {
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + ACTIVE_WINDOW_DAYS);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - FORM_LOOKBACK_DAYS);

  // Fetched once and reused for every configured league this run, rather than once per
  // league — BSD_TIER1_LEAGUES' own getLeagues() call already established this is cheap
  // (83 leagues, one page) and safe to share.
  const leagues = await getLeagues();

  for (const leagueConfig of BSD_FIXTURE_LEAGUES) {
    try {
      const count = await fetchOneLeague(leagueConfig, leagues, windowStart, windowEnd);
      console.log(`  ${count} ${leagueConfig.competition} fixtures synced (BSD)`);
    } catch (error) {
      console.error(`  ${leagueConfig.competition} BSD fixture sync failed, continuing with the next league:`, error);
    }
  }
}
