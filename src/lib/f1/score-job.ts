import type { SupabaseClient } from "@supabase/supabase-js";

import { rankConstructorsForRace } from "./scoring";
import { resolveDuel, scoreRoster, type RoundFacts } from "./round-scoring";
import type { DriverRaceInput } from "./scoring";
import type { FinishClassification } from "./types";
import type { RosterSelection } from "./roster";

/**
 * Scoring a round for every league.
 *
 * Runs after ingestion, so the facts it reads are final. Idempotent: scores
 * upsert on their key, so re-running after a stewards' correction rewrites them
 * rather than doubling up.
 */

export interface ScoreReport {
  season: number;
  round: number;
  rostersScored: number;
  duelsResolved: number;
  membersWithoutRoster: number;
}

interface SlotRow {
  slot_type: string;
  slot_index: number;
  driver_id: string | null;
  constructor_id: string | null;
}

function selectionFromSlots(slots: SlotRow[]): RosterSelection {
  const ordered = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const of = (type: string) => ordered.filter((slot) => slot.slot_type === type);

  return {
    top: of("driver_top").map((s) => s.driver_id ?? "").filter(Boolean),
    mid: of("driver_mid").map((s) => s.driver_id ?? "").filter(Boolean),
    backmarker: of("driver_backmarker")[0]?.driver_id ?? null,
    constructors: of("constructor").map((s) => s.constructor_id ?? "").filter(Boolean),
    reverseConstructor: of("constructor_reverse")[0]?.constructor_id ?? null,
  };
}

/** Assembles every fact the scoring engine needs for one round. */
export async function loadRoundFacts(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<RoundFacts | null> {
  const [results, qualifying, overtakes] = await Promise.all([
    supabase
      .from("race_results")
      .select("driver_id, constructor_id, driver_number, position, grid_position, classification, fastest_lap_rank")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("qualifying_results")
      .select("driver_id, position, set_no_time")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("overtakes")
      .select("overtaking_driver_number")
      .eq("season", season)
      .eq("round", round)
      .eq("on_track", true),
  ]);

  const resultRows = results.data ?? [];
  if (resultRows.length === 0) return null;

  const qualifyingByDriver = new Map(
    (qualifying.data ?? []).map((row) => [row.driver_id, row]),
  );

  const overtakesByNumber = new Map<number, number>();
  for (const row of overtakes.data ?? []) {
    const current = overtakesByNumber.get(row.overtaking_driver_number) ?? 0;
    overtakesByNumber.set(row.overtaking_driver_number, current + 1);
  }

  const drivers = new Map<string, DriverRaceInput>();
  const constructorDrivers = new Map<string, string[]>();

  for (const row of resultRows) {
    const qualifyingRow = qualifyingByDriver.get(row.driver_id);
    drivers.set(row.driver_id, {
      driverId: row.driver_id,
      qualifyingPosition: qualifyingRow?.position ?? null,
      qualifyingNoTime: qualifyingRow?.set_no_time ?? false,
      gridPosition: row.grid_position,
      finishPosition: row.position,
      classification: row.classification as FinishClassification,
      fastestLap: row.fastest_lap_rank === 1,
      // Not available from either upstream source; see spec §11.
      driverOfTheDay: false,
      overtakes: overtakesByNumber.get(row.driver_number) ?? 0,
    });

    const existing = constructorDrivers.get(row.constructor_id) ?? [];
    existing.push(row.driver_id);
    constructorDrivers.set(row.constructor_id, existing);
  }

  const constructorRanking = rankConstructorsForRace(
    [...constructorDrivers.entries()].map(([constructorId, driverIds]) => ({
      constructorId,
      finishes: driverIds.map((driverId) => ({
        position: drivers.get(driverId)?.finishPosition ?? null,
        classification: drivers.get(driverId)?.classification ?? "retired",
      })),
    })),
    resultRows.length,
  );

  return { drivers, constructorDrivers, constructorRanking };
}

export async function scoreRound(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<ScoreReport> {
  const facts = await loadRoundFacts(supabase, season, round);
  if (!facts) {
    throw new Error(`No results ingested for ${season} round ${round}`);
  }

  const { data: rosters, error } = await supabase
    .from("rosters")
    .select("id, member_id, roster_slots(slot_type, slot_index, driver_id, constructor_id)")
    .eq("season", season)
    .eq("round", round);

  if (error) throw new Error(`Could not read rosters: ${error.message}`);

  const pointsByMember = new Map<string, number>();
  const scoreRows: { member_id: string; season: number; round: number; points: number; duel_points: number }[] = [];

  for (const roster of rosters ?? []) {
    const slots = (roster.roster_slots ?? []) as unknown as SlotRow[];
    const score = scoreRoster(selectionFromSlots(slots), facts);
    pointsByMember.set(roster.member_id, score.points);
    scoreRows.push({
      member_id: roster.member_id,
      season,
      round,
      points: score.points,
      duel_points: 0,
    });
  }

  // Duel resolution. Free-for-all leagues have no fixtures, so this is a no-op
  // for them and they rank on cumulative points instead.
  const { data: fixtures } = await supabase
    .from("duel_fixtures")
    .select("home_member_id, away_member_id")
    .eq("season", season)
    .eq("round", round);

  let duelsResolved = 0;
  let membersWithoutRoster = 0;

  for (const fixture of fixtures ?? []) {
    const outcome = resolveDuel(
      fixture.home_member_id,
      fixture.away_member_id,
      pointsByMember,
    );
    duelsResolved++;

    for (const [memberId, points, duelPoints] of [
      [outcome.homeMemberId, outcome.homePoints, outcome.homeDuelPoints],
      [outcome.awayMemberId, outcome.awayPoints, outcome.awayDuelPoints],
    ] as const) {
      const existing = scoreRows.find((row) => row.member_id === memberId);
      if (existing) {
        existing.duel_points = duelPoints;
      } else {
        // Fielded no roster: still gets a row, so the standings show the zero
        // rather than the member silently vanishing from that round.
        membersWithoutRoster++;
        scoreRows.push({ member_id: memberId, season, round, points, duel_points: duelPoints });
      }
    }
  }

  if (scoreRows.length) {
    const { error: writeError } = await supabase
      .from("round_scores")
      .upsert(scoreRows, { onConflict: "member_id,season,round" });
    if (writeError) throw new Error(`Could not write scores: ${writeError.message}`);
  }

  return {
    season,
    round,
    rostersScored: rosters?.length ?? 0,
    duelsResolved,
    membersWithoutRoster,
  };
}
