import { BASKETBALL_ACTIVE_WINDOW_DAYS, FORM_LOOKBACK_DAYS } from './config.js';
import { getGamesInRange, type BdlGame, type BdlTeam } from './balldontlie.js';
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

/**
 * balldontlie returns 0 (not null) for home_team_score/visitor_team_score on a game that
 * hasn't been played yet — unlike football-data.org, which sends a real null for an
 * unplayed fixture's score.fullTime (see fetchFixtures.ts's upsertMatch). Copying that 0
 * verbatim persisted a fake "0-0" score on every scheduled NBA game (559 rows confirmed
 * live) — currently harmless (the mobile app never reads matches.home_score/away_score at
 * all, see data/liveData.ts's matchSelect) but a real latent trap for any future consumer
 * that checks "score is not null" as its finished-match signal. Only a genuinely finished
 * game's score is ever persisted; every other status gets a real null, matching football's
 * own semantics. Exported standalone so this is directly testable — see
 * fetchBasketballFixtures.test.ts.
 */
export function resolveNbaScore(status: 'scheduled' | 'finished', rawScore: number | null): number | null {
  return status === 'finished' ? rawScore : null;
}

async function upsertMatch(game: BdlGame) {
  const status = game.status === 'Final' ? 'finished' : 'scheduled';
  const home_score = resolveNbaScore(status, game.home_team_score);
  const away_score = resolveNbaScore(status, game.visitor_team_score);
  const { error } = await supabase.from('matches').upsert({
    id: gameId(game.id),
    competition: 'NBA',
    sport: 'basketball',
    home_team_id: teamId(game.home_team.id),
    away_team_id: teamId(game.visitor_team.id),
    kickoff_at: game.datetime,
    status,
    home_score,
    away_score,
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
 * Pulls NBA games in the active window (upcoming fixtures) and lookback window (recent
 * results, to feed team_form). Mirrors fetchFixtures.ts's shape but against
 * balldontlie.io instead of football-data.org. Run on a schedule via GitHub Actions.
 *
 * Teams are upserted from the games themselves (each BdlGame already embeds its own
 * home_team/visitor_team), not from a separate bulk /teams call — that endpoint returns
 * balldontlie's entire cross-league team database (EuroLeague, NBL, historical defunct
 * NBA/BAA franchises, etc.), not just current NBA teams. Confirmed live: upserting it
 * wholesale had put 89 team rows in Supabase for only 30 real, game-referenced teams —
 * 59 were orphaned entries (e.g. "Cleveland Rebels", "Real Madrid Real Madrid",
 * "Perth Wildcats") that no ingested game would ever reference, cluttering any team list
 * built from the `teams` table (e.g. the AI Insights "add team" picker).
 */
export async function fetchBasketballFixtures() {
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + BASKETBALL_ACTIVE_WINDOW_DAYS);
  const formStart = new Date(today);
  formStart.setDate(formStart.getDate() - FORM_LOOKBACK_DAYS);

  const games = await getGamesInRange(isoDate(formStart), isoDate(windowEnd));

  const seenTeamIds = new Set<number>();
  for (const game of games) {
    if (!seenTeamIds.has(game.home_team.id)) {
      await upsertTeam(game.home_team);
      seenTeamIds.add(game.home_team.id);
    }
    if (!seenTeamIds.has(game.visitor_team.id)) {
      await upsertTeam(game.visitor_team);
      seenTeamIds.add(game.visitor_team.id);
    }
    await upsertMatch(game);
    await recordFormIfFinished(game);
  }

  console.log(`  ${games.length} NBA games synced (${seenTeamIds.size} teams)`);
}
