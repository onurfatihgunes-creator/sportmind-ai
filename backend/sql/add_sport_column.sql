-- Adds multi-sport support: teams/matches are tagged with which sport they belong to,
-- so the same tables can hold football (football-data.org) and basketball (balldontlie.io)
-- rows without id collisions or ambiguity. Existing rows default to 'football'.
-- Run this once in the Supabase SQL editor, after schema.sql and rls_read_only.sql.

alter table teams add column if not exists sport text not null default 'football'
  check (sport in ('football', 'basketball'));

alter table matches add column if not exists sport text not null default 'football'
  check (sport in ('football', 'basketball'));
