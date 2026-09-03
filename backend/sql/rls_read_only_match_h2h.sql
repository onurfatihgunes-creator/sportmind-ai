alter table match_h2h enable row level security;
create policy "public read match_h2h" on match_h2h for select using (true);
