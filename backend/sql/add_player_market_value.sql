-- Safe, minimal path to performance-weighted player impact (MASTER PROMPT PHASE 3 §5).
-- BSD's /players/{id}/ detail endpoint (confirmed live, 2026-09-03: id=510 -> John
-- McGinn, Aston Villa, market_value_eur=12600000) resolves a real name + an objective,
-- provider-sourced market value for a numeric player id — used only as an "is this
-- genuinely a key player" signal, never to rename anything (player_availability already
-- has real names from BSD's lineups endpoint).
--
-- bsd_players is a CACHE, not a live table: populated lazily, one row per player id
-- actually seen unavailable in a real match, refreshed only when stale (see
-- bsdEnrichment.ts's resolvePlayerMarketValue) — never a bulk backfill, to respect
-- BSD's request budget (§12).

create table if not exists bsd_players (
  id bigint primary key,
  name text not null,
  position text,
  current_team_id bigint,
  market_value_eur bigint,
  updated_at timestamptz not null default now()
);

-- Links an unavailable-player row back to BSD's numeric player id (already present in
-- BSD's lineups response as BsdUnavailablePlayer.id, just not persisted before now) so
-- it can be joined against bsd_players. Nullable — BSD returns id: null for a small
-- minority of entries, and that stays capped-medium impact same as always.
alter table player_availability add column if not exists bsd_player_id bigint;
