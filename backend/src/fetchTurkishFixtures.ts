import { ACTIVE_WINDOW_DAYS, FORM_LOOKBACK_DAYS } from './config.js';
import { getFixtures, resolveSuperLigId, sleep, type AfFixture } from './apiFootball.js';
import { supabase } from './supabaseClient.js';

// Prefixed to keep api-football's numeric ids from colliding with football-data.org's
// and balldontlie's ids in the shared teams/matches tables.
const teamId = (id: number) => `apif-${id}`;
const matchId = (id: number) => `apif-${id}`;

const FINISHED = new Set(['FT', 'AET', 'PEN']);
const POSTPONED = new Set(['PST', 'CANC', 'ABD']);

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function upsertTeam(team: { id: number; name: string; code: string | null }) {
  const { error } = await supabase.from('teams').upsert({
    id: teamId(team.id),
    name: team.name,
    short_code: team.code ?? team.name.slice(0, 3).toUpperCase(),
    sport: 'football',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function upsertMatch(fx: AfFixture) {
  const short = fx.fixture.status.short;
  const status = FINISHED.has(short) ? 'finished' : POSTPONED.has(short) ? 'postponed' : 'scheduled';
  const { error } = await supabase.from('matches').upsert({
    id: matchId(fx.fixture.id),
    competition: 'Süper Lig',
    sport: 'football',
    home_team_id: teamId(fx.teams.home.id),
    away_team_id: teamId(fx.teams.away.id),
    kickoff_at: fx.fixture.date,
    status,
    home_score: fx.goals.home,
    away_score: fx.goals.away,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordFormIfFinished(fx: AfFixture) {
  if (!FINISHED.has(fx.fixture.status.short)) return;
  const { home, away } = fx.goals;
  if (home === null || away === null) return;

  const matchDate = fx.fixture.date.slice(0, 10);
  const rows = [
    {
      team_id: teamId(fx.teams.home.id),
      match_date: matchDate,
      result: home > away ? 'W' : home === away ? 'D' : 'L',
      goals_for: home,
      goals_against: away,
    },
    {
      team_id: teamId(fx.teams.away.id),
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
 * Pulls Süper Lig fixtures in the active + lookback windows via api-football (api-sports.io),
 * mirroring fetchFixtures.ts's shape. Predictions are computed by the regular
 * computePredictions.ts pass afterwards — Süper Lig matches are plain sport:'football' rows,
 * no separate compute step needed.
 */
export async function fetchTurkishFixtures() {
  const leagueId = await resolveSuperLigId();
  await sleep(2000);

  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + ACTIVE_WINDOW_DAYS);
  const formStart = new Date(today);
  formStart.setDate(formStart.getDate() - FORM_LOOKBACK_DAYS);

  // A season can span two calendar years (e.g. Aug 2025 - May 2026 = season 2025), and the
  // lookback/active window here can straddle two season labels — query both plausible
  // years and merge rather than guessing which one api-football expects.
  const seasonsToTry = Array.from(new Set([today.getFullYear(), today.getFullYear() - 1]));

  const seen = new Map<number, AfFixture>();
  for (const season of seasonsToTry) {
    const fixtures = await getFixtures(leagueId, season, isoDate(formStart), isoDate(windowEnd));
    for (const fx of fixtures) seen.set(fx.fixture.id, fx);
    await sleep(2000);
  }
  const fixtures = Array.from(seen.values());

  for (const fx of fixtures) {
    await upsertTeam(fx.teams.home);
    await upsertTeam(fx.teams.away);
    await upsertMatch(fx);
    await recordFormIfFinished(fx);
  }

  console.log(`  ${fixtures.length} Süper Lig fixtures synced`);
}
