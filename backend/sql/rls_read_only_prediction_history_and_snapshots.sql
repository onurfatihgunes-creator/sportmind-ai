-- Run after add_prediction_history.sql and add_match_squad_snapshots.sql.
-- Same convention as the other rls_read_only_*.sql files: the app's anon key can read,
-- only the backend's service role can write (and the append-only triggers still apply to it).

alter table prediction_history enable row level security;
alter table match_squad_snapshots enable row level security;

create policy "public read prediction_history" on prediction_history for select using (true);
create policy "public read match_squad_snapshots" on match_squad_snapshots for select using (true);
