-- Same public-read, no-write policy as rls_read_only.sql, for analysis_changes.
-- Run once in the Supabase SQL editor, after add_analysis_changes.sql.

alter table analysis_changes enable row level security;

create policy "public read analysis_changes" on analysis_changes for select using (true);
