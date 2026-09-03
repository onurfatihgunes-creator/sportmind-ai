alter table bsd_players enable row level security;
create policy "public read bsd_players" on bsd_players for select using (true);
