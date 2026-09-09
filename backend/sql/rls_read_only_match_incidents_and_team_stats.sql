-- Same public-read, no-write policy as rls_read_only_bsd_enrichment.sql, for the two
-- new tables in add_match_incidents_and_team_stats.sql. Run once in the Supabase SQL
-- editor, after that migration — the original migration file did not itself include
-- this (an omission relative to every sibling BSD enrichment table, all of which have
-- their own matching rls_read_only_*.sql), caught in this follow-up audit.

alter table match_incidents enable row level security;
alter table team_match_stats enable row level security;

create policy "public read match_incidents" on match_incidents for select using (true);
create policy "public read team_match_stats" on team_match_stats for select using (true);
