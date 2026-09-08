import { env } from './config.js';
import { fetchFixtures } from './fetchFixtures.js';
import { computePredictions } from './computePredictions.js';
import { fetchBasketballFixtures } from './fetchBasketballFixtures.js';
import { computeBasketballPredictions } from './computeBasketballPredictions.js';
import { fetchTurkishFixtures } from './fetchTurkishFixtures.js';
import { fetchBsdFixtureLeagues } from './fetchBsdFixtures.js';
import { enrichWithBsd } from './bsdEnrichment.js';

async function main() {
  // Isolated like every other stage below — this used to be the one unguarded call in
  // the whole pipeline: if football-data.org threw here, Süper Lig sync, predictions,
  // BSD enrichment and basketball never ran at all that pass, even though none of them
  // actually depend on it succeeding.
  try {
    await fetchFixtures();
  } catch (error) {
    console.error('football-data.org sync failed, continuing:', error);
  }

  if (env.rapidApiFootballKey) {
    // Newer, less-proven integration — a hiccup here shouldn't fail the whole run when
    // football-data.org's sync above already succeeded.
    try {
      await fetchTurkishFixtures();
    } catch (error) {
      console.error('Süper Lig sync failed, continuing:', error);
    }
  } else {
    console.log('Skipping Süper Lig sync — RAPIDAPI_FOOTBALL_KEY not set.');
  }

  if (env.bsdApiToken) {
    // BSD as a primary fixture source for BSD_FIXTURE_LEAGUES (config.ts) — separate
    // from the enrichment pass further down, and isolated the same way: a failure here
    // must never block predictions/enrichment/basketball.
    try {
      await fetchBsdFixtureLeagues();
    } catch (error) {
      console.error('BSD fixture leagues sync failed, continuing:', error);
    }
  } else {
    console.log('Skipping BSD fixture leagues — BSD_API_TOKEN not set.');
  }

  await computePredictions();

  if (env.bsdApiToken) {
    // Enrichment only — never fails the run. A BSD outage must never affect
    // the fixture/prediction pipeline that already succeeded above.
    try {
      await enrichWithBsd();
    } catch (error) {
      console.error('BSD enrichment failed, continuing:', error);
    }
  } else {
    console.log('Skipping BSD enrichment — BSD_API_TOKEN not set.');
  }

  if (env.balldontlieApiKey) {
    // balldontlie.io throws on any non-2xx response (auth/rate-limit/quota) with no
    // retry — isolated so an NBA-side outage can never take down football ingestion,
    // which already succeeded above.
    try {
      await fetchBasketballFixtures();
      await computeBasketballPredictions();
    } catch (error) {
      console.error('Basketball sync failed, continuing:', error);
    }
  } else {
    console.log('Skipping basketball sync — BALLDONTLIE_API_KEY not set.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
