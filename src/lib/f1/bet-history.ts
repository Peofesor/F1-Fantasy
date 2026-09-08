import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketId } from "./betting";
import { recencyWeight, type MarketRecord } from "./bet-odds";

/**
 * How often each selection has produced each market's outcome.
 *
 * Read from ingested results rather than kept as a running counter, so a
 * corrected result changes the price the same way it changes the score.
 *
 * Every attempt is weighted by how recent it was. A flat two-season count
 * priced a driver on a career rather than on current form: Antonelli made the
 * points in 11 of 13 rounds in 2026 and 14 of 24 as a rookie the year before,
 * and the flat 68% offered odds on a driver who no longer exists.
 */
export type MarketHistory = Map<MarketId, Map<string, MarketRecord>>;

interface Attempt {
  season: number;
  round: number;
  selection: string;
  won: boolean;
}

export async function loadMarketHistory(
  supabase: SupabaseClient,
  season: number,
): Promise<MarketHistory> {
  const seasons = [season - 1, season];

  const [races, quali, sprints, rounds] = await Promise.all([
    supabase
      .from("race_results")
      .select("season, round, driver_id, position, classification, fastest_lap_rank")
      .in("season", seasons),
    supabase
      .from("qualifying_results")
      .select("season, round, driver_id, highest_session_reached")
      .in("season", seasons),
    supabase.from("sprint_results").select("season, round, driver_id, position").in("season", seasons),
    supabase.from("rounds").select("season, round").in("season", seasons).order("season").order("round"),
  ]);

  // Race weekends in order, so "how many races ago" is a position in that list
  // rather than a difference between round numbers that reset each season.
  const order = new Map<string, number>();
  (rounds.data ?? []).forEach((row, index) => order.set(`${row.season}:${row.round}`, index));

  // Aged against the last round that actually ran, not the last one on the
  // calendar. Counting from a race still months away pushed every real result
  // further into the past and flattened the weighting it exists to create.
  const raced = (races.data ?? [])
    .map((row) => order.get(`${row.season}:${row.round}`))
    .filter((index): index is number => index !== undefined);
  const latest = raced.length ? Math.max(...raced) : 0;

  const attempts: Partial<Record<MarketId, Attempt[]>> = {};
  const push = (market: MarketId, attempt: Attempt) => {
    (attempts[market] ??= []).push(attempt);
  };

  for (const row of races.data ?? []) {
    const at = { season: row.season, round: row.round, selection: row.driver_id };
    const position = row.position;
    const classified = row.classification === "finished" || row.classification === "classified";

    push("race_winner", { ...at, won: position === 1 });
    push("podium", { ...at, won: position !== null && position <= 3 });
    push("top_six", { ...at, won: position !== null && position <= 6 });
    push("top_ten", { ...at, won: position !== null && position <= 10 });
    push("fastest_lap", { ...at, won: row.fastest_lap_rank === 1 });
    push("dnf", { ...at, won: !classified });
  }

  for (const row of quali.data ?? []) {
    const at = { season: row.season, round: row.round, selection: row.driver_id };
    const reached = row.highest_session_reached;
    push("reached_q3", { ...at, won: reached === "Q3" });
    push("reached_q2", { ...at, won: reached === "Q2" || reached === "Q3" });
    push("eliminated_q1", { ...at, won: reached === "Q1" });
  }

  for (const row of sprints.data ?? []) {
    const at = { season: row.season, round: row.round, selection: row.driver_id };
    push("sprint_winner", { ...at, won: row.position === 1 });
    push("sprint_points", { ...at, won: row.position !== null && row.position <= 8 });
  }

  const history: MarketHistory = new Map();
  for (const [market, list] of Object.entries(attempts) as [MarketId, Attempt[]][]) {
    const bySelection = new Map<string, MarketRecord>();
    for (const attempt of list) {
      const index = order.get(`${attempt.season}:${attempt.round}`);
      // A result from a round the calendar does not list cannot be aged, so it
      // is treated as current rather than dropped.
      const weight = recencyWeight(index === undefined ? 0 : latest - index);

      const current = bySelection.get(attempt.selection) ?? { won: 0, total: 0 };
      current.total += weight;
      if (attempt.won) current.won += weight;
      bySelection.set(attempt.selection, current);
    }
    history.set(market, bySelection);
  }

  return history;
}
