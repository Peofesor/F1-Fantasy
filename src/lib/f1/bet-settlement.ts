import type { SupabaseClient } from "@supabase/supabase-js";

import { settle, type BetTiming, type MarketId, type SettlementFacts } from "./betting";
import { fastestPitStop, toPitStops } from "./jolpica/transform";
import type { LedgerEntry } from "./ledger";

/**
 * Bet settlement.
 *
 * Runs after ingestion, against facts already stored. Settlement is
 * deterministic, so re-running after a stewards' correction produces the right
 * answer rather than compounding the old one — already-settled bets are left
 * alone unless explicitly re-opened.
 */

export interface SettlementReport {
  season: number;
  round: number;
  settled: number;
  won: number;
  lost: number;
  void: number;
  paidOut: number;
}

/** Gathers everything the markets settle against, all of it already ingested. */
export async function loadSettlementFacts(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<SettlementFacts | null> {
  const [results, qualifying, pitStops, overtakes, safetyCar, drivers] = await Promise.all([
    supabase
      .from("race_results")
      .select("driver_id, constructor_id, driver_number, position, classification, fastest_lap_rank")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("qualifying_results")
      .select("driver_id, highest_session_reached")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("pit_stops")
      .select("driver_id, pit_lane_seconds")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("overtakes")
      .select("overtaking_driver_number")
      .eq("season", season)
      .eq("round", round)
      .eq("on_track", true),
    supabase.from("safety_car_events").select("message").eq("season", season).eq("round", round),
    supabase.from("drivers").select("driver_id, nationality"),
  ]);

  const resultRows = results.data ?? [];
  if (resultRows.length === 0) return null;

  const finishPositions = new Map(resultRows.map((row) => [row.driver_id, row.position]));
  const classifications = new Map(resultRows.map((row) => [row.driver_id, row.classification]));

  const winner = resultRows.find((row) => row.position === 1);
  const nationalities = new Map(
    (drivers.data ?? []).map((row) => [row.driver_id, row.nationality]),
  );

  // The fastest pit stop settles on pit-lane time, the house definition
  // recorded in the spec: stationary time is not published by either source.
  const stops = toPitStops(
    (pitStops.data ?? []).map((row) => ({
      driverId: row.driver_id ?? "",
      lap: "0",
      stop: "1",
      time: "",
      duration: String(row.pit_lane_seconds),
    })),
  );
  const quickest = fastestPitStop(stops);
  const constructorByDriver = new Map(
    resultRows.map((row) => [row.driver_id, row.constructor_id]),
  );

  const overtakeCounts = new Map<number, number>();
  for (const row of overtakes.data ?? []) {
    overtakeCounts.set(
      row.overtaking_driver_number,
      (overtakeCounts.get(row.overtaking_driver_number) ?? 0) + 1,
    );
  }
  const driverByNumber = new Map(resultRows.map((row) => [row.driver_number, row.driver_id]));
  const topOvertaker = [...overtakeCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    finishPositions,
    classifications,
    fastestLapDriverId:
      resultRows.find((row) => row.fastest_lap_rank === 1)?.driver_id ?? null,
    qualifyingReached: new Map(
      (qualifying.data ?? []).map((row) => [
        row.driver_id,
        row.highest_session_reached as "Q1" | "Q2" | "Q3",
      ]),
    ),
    fastestPitStopConstructorId: quickest?.driverId
      ? (constructorByDriver.get(quickest.driverId) ?? null)
      : null,
    winnerNationality: winner ? (nationalities.get(winner.driver_id) ?? null) : null,
    mostOvertakesDriverId: topOvertaker ? (driverByNumber.get(topOvertaker[0]) ?? null) : null,
    safetyCarDeployed: (safetyCar.data ?? []).some((event) => /DEPLOYED/i.test(event.message)),
    // Lap-one leader has no ingested source yet, so that market always voids
    // and refunds rather than settling wrongly. See spec §8.
    lapOneLeaderDriverId: null,
  };
}

export async function settleRound(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<SettlementReport> {
  const facts = await loadSettlementFacts(supabase, season, round);
  if (!facts) throw new Error(`No results ingested for ${season} round ${round}`);

  const { data: bets, error } = await supabase
    .from("bets")
    .select("id, member_id, market_id, selection, stake, timing")
    .eq("season", season)
    .eq("round", round)
    .is("outcome", null);

  if (error) throw new Error(`Could not read bets: ${error.message}`);

  const report: SettlementReport = {
    season,
    round,
    settled: 0,
    won: 0,
    lost: 0,
    void: 0,
    paidOut: 0,
  };

  const ledgerEntries: LedgerEntry[] = [];

  for (const bet of bets ?? []) {
    const result = settle(
      bet.market_id as MarketId,
      bet.selection,
      Number(bet.stake),
      bet.timing as BetTiming,
      facts,
    );

    const { error: updateError } = await supabase
      .from("bets")
      .update({
        outcome: result.outcome,
        returned: result.returned,
        settled_at: new Date().toISOString(),
      })
      .eq("id", bet.id);

    if (updateError) throw new Error(`Could not settle bet ${bet.id}: ${updateError.message}`);

    report.settled++;
    report[result.outcome]++;

    if (result.returned > 0) {
      report.paidOut += result.returned;
      ledgerEntries.push({
        memberId: bet.member_id,
        season,
        round,
        amount: result.returned,
        reason: "bet_payout",
        note: `${bet.market_id} · ${bet.selection} · ${result.outcome}`,
      });
    }
  }

  if (ledgerEntries.length) {
    const { error: ledgerError } = await supabase.from("cost_cap_entries").insert(
      ledgerEntries.map((entry) => ({
        member_id: entry.memberId,
        season: entry.season,
        round: entry.round,
        amount: entry.amount,
        reason: entry.reason,
        note: entry.note ?? null,
      })),
    );
    if (ledgerError) throw new Error(`Could not write payouts: ${ledgerError.message}`);
  }

  report.paidOut = Math.round(report.paidOut * 10) / 10;
  return report;
}
