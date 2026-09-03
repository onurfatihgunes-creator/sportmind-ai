-- Same public-read, no-write policy as rls_read_only.sql, for the BSD enrichment
-- tables. Run once in the Supabase SQL editor, after add_bsd_enrichment.sql.

alter table match_lineups enable row level security;
alter table player_availability enable row level security;
alter table match_player_stats enable row level security;
alter table match_stats_raw enable row level security;

create policy "public read match_lineups" on match_lineups for select using (true);
create policy "public read player_availability" on player_availability for select using (true);
create policy "public read match_player_stats" on match_player_stats for select using (true);
create policy "public read match_stats_raw" on match_stats_raw for select using (true);
