import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketId } from "./betting";
import type { MarketRecord } from "./bet-odds";

/**
 * How often each selection has produced each market's outcome.
 *
 * Read from ingested results rather than kept as a running counter, so a
 * corrected result changes the price the same way it changes the score. Two
 * seasons is enough to be stable without pricing a driver on a car they no
 * longer drive.
 */
export type MarketHistory = Map<MarketId, Map<string, MarketRecord>>;

function record(history: MarketHistory, market: MarketId, selection: string, won: boolean): void {
  if (!history.has(market)) history.set(market, new Map());
  const bySelection = history.get(market)!;
  const current = bySelection.get(selection) ?? { won: 0, total: 0 };
  current.total += 1;
  if (won) current.won += 1;
  bySelection.set(selection, current);
}

export async function loadMarketHistory(
  supabase: SupabaseClient,
  season: number,
): Promise<MarketHistory> {
  const seasons = [season - 1, season];
  const history: MarketHistory = new Map();

  const [races, quali, sprints] = await Promise.all([
    supabase
      .from("race_results")
      .select("season, round, driver_id, constructor_id, position, classification, fastest_lap_rank")
      .in("season", seasons),
    supabase
      .from("qualifying_results")
      .select("driver_id, highest_session_reached")
      .in("season", seasons),
    supabase.from("sprint_results").select("driver_id, position").in("season", seasons),
  ]);

  const finishedByRound = new Map<string, { driverId: string; position: number | null }[]>();

  for (const row of races.data ?? []) {
    const position = row.position;
    const classified = row.classification === "finished" || row.classification === "classified";

    record(history, "race_winner", row.driver_id, position === 1);
    record(history, "podium", row.driver_id, position !== null && position <= 3);
    record(history, "top_six", row.driver_id, position !== null && position <= 6);
    record(history, "top_ten", row.driver_id, position !== null && position <= 10);
    record(history, "fastest_lap", row.driver_id, row.fastest_lap_rank === 1);
    record(history, "dnf", row.driver_id, !classified);

    const key = `${row.season}:${row.round}`;
    finishedByRound.set(key, [
      ...(finishedByRound.get(key) ?? []),
      { driverId: row.driver_id, position },
    ]);
  }

  for (const row of quali.data ?? []) {
    const reached = row.highest_session_reached;
    record(history, "reached_q3", row.driver_id, reached === "Q3");
    record(history, "reached_q2", row.driver_id, reached === "Q2" || reached === "Q3");
    record(history, "eliminated_q1", row.driver_id, reached === "Q1");
  }

  for (const row of sprints.data ?? []) {
    record(history, "sprint_winner", row.driver_id, row.position === 1);
    record(history, "sprint_points", row.driver_id, row.position !== null && row.position <= 8);
  }

  return history;
}
