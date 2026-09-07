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

  // Every race has pit stops, and jolpica always publishes them, so a round
  // with none means ingestion left it incomplete rather than the data not
  // existing. Overtakes are deliberately not checked this way: OpenF1's
  // coverage is genuinely patchy, so zero there is often legitimate.
  const incomplete: string[] = [];
  for (const round of rounds) {
    const { count } = await supabase
      .from("pit_stops")
      .select("*", { count: "exact", head: true })
      .eq("season", round.season)
      .eq("round", round.round);
    if ((count ?? 0) === 0) {
      incomplete.push(`${round.season} R${String(round.round).padStart(2, "0")} ${round.race_name}`);
    }
  }

  if (incomplete.length === 0) {
    console.log("\nIntegrity: every round has pit stop data.");
  } else {
    console.log(`\nIntegrity: ${incomplete.length} round(s) missing pit stops — re-ingest these:`);
    for (const round of incomplete) console.log(`  ${round}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
