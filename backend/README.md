# SportMind AI backend

Fetches fixtures/results from football-data.org (top-5 European leagues + Champions
League), the free-api-live-football-data RapidAPI listing (Süper Lig), and balldontlie.io
(NBA basketball); enriches football matches with BSD/Bzzoiro Sports Data (lineups, player
availability, player stats, raw match stats, head-to-head history, player market value);
computes match predictions; runs a deterministic Analysis Engine and Change Intelligence
layer on top; and stores everything in Supabase. A small HTTP service
(`src/service/`) exposes the result to Vera/OnurAI over `GET /analysis?team=`. Runs on a
schedule via GitHub Actions — see `../.github/workflows/data-pipeline.yml`. No paid infra
required at this scale.

## One-time setup (you need to do this — accounts can't be created on your behalf)

1. **Supabase** — create a free project at supabase.com. In the SQL editor, run, **in this
   exact order** (each depends on the ones before it):
   1. `sql/schema.sql`
   2. `sql/rls_read_only.sql`
   3. `sql/add_sport_column.sql`
   4. `sql/add_bsd_enrichment.sql`
   5. `sql/rls_read_only_bsd_enrichment.sql`
   6. `sql/add_analysis_changes.sql`
   7. `sql/rls_read_only_analysis_changes.sql`
   8. `sql/add_match_h2h.sql`
   9. `sql/rls_read_only_match_h2h.sql`
   10. `sql/add_player_market_value.sql`
   11. `sql/rls_read_only_bsd_players.sql`
   12. `sql/widen_predictions_xg_precision.sql` — fixes a real production crash (basketball
       point totals overflow the football-sized `xg_home`/`xg_away` columns; see that
       file's own comment for the exact incident).

   Skipping 4–12 doesn't break the core pipeline (fixtures/predictions still work), but BSD
   enrichment, H2H, player market value, and Change Intelligence will each silently produce
   no data, and basketball predictions will crash with a numeric overflow error the moment
   any NBA team's average score reaches 100. Copy the project URL and the `service_role` key
   (Settings → API) once done.
2. **football-data.org** — register for a free API key at football-data.org/client/register.
3. **balldontlie.io** (optional, adds NBA basketball) — create a free account at
   balldontlie.io and copy your API key. Leave this secret unset to skip basketball entirely
   — the football sync runs fine without it.
4. **RapidAPI — "Free API Live Football Data"** (optional, adds Süper Lig) — create a free
   RapidAPI account, subscribe to the free tier of the "Free API Live Football Data"
   listing (host `free-api-live-football-data.p.rapidapi.com`), and copy your `X-RapidAPI-Key`
   from the endpoint's Code Snippets tab. Unlike api-football's free tier (which blocks any
   season outside 2022–2024), this provider serves the current season. Leave this secret
   unset to skip Süper Lig entirely.
5. **BSD / Bzzoiro Sports Data** (optional, adds enrichment) — create an account at
   sports.bzzoiro.com and copy your API token. Leave unset to skip lineups, player
   availability, player stats, H2H, and market value entirely — fixtures and predictions are
   unaffected either way, since BSD is enrichment-only and never a fixture source.
6. **GitHub secrets** — in this repo's Settings → Secrets and variables → Actions, add:
   - `FOOTBALL_DATA_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BALLDONTLIE_API_KEY` (optional)
   - `RAPIDAPI_FOOTBALL_KEY` (optional)
   - `BSD_API_TOKEN` (optional)
7. **Vera/OnurAI integration** (optional, only needed if another app talks to this
   service) — generate a random bearer token yourself (e.g. `openssl rand -hex 32`) and set
   it as `SPORTMIND_SERVICE_TOKEN` in this repo's `.env` **and** in the consuming app's own
   config under the same name — this is a shared secret you create, not one issued by a
   provider. See `src/service/server.ts`'s own doc comment.

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
- `src/fetchTurkishFixtures.ts` — Süper Lig fixtures from the free-api-live-football-data
  RapidAPI listing, tagged `sport: 'football'` like everything else, so they flow through
  the regular `computePredictions()` pass with no separate compute step. Ids are prefixed
  `ffld-`. The provider returns the whole season in one call (no per-request season
  parameter, and no season-based lockout like api-football's free tier has), so this filters
  client-side to the active + lookback window. A sync failure here is caught and logged
  rather than failing the whole pipeline, since this integration is newer/less proven than
  the other two.
- `src/bsdEnrichment.ts` — attaches lineups, player availability (real names, injury/
  suspension/doubtful status), player stats, raw match stats, head-to-head history, and
  player market value to matches the providers above already created. Never creates a
  `matches` row itself — BSD is enrichment-only, matched to an existing fixture by
  competition + kickoff date + both team names. Also detects and logs real state
  transitions (a player becoming unavailable, a lineup being confirmed) into
  `analysis_changes` — never on a match's first-ever enrichment pass, since there's no
  real "previous" state to compare against yet.
- `src/analysisEngine.ts` — a deterministic, DB-free FACTS → SIGNALS → IMPACT →
  EXPLANATION layer on top of the prediction above (form/attack/defence/possession/
  home-advantage/H2H/squad signals, a data-quality confidence score kept explicitly
  separate from the prediction's own outcome probability, and key-factor ranking). Never
  recomputes or overrides a prediction percentage — it only explains the data behind one.
- `src/service/` — a minimal HTTP service (`GET /analysis?team=`, bearer-token
  authenticated) exposing the combined prediction + Analysis Engine + Change Intelligence
  output to external callers (Vera/OnurAI). Reads only this project's own Supabase; never
  calls any provider live at request time.

## Known limitations of the free data tier

- **Football (football-data.org, free-api-live-football-data)**: neither free plan includes
  lineups, injuries, or possession stats on its own — BSD enrichment (above) now supplies
  real lineups/availability/H2H/player-stats for the matches it can confidently match, but
  coverage is naturally partial (not every match gets a BSD hit), and BSD's own raw
  match-stats endpoint's field shape isn't documented by BSD itself, so it's stored as an
  opaque JSON blob rather than promoted into typed columns.
- **Basketball (balldontlie.io)**: free tier is rate-limited to 5 requests/min, so
  `fetchBasketballFixtures.ts` pauses ~13s between paginated calls — a full sync can take a
  few minutes. Only NBA is covered; there's no equally solid free source yet for
  international basketball leagues or tennis (see project notes).
- **Süper Lig (free-api-live-football-data)**: an independent/smaller RapidAPI provider
  (not an official data vendor), so its uptime and rate limits are less proven than
  football-data.org's or balldontlie.io's — that's why a sync failure here is caught and
  logged rather than failing the whole pipeline. It does not have api-football's
  2022–2024-only season restriction.
- **H2H**: BSD's own head-to-head endpoint, cached for 7 days per match (history between
  two specific teams barely changes run to run). Only ever surfaced as a secondary,
  damped signal — never the primary driver of a prediction or a key factor.
- **Player market value**: cached for 30 days per player, resolved only for players
  actually flagged unavailable in a real match (never a league-wide backfill). Used only
  as one input toward "is this genuinely a key player" impact weighting — market value is
  not treated as a claim about a player's on-field performance.

Adding fuller coverage (e.g. every match getting lineups/H2H, not just BSD's matched
subset) would require a richer (paid) data source, which is out of scope for the $0 plan.
