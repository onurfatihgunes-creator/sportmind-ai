-- V3 Phase A1 + A2 (prepared Nov 2026, NOT yet applied to production).
--
-- Problem this fixes: `predictions` holds one row per match and is overwritten on every
-- pipeline run, with no record of which engine produced it. A past pre-kickoff number is
-- lost the moment it is recomputed, an engine switch is indistinguishable from a real
-- results update, and v1/v2/shadow models cannot be compared on the same matches.
--
-- Design:
--   * `predictions` stays the CURRENT, displayed row (the app and Vera read it unchanged).
--     It gains `model_version` and `input_data_timestamp`.
--   * `prediction_history` is APPEND-ONLY: every distinct calculation is a new row, a row is
--     never updated or deleted (enforced by a trigger, for the service role too).
--   * Existing rows are preserved: the current `predictions` content is copied into
--     history once, as `legacy_snapshot`, with its model version inferred (see below).
--
-- APPLY ORDER (important): run this file, then sql/rls_read_only_prediction_history_and_snapshots.sql,
-- and only THEN deploy the code that writes these columns. The code detects whether the
-- columns/table exist and skips the new writes if they do not, so the reverse order does not
-- break the pipeline — it only means nothing is recorded until the migration is applied.

-- ---- A2: version + data timestamp on the current row ----------------------------------------
alter table predictions add column if not exists model_version text;
alter table predictions add column if not exists input_data_timestamp timestamptz;

-- Infer the version of rows written before this migration. v1 (football) always stored the
-- fixed homeAdvantage prior 62/38; v2 stores the measured one. Basketball has only had v1.
update predictions p
set model_version = case
  when m.sport = 'basketball' then 'basketball-v1'
  when exists (
    select 1 from jsonb_array_elements(p.factors) f
    where f->>'key' = 'homeAdvantage' and (f->>'home')::int = 62 and (f->>'away')::int = 38
  ) then 'football-v1'
  else 'football-v2'
end
from matches m
where m.id = p.match_id and p.model_version is null;

-- ---- A1: immutable history ------------------------------------------------------------------
create table if not exists prediction_history (
  id bigint generated always as identity primary key,
  -- restrict, not cascade: deleting a match must not silently erase its prediction record.
  match_id text not null references matches(id) on delete restrict,
  sport text not null check (sport in ('football', 'basketball')),
  model_version text not null,             -- e.g. 'football-v2', 'basketball-v1', 'basketball-elo-v1'
  prediction_status text not null check (prediction_status in (
    'published',        -- the number shown to users at calculated_at
    'shadow',           -- computed in parallel, never shown (model evaluation)
    'legacy_snapshot'   -- copied from `predictions` when this table was created
  )),
  calculated_at timestamptz not null,
  kickoff_at timestamptz not null,         -- the match's kickoff as known at calculation time
  is_pre_kickoff boolean generated always as (calculated_at < kickoff_at) stored,
  home_probability numeric(6, 5) not null check (home_probability between 0 and 1),
  draw_probability numeric(6, 5) not null check (draw_probability between 0 and 1),
  away_probability numeric(6, 5) not null check (away_probability between 0 and 1),
  -- football: expected goals; basketball: expected points (the shared xg_* convention)
  expected_home_goals numeric(6, 2),
  expected_away_goals numeric(6, 2),
  -- newest piece of input data the calculation could see (e.g. the latest finished match it
  -- trained on). NULL = unknown (legacy rows), never guessed.
  input_data_timestamp timestamptz,
  factors jsonb,
  inserted_at timestamptz not null default now(),
  check (abs(home_probability + draw_probability + away_probability - 1) < 0.0001),
  unique (match_id, model_version, calculated_at)
);

create index if not exists idx_prediction_history_match on prediction_history (match_id, model_version, calculated_at desc);
create index if not exists idx_prediction_history_version on prediction_history (model_version, calculated_at);

create or replace function prediction_history_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'prediction_history is append-only (% blocked)', tg_op;
end;
$$;

drop trigger if exists prediction_history_no_update on prediction_history;
create trigger prediction_history_no_update
  before update or delete on prediction_history
  for each row execute function prediction_history_append_only();

drop trigger if exists prediction_history_no_truncate on prediction_history;
create trigger prediction_history_no_truncate
  before truncate on prediction_history
  for each statement execute function prediction_history_append_only();

-- ---- Preserve what exists today -------------------------------------------------------------
-- One legacy row per current prediction. `is_pre_kickoff` (generated) tells which of these
-- are genuine pre-match numbers: rows recomputed after kickoff before the Nov 2026 fix are
-- kept but flagged false, so evaluation can exclude them without losing them.
insert into prediction_history (
  match_id, sport, model_version, prediction_status, calculated_at, kickoff_at,
  home_probability, draw_probability, away_probability,
  expected_home_goals, expected_away_goals, input_data_timestamp, factors
)
select
  p.match_id, m.sport, p.model_version, 'legacy_snapshot', p.computed_at, m.kickoff_at,
  p.home_win_pct / 100.0, p.draw_pct / 100.0, p.away_win_pct / 100.0,
  p.xg_home, p.xg_away, null, p.factors
from predictions p
join matches m on m.id = p.match_id
where m.sport in ('football', 'basketball')
  and p.home_win_pct + p.draw_pct + p.away_win_pct = 100
on conflict (match_id, model_version, calculated_at) do nothing;

-- Check after applying (expected: equal counts, minus any malformed rows):
--   select count(*) from predictions;
--   select prediction_status, model_version, count(*), sum((not is_pre_kickoff)::int) as post_kickoff
--   from prediction_history group by 1, 2;
