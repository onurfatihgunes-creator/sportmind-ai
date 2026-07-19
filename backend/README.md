# SportMind AI backend

Fetches fixtures/results from football-data.org (football), api-football/api-sports.io
(Süper Lig), and balldontlie.io (NBA basketball), computes match predictions, and stores
everything in Supabase. Runs on a schedule via GitHub Actions — see
`../.github/workflows/data-pipeline.yml`. No paid infra required at this scale.

## One-time setup (you need to do this — accounts can't be created on your behalf)

1. **Supabase** — create a free project at supabase.com. In the SQL editor, run, in order:
   `sql/schema.sql`, `sql/rls_read_only.sql`, `sql/add_sport_column.sql`. Copy the project
   URL and the `service_role` key (Settings → API).
2. **football-data.org** — register for a free API key at football-data.org/client/register.
3. **balldontlie.io** (optional, adds NBA basketball) — create a free account at
   balldontlie.io and copy your API key. Leave this secret unset to skip basketball entirely
   — the football sync runs fine without it.
4. **api-football / api-sports.io** (optional, adds Süper Lig) — create a free account at
   api-sports.io (or dashboard.api-football.com) and copy your API key. Free tier: 100
   requests/day, no card required. Leave this secret unset to skip Süper Lig entirely.
5. **GitHub secrets** — in this repo's Settings → Secrets and variables → Actions, add:
   - `FOOTBALL_DATA_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BALLDONTLIE_API_KEY` (optional)
   - `API_FOOTBALL_KEY` (optional)

Once the required secrets are set, the `data-pipeline.yml` workflow runs automatically
every 6 hours (and can be triggered manually from the Actions tab).

## Running locally

```
cp .env.example .env   # fill in the values above
npm install
npm run run
```

## What it does

- `src/fetchFixtures.ts` — pulls football fixtures/results for the 6 confirmed competitions
  (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League), for the next
  `ACTIVE_WINDOW_DAYS` days plus the last `FORM_LOOKBACK_DAYS` days (to keep recent form
  current).
- `src/computePredictions.ts` — a transparent statistical formula (recent form + goal
  averages + a fixed home-advantage prior), **not yet a trained ML model** — there isn't
  enough historical result data synced to train one yet. Once a few months of results have
  accumulated in `matches`/`team_form`, this should be replaced with a model trained
  offline on that data, keeping the same output shape (`outcomes`, `factors`, `xg*`).
- `src/fetchBasketballFixtures.ts` / `src/computeBasketballPredictions.ts` — the same shape
  applied to NBA games from balldontlie.io. No draw outcome (`draw_pct` is always 0), and
  `xg_home`/`xg_away`/`recent_avg_goals_*` hold points, not goals. Team/match ids are
  prefixed `bdl-` so they can't collide with football-data.org's numeric ids in the shared
  `teams`/`matches` tables.
- `src/fetchTurkishFixtures.ts` — Süper Lig fixtures from api-football, tagged
  `sport: 'football'` like everything else, so they flow through the regular
  `computePredictions()` pass with no separate compute step. Ids are prefixed `apif-`. The
  league id is resolved by name at runtime (via `/leagues?search=Super Lig`) rather than
  hardcoded, and a sync failure here is caught and logged rather than failing the whole
  pipeline, since this integration is newer/less proven than the other two.

## Known limitations of the free data tier

- **Football (football-data.org, api-football)**: neither free plan includes lineups,
  injuries, or possession stats, so the `injuries`, `possession`, and `historicalTrends`
  factors the mobile app's mock data shows are not computed here — `recentForm`,
  `expectedGoals`, `defensivePerformance`, and `homeAdvantage` are real.
- **Basketball (balldontlie.io)**: free tier is rate-limited to 5 requests/min, so
  `fetchBasketballFixtures.ts` pauses ~13s between paginated calls — a full sync can take a
  few minutes. Only NBA is covered; there's no equally solid free source yet for
  international basketball leagues or tennis (see project notes).
- **Süper Lig (api-football)**: free tier is capped at 100 requests/day total — comfortably
  enough for a 6-hourly sync of one league, but leaves little room to add more leagues on
  the same key without upgrading.

Adding the missing football factors requires either a richer (paid) data source or bespoke
scrapers, which is out of scope for the $0 plan.
