/**
 * Backfills qualifying times onto already-ingested rounds.
 *
 *   npm run session-times            every season present
 *   npm run session-times -- 2026    one season
 *
 * Qualifying is the roster lock deadline (spec §4), and rounds ingested before
 * that field existed have it null. One request per season fetches the whole
 * calendar, which is far cheaper than re-ingesting every round against
 * jolpica's 500/hour budget.
 */

import { getSeasonSchedule } from "../src/lib/f1/jolpica/client";
import { sessionInstant } from "../src/lib/f1/ingest";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const supabase = createAdminClient();
  const requested = process.argv.slice(2).map(Number).filter(Number.isFinite);

  const { data: rows, error } = await supabase.from("rounds").select("season");
  if (error) throw new Error(error.message);

  const seasons = requested.length
    ? requested
    : [...new Set((rows ?? []).map((row) => row.season))].sort();

  let updated = 0;
  let missing = 0;

  for (const season of seasons) {
    const pages = await getSeasonSchedule(season);
    const races = pages.flatMap((page) => page.MRData.RaceTable.Races);

    for (const race of races) {
      const qualifyingAt = sessionInstant(race.Qualifying);
      if (!qualifyingAt) {
        missing++;
        continue;
      }

      // `select` so the count reflects rounds actually updated. A calendar
      // entry we have not ingested yet matches nothing, and counting those as
      // updates would overstate coverage.
      const { data: changed, error: updateError } = await supabase
        .from("rounds")
        .update({ qualifying_at: qualifyingAt })
        .eq("season", season)
        .eq("round", Number(race.round))
        .select("round");

      if (updateError) {
        console.log(`  ${season} R${race.round}: ${updateError.message}`);
        continue;
      }
      updated += changed?.length ?? 0;
    }

    console.log(`${season}: ${races.length} races in calendar`);
  }

  console.log(`\nUpdated ${updated} rounds with a qualifying time.`);
  if (missing) {
    // Older seasons predate session times in the upstream data; those rounds
    // fall back to locking at the race start.
    console.log(`${missing} race(s) had no qualifying time published.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
