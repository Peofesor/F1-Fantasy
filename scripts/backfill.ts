/**
 * Backfills whole seasons into Supabase.
 *
 *   npm run backfill              2023 to the current season (the OpenF1 overlap)
 *   npm run backfill -- 2026      a single season
 *   npm run backfill -- 2023 2024 an inclusive range
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

async function main(): Promise<void> {
  const currentSeason = new Date().getFullYear();
  const from = Number(process.argv[2] ?? EARLIEST_SEASON);
  const to = Number(process.argv[3] ?? process.argv[2] ?? currentSeason);

  const supabase = createAdminClient();
  const failures: string[] = [];
  let ingested = 0;

  console.log(`Backfilling seasons ${from}-${to}`);

  for (let season = from; season <= to; season++) {
    const rounds = await completedRounds(season);
    console.log(`\n${season}: ${rounds.length} completed rounds`);

    for (const round of rounds) {
      const label = `${season} R${String(round).padStart(2, "0")}`;
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

  console.log(`\nIngested ${ingested} rounds, ${failures.length} failed.`);
  for (const failure of failures) console.log(`  ${failure}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
