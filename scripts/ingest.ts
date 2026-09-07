/**
 * Ingests a single race weekend into Supabase.
 *
 *   npm run ingest -- 2026 13     ingest a specific round
 *   npm run ingest -- 2026        ingest the latest completed round of a season
 *
 * Safe to re-run: keyed tables upsert, and the three keyless tables are cleared
 * for the round before reinserting.
 */

import { completedRounds, ingestRound } from "../src/lib/f1/ingest";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? new Date().getFullYear());
  const supabase = createAdminClient();

  let round = Number(process.argv[3]);
  if (!Number.isFinite(round)) {
    const rounds = await completedRounds(season);
    if (rounds.length === 0) {
      console.log(`No completed rounds in ${season} yet.`);
      return;
    }
    round = rounds[rounds.length - 1];
    console.log(`No round given; using latest completed round: ${round}`);
  }

  const report = await ingestRound(supabase, season, round);

  console.log(`\n${report.raceName} (${report.season} round ${report.round})`);
  console.log(`OpenF1 session: ${report.openF1SessionKey ?? "none"}`);
  for (const [table, count] of Object.entries(report.counts)) {
    console.log(`  ${table.padEnd(22)} ${count}`);
  }
  for (const warning of report.warnings) {
    console.log(`  warning: ${warning}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
