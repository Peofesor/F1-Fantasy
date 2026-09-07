/**
 * Prints row counts and coverage for the ingested F1 tables.
 *
 *   npm run db:status
 *
 * Useful for confirming a backfill landed what it claimed, and for spotting
 * rounds that ingested results but no OpenF1 data.
 */

import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

const TABLES = [
  "raw_payloads",
  "drivers",
  "constructors",
  "rounds",
  "qualifying_results",
  "race_results",
  "driver_standings",
  "constructor_standings",
  "pit_stops",
  "overtakes",
  "safety_car_events",
];

async function main(): Promise<void> {
  const supabase = createAdminClient();

  console.log("Row counts");
  for (const table of TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });
    console.log(`  ${table.padEnd(24)} ${error ? `ERROR ${error.message}` : count}`);
  }

  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("season, round, race_name, openf1_session_key")
    .order("season")
    .order("round");

  if (error || !rounds) {
    console.log(`\nCould not read rounds: ${error?.message}`);
    return;
  }

  const bySeason = new Map<number, { total: number; withOpenF1: number }>();
  for (const round of rounds) {
    const entry = bySeason.get(round.season) ?? { total: 0, withOpenF1: 0 };
    entry.total++;
    if (round.openf1_session_key !== null) entry.withOpenF1++;
    bySeason.set(round.season, entry);
  }

  console.log("\nRounds ingested by season (OpenF1-linked / total)");
  for (const [season, entry] of [...bySeason.entries()].sort((a, b) => a[0] - b[0])) {
    const gap = entry.total - entry.withOpenF1;
    console.log(
      `  ${season}  ${String(entry.withOpenF1).padStart(2)}/${String(entry.total).padStart(2)}${
        gap ? `   ${gap} round(s) without OpenF1 data` : ""
      }`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
