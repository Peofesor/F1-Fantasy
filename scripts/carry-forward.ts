/**
 * Carries each member's roster into the next open round.
 *
 *   npm run carry-forward            current season
 *   npm run carry-forward -- 2026    a specific season
 *
 * Runs daily after the calendar is ingested. A team persists until its owner
 * changes it, so a member who never opens the app fields the side they already
 * had rather than scoring zero.
 */

import { carryForwardRosters } from "../src/lib/f1/carry-forward";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? new Date().getUTCFullYear());
  const report = await carryForwardRosters(createAdminClient(), season);

  if (report.round === 0) {
    console.log(`${season}: no round to carry into.`);
    return;
  }

  console.log(`${season} R${report.round}: ${report.created} roster(s) carried forward`);
  console.log(`  already had one: ${report.skipped}`);

  if (report.autoSwapped.length) {
    // A driver who left their bracket is replaced without the member acting.
    console.log(`  auto-swapped ${report.autoSwapped.length}:`);
    for (const swap of report.autoSwapped) {
      console.log(`    ${swap.out} → ${swap.in}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
