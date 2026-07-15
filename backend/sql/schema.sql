-- SportMind AI — Supabase/Postgres schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) to set up storage
-- for teams, matches, and the AI's computed predictions.

create table if not exists teams (
  id text primary key,               -- provider's team id, e.g. football-data.org id as text
  name text not null,
  short_code text not null,
  crest_url text,
  updated_at timestamptz not null default now()
);

create table if not exists team_form (
  team_id text not null references teams(id) on delete cascade,
  match_date date not null,
  result text not null check (result in ('W', 'D', 'L')),
  goals_for int not null,
  goals_against int not null,
  primary key (team_id, match_date)
);

create table if not exists matches (
  id text primary key,               -- provider's fixture id as text
  competition text not null,
  home_team_id text not null references teams(id),
  away_team_id text not null references teams(id),
  kickoff_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'finished', 'postponed')),
  home_score int,
  away_score int,
  updated_at timestamptz not null default now()
);

create index if not exists idx_matches_kickoff on matches (kickoff_at);

-- One row per match holding the AI's current computed output. Recomputed whenever
-- underlying data (form, injuries, lineups) changes — see backend/src/computePredictions.ts.
create table if not exists predictions (
  match_id text primary key references matches(id) on delete cascade,
  home_win_pct int not null,
  draw_pct int not null,
  away_win_pct int not null,
  xg_home numeric(3,1) not null,
  xg_away numeric(3,1) not null,
  recent_avg_goals_home numeric(3,1) not null,
  recent_avg_goals_away numeric(3,1) not null,
  factors jsonb not null,             -- [{ key, home, away }, ...] — see MatchFactor type in the app
  computed_at timestamptz not null default now()
);

-- Append-only log of material prediction changes, powers the "What changed?" screen
-- and triggers push notifications. A new row is inserted only when a recompute moves
-- home_win_pct/draw_pct/away_win_pct by more than a materiality threshold (see
-- computePredictions.ts) — trivial recalculations do not get logged here.
create table if not exists prediction_changes (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id) on delete cascade,
  reason text not null,              -- e.g. 'lineup_confirmed', 'injury_update', 'weather_update'
  from_home_win_pct int not null,
  to_home_win_pct int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prediction_changes_match on prediction_changes (match_id, created_at desc);
