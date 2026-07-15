-- Locks the tables down for the mobile app's anon/public key: read-only, no writes.
-- The backend pipeline uses the service_role key, which bypasses RLS entirely, so this
-- has no effect on GitHub Actions — only on requests made with the anon/public key.
-- Run this once in the Supabase SQL editor, after schema.sql.

alter table teams enable row level security;
alter table team_form enable row level security;
alter table matches enable row level security;
alter table predictions enable row level security;
alter table prediction_changes enable row level security;

create policy "public read teams" on teams for select using (true);
create policy "public read team_form" on team_form for select using (true);
create policy "public read matches" on matches for select using (true);
create policy "public read predictions" on predictions for select using (true);
create policy "public read prediction_changes" on prediction_changes for select using (true);
