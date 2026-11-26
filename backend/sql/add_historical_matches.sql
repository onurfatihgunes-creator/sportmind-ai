-- History backfill for model training (Nov 2026). Past seasons from BSD, kept apart from the
-- live `matches` table: the app never reads this table and no live code path writes to it.
--
-- One row per finished BSD event. Team keys are resolved at backfill time:
--   * our own team id where the team exists in `teams` (BSD-sourced leagues: 'bsd-t<id>';
--     football-data leagues: mapped through this season's already-matched BSD events),
--   * otherwise 'bsdteam-<bsd id>' (e.g. a club relegated before our data starts) — still a
--     consistent key, so it takes part in opponent-strength estimation.
-- Stats are filled by a second, resumable pass (stats_fetched_at); NULL stats = not fetched yet
-- or not provided by BSD for that match (stats_fetched_at tells which).

create table if not exists historical_matches (
  bsd_event_id bigint primary key,
  competition text not null,              -- our competition name, e.g. 'Premier League'
  season_name text not null,              -- BSD's season label, e.g. 'Premier League 24/25'
  kickoff_at timestamptz not null,
  home_team_key text not null,
  away_team_key text not null,
  home_team_name text not null,           -- BSD's name, for audit
  away_team_name text not null,
  home_score int not null,
  away_score int not null,
  home_xg numeric(5, 2),
  away_xg numeric(5, 2),
  home_shots int,
  away_shots int,
  home_shots_on_target int,
  away_shots_on_target int,
  home_big_chances int,
  away_big_chances int,
  stats_fetched_at timestamptz,
  inserted_at timestamptz not null default now()
);

create index if not exists idx_historical_matches_comp_time on historical_matches (competition, kickoff_at);
create index if not exists idx_historical_matches_stats_todo on historical_matches (stats_fetched_at) where stats_fetched_at is null;

-- Backend (service role) only: RLS on, no policy, so the app's anon key cannot read it.
alter table historical_matches enable row level security;
