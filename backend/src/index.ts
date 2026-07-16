import { env } from './config.js';
import { fetchFixtures } from './fetchFixtures.js';
import { computePredictions } from './computePredictions.js';
import { fetchBasketballFixtures } from './fetchBasketballFixtures.js';
import { computeBasketballPredictions } from './computeBasketballPredictions.js';

async function main() {
  await fetchFixtures();
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
