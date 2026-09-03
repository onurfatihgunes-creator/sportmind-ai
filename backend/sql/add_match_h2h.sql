-- Head-to-head history from BSD's /events/{id}/h2h/ endpoint — additive only, one row
-- per SportMind match, same pattern as match_stats_raw. Confirmed live (2026-09-03,
-- Arsenal vs Chelsea, Everton vs Man Utd, Hull City vs Aston Villa) — a stable, typed
-- shape, so typed columns are used instead of an opaque raw jsonb blob (unlike
-- match_stats_raw, whose per-match stats shape isn't in BSD's OpenAPI schema).
-- `recent_matches` stays jsonb since its length varies.

create table if not exists match_h2h (
  match_id text primary key references matches(id) on delete cascade,
  total_matches int not null,
  home_wins int not null,
  draws int not null,
  away_wins int not null,
  home_goals int not null,
  away_goals int not null,
  avg_total_goals numeric(4, 2),
  home_win_rate numeric(4, 3),
  away_win_rate numeric(4, 3),
  recent_matches jsonb,
  bsd_event_id bigint not null,
  updated_at timestamptz not null default now()
);
