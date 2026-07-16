import { ACTIVE_WINDOW_DAYS, FORM_LOOKBACK_DAYS } from './config.js';
import { getAllTeams, getGamesInRange, sleep, type BdlGame, type BdlTeam } from './balldontlie.js';
import { supabase } from './supabaseClient.js';

// Prefixed to keep NBA ids from colliding with football-data.org's numeric ids in the
// shared teams/matches tables.
const teamId = (id: number) => `bdl-${id}`;
const gameId = (id: number) => `bdl-${id}`;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function upsertTeam(team: BdlTeam) {
  const { error } = await supabase.from('teams').upsert({
    id: teamId(team.id),
    name: team.full_name,
    short_code: team.abbreviation,
    sport: 'basketball',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function upsertMatch(game: BdlGame) {
  const status = game.status === 'Final' ? 'finished' : 'scheduled';
  const { error } = await supabase.from('matches').upsert({
    id: gameId(game.id),
    competition: 'NBA',
    sport: 'basketball',
    home_team_id: teamId(game.home_team.id),
    away_team_id: teamId(game.visitor_team.id),
    kickoff_at: game.datetime,
    status,
    home_score: game.home_team_score,
    away_score: game.visitor_team_score,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function recordFormIfFinished(game: BdlGame) {
  if (game.status !== 'Final') return;
  const { home_team_score: home, visitor_team_score: away } = game;
  if (home === null || away === null) return;

  const matchDate = game.datetime.slice(0, 10);
  const rows = [
    {
      team_id: teamId(game.home_team.id),
      match_date: matchDate,
      result: home > away ? 'W' : 'L',
      goals_for: home,
      goals_against: away,
    },
    {
      team_id: teamId(game.visitor_team.id),
      match_date: matchDate,
      result: away > home ? 'W' : 'L',
      goals_for: away,
      goals_against: home,
    },
  ];
  const { error } = await supabase.from('team_form').upsert(rows);
  if (error) throw error;
}

/**
 * Pulls NBA teams + games in the active window (upcoming fixtures) and lookback window
 * (recent results, to feed team_form). Mirrors fetchFixtures.ts's shape but against
 * balldontlie.io instead of football-data.org. Run on a schedule via GitHub Actions.
 */
export async function fetchBasketballFixtures() {
  const teams = await getAllTeams();
  for (const team of teams) await upsertTeam(team);
  await sleep(13000);

  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + ACTIVE_WINDOW_DAYS);
  const formStart = new Date(today);
  formStart.setDate(formStart.getDate() - FORM_LOOKBACK_DAYS);

  const games = await getGamesInRange(isoDate(formStart), isoDate(windowEnd));

  for (const game of games) {
    await upsertMatch(game);
    await recordFormIfFinished(game);
  }

  console.log(`  ${games.length} NBA games synced`);
}
