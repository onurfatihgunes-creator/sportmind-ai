import { fetchFixtures } from './fetchFixtures.js';
import { computePredictions } from './computePredictions.js';

async function main() {
  await fetchFixtures();
  await computePredictions();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
