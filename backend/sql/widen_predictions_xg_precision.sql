-- Fixes a real overflow: predictions.xg_home/xg_away/recent_avg_goals_home/
-- recent_avg_goals_away are numeric(3,1) (max absolute value 99.9), sized for
-- football goals (typically 0-9). Basketball's computeBasketballPredictions.ts
-- writes real NBA point totals into these same shared columns (xgHome/xgAway =
-- average points scored, recentAvgGoalsHome/Away = avgPointsFor) — NBA teams
-- routinely score 100-150 points, which mathematically cannot fit in
-- numeric(3,1). Confirmed live (GitHub Actions run #209): "numeric field
-- overflow ... precision 3, scale 1 must round to an absolute value less
-- than 10^2" immediately after "924 NBA games synced".
--
-- Widening to numeric(5,1) (max absolute value 9999.9) is a lossless,
-- strictly-widening type change for every existing row — football's xG
-- values (0.1-4.0 range) are unaffected, no data is altered or lost. Safe to
-- run against the live table; does not require downtime or a rewrite beyond
-- Postgres's own (fast, in-place for this widening direction) ALTER COLUMN.

alter table predictions alter column xg_home type numeric(5,1);
alter table predictions alter column xg_away type numeric(5,1);
alter table predictions alter column recent_avg_goals_home type numeric(5,1);
alter table predictions alter column recent_avg_goals_away type numeric(5,1);
