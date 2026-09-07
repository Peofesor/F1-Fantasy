/**
 * Ingests a season's race calendar, results or not.
 *
 *   npm run calendar              current season
 *   npm run calendar -- 2026      a specific season
 *
 * Results ingestion only stores rounds that have already been run, so without
 * this the database holds nothing to pick for. Run it once per season, and
 * again if the calendar changes.
 */

import { ingestCalendar } from "../src/lib/f1/calendar-job";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? new Date().getUTCFullYear());
  const supabase = createAdminClient();

  const report = await ingestCalendar(supabase, season);

  console.log(`${report.season}: ${report.rounds} rounds in the calendar`);
  console.log(`  still to come: ${report.upcoming}`);

  if (report.nextRound) {
    console.log(
      `  next: R${report.nextRound.round} ${report.nextRound.raceName} — locks ${report.nextRound.qualifyingAt}`,
    );
  } else {
    console.log("  the season is over; nothing left to pick for.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
