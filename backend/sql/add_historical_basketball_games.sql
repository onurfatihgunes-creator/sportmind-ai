-- NBA history for model training (Nov 2026): past seasons from balldontlie (free tier), kept
-- apart from the live `matches` table; the app never reads it. Team ids use the live convention
-- ('bdl-<balldontlie team id>'), so history and live games share one key per team.
create table if not exists historical_basketball_games (
  id text primary key,                 -- 'bdl-<balldontlie game id>'
  season int not null,                 -- balldontlie season year (2024 = 2024-25)
  postseason boolean not null,
  kickoff_at timestamptz not null,
  home_team_id text not null,
  away_team_id text not null,
  home_score int not null,
  away_score int not null,
  inserted_at timestamptz not null default now()
);

create index if not exists idx_hist_bball_time on historical_basketball_games (kickoff_at);

-- Backend (service role) only.
alter table historical_basketball_games enable row level security;
