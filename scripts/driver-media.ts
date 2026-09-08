/**
 * Fetches driver portraits and team colours from OpenF1.
 *
 *   npm run driver-media            current season
 *   npm run driver-media -- 2026    a specific season
 *
 * Run after ingestion; the roster picker uses these to show a face per slot.
 */

import { ingestDriverMedia } from "../src/lib/f1/driver-media-job";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? new Date().getUTCFullYear());
  const report = await ingestDriverMedia(createAdminClient(), season);

  console.log(`${report.season}: session ${report.sessionKey ?? "none"}`);
  console.log(`  drivers updated: ${report.matched}`);
  if (report.unmatched.length) {
    console.log(`  car numbers with no ingested results: ${report.unmatched.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
