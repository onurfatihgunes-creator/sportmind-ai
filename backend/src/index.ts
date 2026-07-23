import { env } from './config.js';
import { fetchFixtures } from './fetchFixtures.js';
import { computePredictions } from './computePredictions.js';
import { fetchBasketballFixtures } from './fetchBasketballFixtures.js';
import { computeBasketballPredictions } from './computeBasketballPredictions.js';
import { fetchTurkishFixtures } from './fetchTurkishFixtures.js';

async function main() {
  await fetchFixtures();

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

  await computePredictions();

  if (env.balldontlieApiKey) {
    await fetchBasketballFixtures();
    await computeBasketballPredictions();
  } else {
    console.log('Skipping basketball sync — BALLDONTLIE_API_KEY not set.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
