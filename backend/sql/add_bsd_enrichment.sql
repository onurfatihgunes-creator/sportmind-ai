-- BSD (Bzzoiro Sports Data) enrichment tables — additive only.
-- Does not touch matches/predictions/prediction_changes. One row per match for
-- lineups/raw-stats, one row per player for availability/player-stats.
-- Run once in the Supabase SQL editor, after schema.sql and rls_read_only.sql.

create table if not exists match_lineups (
  match_id text primary key references matches(id) on delete cascade,
  lineup_status text not null check (lineup_status in ('unavailable', 'predicted', 'confirmed')),
  home_formation text,
  away_formation text,
  home_players jsonb,        -- [{ id, name, position, jersey_number }], starters only
  away_players jsonb,
  bsd_event_id bigint not null,   -- provenance: which BSD event this came from
  updated_at timestamptz not null default now()
);

-- One row per unavailable player. Deliberately its own table rather than a jsonb
-- array on match_lineups: an availability change (a player ruled out/back in) is
-- the signal the "change intelligence" layer cares about, and a per-row upsert
-- is what lets a later pass detect that a specific row appeared or disappeared.
create table if not exists player_availability (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id) on delete cascade,
  team_id text not null references teams(id),
  player_name text not null,
  status text not null,      -- BSD's own value, e.g. 'injured' | 'suspended' | 'doubtful' — not normalized further
  reason text,
  bsd_event_id bigint not null,
  updated_at timestamptz not null default now(),
  unique (match_id, player_name)
);

-- BSD's own per-player match statistics (documented response shape — see
-- PlayerStat in BSD's OpenAPI schema). Only populated for matches BSD has
-- actually played out; never fabricated for a scheduled match.
create table if not exists match_player_stats (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id) on delete cascade,
  player_name text not null,
  team_name text,
  minutes_played int,
  rating numeric(3, 1),
  goals int,
  assists int,
  expected_goals numeric(4, 2),
  expected_assists numeric(4, 2),
  total_shots int,
  shots_on_target int,
  bsd_event_id bigint not null,
  updated_at timestamptz not null default now(),
  unique (match_id, player_name)
);

-- BSD's /events/{id}/stats/ response shape is NOT published in its OpenAPI
-- schema (a dynamic/unserialized view) — stored as-is rather than mapped into
-- typed columns we would otherwise be guessing the names of. Once a real
-- response has been inspected live, promote the fields actually present into
-- a typed table; this raw column exists so nothing is lost before that.
create table if not exists match_stats_raw (
  match_id text primary key references matches(id) on delete cascade,
  bsd_event_id bigint not null,
  raw jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_player_availability_match on player_availability (match_id);
create index if not exists idx_match_player_stats_match on match_player_stats (match_id);
