/**
 * Computes and stores driver and constructor prices for every ingested round.
 *
 *   npm run prices              every season
 *   npm run prices -- 2026      one season
 *
 * Idempotent: prices upsert on their key, so re-running after a results
 * correction simply rewrites them. Safe to run after every ingestion.
 */

import { populatePrices } from "../src/lib/f1/price-job";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const seasons = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const supabase = createAdminClient();

  const report = await populatePrices(supabase, seasons.length ? seasons : undefined);

  console.log(`Priced ${report.rounds} rounds`);
  console.log(`  driver prices       ${report.driverPrices}`);
  console.log(`  constructor prices  ${report.constructorPrices}`);

  if (report.floorPricedRounds.length) {
    // Expected only for the earliest round in the dataset, which has no prior
    // form to price against. Anywhere else it means a gap in results.
    console.log(`\n  ${report.floorPricedRounds.length} round(s) priced entirely at the floor:`);
    for (const round of report.floorPricedRounds) {
      console.log(`    ${round.season} R${String(round.round).padStart(2, "0")}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
