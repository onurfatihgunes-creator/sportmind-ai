# SportMind AI backend

Fetches fixtures/results from football-data.org, computes match predictions, and stores
everything in Supabase. Runs on a schedule via GitHub Actions — see
`../.github/workflows/data-pipeline.yml`. No paid infra required at this scale.

## One-time setup (you need to do this — accounts can't be created on your behalf)

1. **Supabase** — create a free project at supabase.com. In the SQL editor, run
   `sql/schema.sql`. Copy the project URL and the `service_role` key (Settings → API).
2. **football-data.org** — register for a free API key at football-data.org/client/register.
3. **GitHub secrets** — in this repo's Settings → Secrets and variables → Actions, add:
   - `FOOTBALL_DATA_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

Once those three secrets are set, the `data-pipeline.yml` workflow runs automatically every
6 hours (and can be triggered manually from the Actions tab).

## Running locally

```
cp .env.example .env   # fill in the three values above
npm install
npm run run
```

## What it does

- `src/fetchFixtures.ts` — pulls fixtures/results for the 6 confirmed competitions
  (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League), for the next
  7 days plus the last ~45 days (to keep recent form current).
- `src/computePredictions.ts` — a transparent statistical formula (recent form + goal
  averages + a fixed home-advantage prior), **not yet a trained ML model** — there isn't
  enough historical result data synced to train one yet. Once a few months of results have
  accumulated in `matches`/`team_form`, this should be replaced with a model trained
  offline on that data, keeping the same output shape (`outcomes`, `factors`, `xg*`).

## Known limitations of the free data tier

football-data.org's free plan does not include lineups, injuries, or possession stats, so
the `injuries`, `possession`, `defensivePerformance`, and `historicalTrends` factors the
mobile app's mock data shows are not yet computed here — only `recentForm`,
`expectedGoals`, and `homeAdvantage` are real. Adding the rest requires either a richer
(paid) data source or building bespoke scrapers, which is out of scope for the $0 plan.
