/**
 * Scores rosters for a round.
 *
 *   npm run score -- 2026 13    a specific round
 *   npm run score -- 2026       every ingested round of a season
 *
 * Idempotent: scores upsert on their key, so re-running after a stewards'
 * correction rewrites them. Safe to run after every ingestion.
 */

import { scoreRound } from "../src/lib/f1/score-job";
import { settleRound } from "../src/lib/f1/bet-settlement";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? new Date().getUTCFullYear());
  const explicitRound = Number(process.argv[3]);

  const supabase = createAdminClient();

  let rounds: number[];
  if (Number.isFinite(explicitRound)) {
    rounds = [explicitRound];
  } else {
    const { data } = await supabase
      .from("rounds")
      .select("round")
      .eq("season", season)
      .order("round");
    rounds = (data ?? []).map((row) => row.round);
  }

  if (rounds.length === 0) {
    console.log(`No ingested rounds for ${season}.`);
    return;
  }

  let scored = 0;
  for (const round of rounds) {
    try {
      const report = await scoreRound(supabase, season, round);
      if (report.rostersScored || report.duelsResolved) {
        console.log(
          `${season} R${String(round).padStart(2, "0")}  rosters ${report.rostersScored}  duels ${report.duelsResolved}` +
            (report.membersWithoutRoster ? `  no-roster ${report.membersWithoutRoster}` : ""),
        );
      }
      const bets = await settleRound(supabase, season, round);
      if (bets.settled) {
        console.log(`      bets: ${bets.settled} settled (${bets.won} won, ${bets.lost} lost, ${bets.void} void), paid ${bets.paidOut}`);
      }
      scored++;
    } catch (error) {
      console.log(
        `${season} R${String(round).padStart(2, "0")}  FAILED: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log(`\nProcessed ${scored} of ${rounds.length} rounds.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
