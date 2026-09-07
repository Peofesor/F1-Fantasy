/**
 * Backfills whole seasons into Supabase.
 *
 *   npm run backfill              2023 to the current season (the OpenF1 overlap)
 *   npm run backfill -- 2026      a single season
 *   npm run backfill -- 2023 2024 an inclusive range
 *   npm run backfill -- 2023 2026 --force   re-ingest rounds already stored
 *
 * Rounds already present are skipped unless --force is given. That is not just
 * a speed optimisation: jolpica allows 500 requests an hour and each round costs
 * about six, so re-ingesting what is already stored can exhaust the budget
 * before reaching the rounds that are actually missing.
 *
 * Rate limits, not latency, are the bottleneck: jolpica allows 500 requests an
 * hour and OpenF1 only 30 a minute, and the clients serialise every call to stay
 * under those. A full season therefore takes minutes, not seconds. Failures on
 * one round are reported and skipped rather than aborting the run, so a single
 * bad round doesn't waste the requests already spent.
 */

import { completedRounds, ingestRound } from "../src/lib/f1/ingest";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

/** OpenF1 holds nothing earlier; jolpica goes back to 1950 but we can't pair it. */
const EARLIEST_SEASON = 2023;

/** (season, round) pairs already ingested, as "season:round" keys. */
async function existingRounds(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Set<string>> {
  const { data, error } = await supabase.from("rounds").select("season, round");
  if (error) throw new Error(`Could not read existing rounds: ${error.message}`);
  return new Set((data ?? []).map((row) => `${row.season}:${row.round}`));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const positional = args.filter((arg) => !arg.startsWith("--"));

  const currentSeason = new Date().getFullYear();
  const from = Number(positional[0] ?? EARLIEST_SEASON);
  const to = Number(positional[1] ?? positional[0] ?? currentSeason);

  const supabase = createAdminClient();
  const alreadyStored = force ? new Set<string>() : await existingRounds(supabase);
  const failures: string[] = [];
  let ingested = 0;
  let skipped = 0;

  console.log(
    `Backfilling seasons ${from}-${to}${force ? " (forcing re-ingest)" : ` (${alreadyStored.size} rounds already stored will be skipped)`}`,
  );

  for (let season = from; season <= to; season++) {
    const rounds = await completedRounds(season);
    console.log(`\n${season}: ${rounds.length} completed rounds`);

    for (const round of rounds) {
      const label = `${season} R${String(round).padStart(2, "0")}`;

      if (alreadyStored.has(`${season}:${round}`)) {
        skipped++;
        continue;
      }
      try {
        const report = await ingestRound(supabase, season, round);
        const summary = [
          `results ${report.counts.race_results ?? 0}`,
          `quali ${report.counts.qualifying_results ?? 0}`,
          `pits ${report.counts.pit_stops ?? 0}`,
          `overtakes ${report.counts.overtakes_on_track ?? 0}/${report.counts.overtakes ?? 0}`,
        ].join("  ");
        console.log(`  ${label}  ${report.raceName.padEnd(26)} ${summary}`);
        for (const warning of report.warnings) {
          console.log(`         warning: ${warning}`);
        }
        ingested++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  ${label}  FAILED: ${message}`);
        failures.push(`${label}: ${message}`);
      }
    }
  }

  console.log(
    `\nIngested ${ingested} rounds, skipped ${skipped} already stored, ${failures.length} failed.`,
  );
  // Only the first line of each message: a Zod failure serialises to a long
  // multi-line JSON blob that buries every other failure in the summary.
  for (const failure of failures) {
    console.log(`  ${failure.split("\n")[0]}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
