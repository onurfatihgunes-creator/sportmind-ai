-- V3 Phase A3 (prepared Nov 2026, NOT yet applied to production).
--
-- Problem this fixes: `match_lineups` and `player_availability` keep only the CURRENT state.
-- 516 of 577 lineup rows were last updated after kickoff, so the information that was really
-- available before a match is gone, and no squad/injury effect can ever be backtested.
--
-- Design: an append-only, timestamped snapshot per change, recorded ONLY before kickoff.
--   * Nothing is backfilled. History starts the day this ships; a match enriched before that
--     simply has no snapshot (that is the honest state, not a gap to fill with today's data).
--   * A snapshot is written only when its content differs from the last one for the match
--     (content_hash), so polling every 6 hours does not duplicate rows.
--   * Missing information is explicit: lineup_known / availability_known are false when the
--     provider returned nothing, which is different from "known: nobody unavailable" ([]).
--   * Post-kickoff data is never recorded here (the writer refuses it; the generated
--     is_pre_kickoff column is a second guard for any future writer).

create table if not exists match_squad_snapshots (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id) on delete restrict,
  captured_at timestamptz not null,
  kickoff_at timestamptz not null,
  is_pre_kickoff boolean generated always as (captured_at < kickoff_at) stored,
  source text not null default 'bsd_lineups',
  -- provider's own state: 'unavailable' (no lineup yet) | 'predicted' | 'confirmed'
  lineup_status text not null check (lineup_status in ('unavailable', 'predicted', 'confirmed')),
  lineup_known boolean not null,
  availability_known boolean not null,
  home_formation text,
  away_formation text,
  home_players jsonb,        -- [{ id, name, position }, ...] or null when unknown
  away_players jsonb,
  home_unavailable jsonb,    -- [{ id, name, status, reason }, ...]; [] = known none; null = unknown
  away_unavailable jsonb,
  provider_updated_at timestamptz,
  content_hash text not null,
  unique (match_id, content_hash),
  check (captured_at < kickoff_at)
);

create index if not exists idx_squad_snapshots_match on match_squad_snapshots (match_id, captured_at desc);

create or replace function match_squad_snapshots_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'match_squad_snapshots is append-only (% blocked)', tg_op;
end;
$$;

drop trigger if exists match_squad_snapshots_no_update on match_squad_snapshots;
create trigger match_squad_snapshots_no_update
  before update or delete on match_squad_snapshots
  for each row execute function match_squad_snapshots_append_only();

drop trigger if exists match_squad_snapshots_no_truncate on match_squad_snapshots;
create trigger match_squad_snapshots_no_truncate
  before truncate on match_squad_snapshots
  for each statement execute function match_squad_snapshots_append_only();
