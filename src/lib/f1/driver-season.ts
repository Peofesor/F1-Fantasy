import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRoundFacts } from "./score-job";
import { scoreDriver } from "./scoring";

/**
 * A driver's season, round by round, as this game scores it.
 *
 * Built from the same `loadRoundFacts` + `scoreDriver` path the round scorer
 * uses, rather than from a second, simpler formula. A detail page that showed
 * different numbers from the ones actually awarded would be worse than no
 * detail page: it would look like a scoring bug every time a driver was
 * credited for an overtake or a teammate win.
 */
export interface DriverRoundLine {
  round: number;
  raceName: string;
  /** Grid and finishing positions, null when the driver did not take part. */
  qualifyingPosition: number | null;
  finishPosition: number | null;
  /** Points from qualifying, including reaching Q2/Q3. */
  qualifyingPoints: number;
  /** Everything the race weekend paid: finish, overtakes, sprint, penalties. */
  racePoints: number;
  total: number;
}

export interface DriverSeason {
  driverId: string;
  rounds: DriverRoundLine[];
  seasonPoints: number;
}

/**
 * Scores one driver across every round of a season.
 *
 * Rounds are loaded in parallel because each is an independent set of queries
 * and a sequential pass over twenty-odd weekends is long enough to feel like a
 * hang when it sits behind a tap.
 */
export async function loadDriverSeason(
  supabase: SupabaseClient,
  season: number,
  driverId: string,
): Promise<DriverSeason> {
  const { data: rounds } = await supabase
    .from("rounds")
    .select("round, race_name")
    .eq("season", season)
    .order("round");

  const lines = await Promise.all(
    (rounds ?? []).map(async (round): Promise<DriverRoundLine | null> => {
      const facts = await loadRoundFacts(supabase, season, round.round);
      const input = facts?.drivers.get(driverId);
      if (!input) return null;

      const breakdown = scoreDriver(input);

      return {
        round: round.round,
        raceName: round.race_name,
        qualifyingPosition: input.qualifyingPosition,
        finishPosition: input.finishPosition,
        // Qualifying pays for the slot and for reaching Q2/Q3; everything else
        // belongs to the race weekend.
        qualifyingPoints: breakdown.qualifying + breakdown.qualifyingProgress,
        racePoints: breakdown.total - breakdown.qualifying - breakdown.qualifyingProgress,
        total: breakdown.total,
      };
    }),
  );

  const scored = lines.filter((line): line is DriverRoundLine => line !== null);

  return {
    driverId,
    rounds: scored,
    seasonPoints: scored.reduce((total, line) => total + line.total, 0),
  };
}
