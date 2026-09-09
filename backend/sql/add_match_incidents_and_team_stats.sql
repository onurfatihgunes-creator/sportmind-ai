-- Data-foundation expansion for the "NEXT-GENERATION MATCH PROBABILITY ENGINE" audit —
-- additive only, does not touch matches/predictions/prediction_changes/existing BSD
-- enrichment tables. Confirmed live (2026-09-09, 280 finished BSD events across all 7
-- BSD_TIER1_LEAGUES) that BSD's own free-tier /events/{id}/incidents/ and
-- /events/{id}/stats/ endpoints return real, per-match data this app has never stored
-- before: goal-by-goal minute+side timelines and real (non-estimated, for 224/280 —
-- 80%) shot-based xG, shots, possession, corners, cards, big chances. Neither table
-- here is populated by fabricated/derived values — see backend/src/bsdEnrichment.ts's
-- parseIncidents/parseTeamMatchStats for exactly what each column is copied from.
--
-- match_stats_raw (add_bsd_enrichment.sql) is left completely as-is and keeps being
-- written — this is the typed promotion its own comment already anticipated ("once a
-- real response has been inspected live, promote the fields actually present into a
-- typed table"), not a replacement.

-- One row per real goal/card/substitution incident BSD reports for a match. `minute`
-- lets a later pass reconstruct a real (not proportionally-split) half-time score by
-- filtering incident_type='goal' AND minute<=45 — see backfillTeamMatchStats.ts's own
-- audit note on the ~3.6% known rate of incidents whose derived goal count doesn't
-- match matches.home_score/away_score (a real BSD data-quality gap, not a bug here);
-- any consumer of this table for a HT reconstruction must cross-check against the real
-- final score first, exactly as that script does.
create table if not exists match_incidents (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id) on delete cascade,
  incident_type text not null,      -- BSD's own value, e.g. 'goal' | 'yellow_card' | 'red_card' | 'substitution'
  minute int not null,
  is_home boolean not null,
  player_name text not null,
  assist_player_name text,
  bsd_event_id bigint not null,
  updated_at timestamptz not null default now(),
  unique (match_id, incident_type, minute, is_home, player_name)
);

create index if not exists idx_match_incidents_match on match_incidents (match_id);

-- One row per team per match, promoted from match_stats_raw's opaque `raw` jsonb once
-- its real field names were confirmed live (see this file's header). `xg_actual` is
-- null whenever BSD itself has no real (non-estimated) shot-based xG for that match —
-- never backfilled with the old goals-average proxy; a consumer needing "is this real"
-- checks `xg_actual is not null`, never assumes it.
create table if not exists team_match_stats (
  match_id text not null references matches(id) on delete cascade,
  team_id text not null references teams(id),
  side text not null check (side in ('home', 'away')),
  xg_actual numeric(4, 2),
  total_shots int,
  shots_on_target int,
  ball_possession int,
  corner_kicks int,
  yellow_cards int,
  red_cards int,
  big_chances int,
  fouls int,
  bsd_event_id bigint not null,
  updated_at timestamptz not null default now(),
  primary key (match_id, side)
);

create index if not exists idx_team_match_stats_team on team_match_stats (team_id);
