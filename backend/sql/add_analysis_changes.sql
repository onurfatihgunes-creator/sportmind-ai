-- Generalized analysis change log — additive only, does not touch matches/predictions/
-- prediction_changes/BSD enrichment tables. prediction_changes stays exactly as-is
-- (its from_home_win_pct/to_home_win_pct columns are prediction-percentage-specific);
-- this table exists because squad/lineup change events (a player becoming unavailable,
-- a lineup being confirmed) don't have a "percentage" to store and need a general
-- previous/new value pair instead. See backend/src/analysisEngine.ts for what writes
-- here (only bsdEnrichment.ts, on real detected state transitions — never on first
-- ingestion, never a fabricated change).

create table if not exists analysis_changes (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id) on delete cascade,
  change_type text not null,       -- e.g. 'lineup_status_changed', 'player_unavailable', 'player_available_again'
  category text not null,          -- e.g. 'squad'
  previous_value text,             -- null only when there is genuinely no prior state to report
  new_value text not null,
  impact text,                     -- short deterministic description, e.g. 'home_squad_weakened'
  confidence_before numeric,
  confidence_after numeric,
  source text not null,            -- e.g. 'bsd_lineups', 'bsd_availability'
  created_at timestamptz not null default now()
);

create index if not exists idx_analysis_changes_match on analysis_changes (match_id, created_at desc);
