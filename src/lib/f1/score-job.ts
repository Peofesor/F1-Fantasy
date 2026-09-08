import type { SupabaseClient } from "@supabase/supabase-js";

import { rankConstructorsForRace } from "./scoring";
import { resolveDuel, scoreRoster, type RoundFacts } from "./round-scoring";
import { backmarkerPayoutEntry, priceDriftEntries, type LedgerEntry } from "./ledger";
import type { ActiveChips } from "./chips";
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
  ledgerEntries: number;
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
    constructors: [...of("constructor_top"), ...of("constructor_mid")].map((s) => s.constructor_id ?? "").filter(Boolean),
    reverseConstructor: of("constructor_reverse")[0]?.constructor_id ?? null,
    // Captains are columns on the roster, not slots; scoring reads them
    // straight off that row rather than through the selection.
    topCaptainId: null,
    midCaptainId: null,
  };
}

/**
 * Loads a round's price list.
 *
 * Written out per table rather than parameterised: supabase-js parses the
 * select string at the type level, and a template literal defeats that,
 * collapsing the row type to a parser error.
 */
async function loadDriverPrices(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<Map<string, number>> {
  if (round < 1) return new Map();
  const { data } = await supabase
    .from("driver_prices")
    .select("driver_id, price")
    .eq("season", season)
    .eq("round", round);
  return new Map((data ?? []).map((row) => [row.driver_id, Number(row.price)]));
}

async function loadConstructorPrices(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<Map<string, number>> {
  if (round < 1) return new Map();
  const { data } = await supabase
    .from("constructor_prices")
    .select("constructor_id, price")
    .eq("season", season)
    .eq("round", round);
  return new Map((data ?? []).map((row) => [row.constructor_id, Number(row.price)]));
}

/**
 * Marks who beat the other side of their own garage.
 *
 * Only pairs are compared: a team running three drivers across a season still
 * fields two per race, and a one-car entry has nobody to beat. An unclassified
 * driver loses the race comparison to a classified one, and two retirements are
 * settled on classification order — the car that got further finished ahead.
 *
 * Comparisons are left undefined rather than false when there is no valid
 * opponent, so "did not beat a teammate" is never confused with "had none".
 */
function applyTeammateComparisons(
  drivers: Map<string, DriverRaceInput>,
  constructorDrivers: Map<string, string[]>,
  qualifyingByDriver: Map<string, { position: number | null }>,
): void {
  for (const driverIds of constructorDrivers.values()) {
    if (driverIds.length !== 2) continue;

    const [a, b] = driverIds;
    const first = drivers.get(a);
    const second = drivers.get(b);
    if (!first || !second) continue;

    // A null finishing position sorts last, so a classified driver always beats
    // one who is not.
    const rank = (position: number | null) => position ?? Number.MAX_SAFE_INTEGER;

    if (first.finishPosition !== second.finishPosition) {
      const firstAhead = rank(first.finishPosition) < rank(second.finishPosition);
      first.beatTeammateInRace = firstAhead;
      second.beatTeammateInRace = !firstAhead;
    }

    const firstQualifying = qualifyingByDriver.get(a)?.position ?? null;
    const secondQualifying = qualifyingByDriver.get(b)?.position ?? null;

    // Neither is credited if only one of them qualified, since there was no
    // contest to win.
    if (
      firstQualifying !== null &&
      secondQualifying !== null &&
      firstQualifying !== secondQualifying
    ) {
      const firstAhead = firstQualifying < secondQualifying;
      first.beatTeammateInQualifying = firstAhead;
      second.beatTeammateInQualifying = !firstAhead;
    }
  }
}

/** Assembles every fact the scoring engine needs for one round. */
export async function loadRoundFacts(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<RoundFacts | null> {
  const [results, qualifying, overtakes, sprint] = await Promise.all([
    supabase
      .from("race_results")
      .select("driver_id, constructor_id, driver_number, position, grid_position, classification, fastest_lap_rank")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("qualifying_results")
      .select("driver_id, position, set_no_time, highest_session_reached")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("overtakes")
      .select("overtaking_driver_number")
      .eq("season", season)
      .eq("round", round)
      .eq("on_track", true),
    // Absent on most weekends; an empty result means no sprint ran, which is
    // different from a sprint the driver failed to finish.
    supabase
      .from("sprint_results")
      .select("driver_id, position, classification, fastest_lap_rank")
      .eq("season", season)
      .eq("round", round),
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

  const sprintByDriver = new Map((sprint.data ?? []).map((row) => [row.driver_id, row]));

  const drivers = new Map<string, DriverRaceInput>();
  const constructorDrivers = new Map<string, string[]>();

  for (const row of resultRows) {
    const qualifyingRow = qualifyingByDriver.get(row.driver_id);
    const sprintRow = sprintByDriver.get(row.driver_id);

    drivers.set(row.driver_id, {
      driverId: row.driver_id,
      qualifyingPosition: qualifyingRow?.position ?? null,
      qualifyingNoTime: qualifyingRow?.set_no_time ?? false,
      qualifyingReached: qualifyingRow?.highest_session_reached as
        | "Q1"
        | "Q2"
        | "Q3"
        | undefined,
      gridPosition: row.grid_position,
      finishPosition: row.position,
      classification: row.classification as FinishClassification,
      fastestLap: row.fastest_lap_rank === 1,
      // Not available from either upstream source; see spec §11.
      driverOfTheDay: false,
      overtakes: overtakesByNumber.get(row.driver_number) ?? 0,
      sprint: sprintRow
        ? {
            position: sprintRow.position,
            classification: sprintRow.classification as FinishClassification,
            fastestLap: sprintRow.fastest_lap_rank === 1,
          }
        : undefined,
    });

    const existing = constructorDrivers.get(row.constructor_id) ?? [];
    existing.push(row.driver_id);
    constructorDrivers.set(row.constructor_id, existing);
  }

  applyTeammateComparisons(drivers, constructorDrivers, qualifyingByDriver);

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
    .select(
      "id, member_id, top_captain_id, mid_captain_id, roster_slots(slot_type, slot_index, driver_id, constructor_id)",
    )
    .eq("season", season)
    .eq("round", round);

  if (error) throw new Error(`Could not read rosters: ${error.message}`);

  // Prices for this round and the one before, so held value can be drifted.
  const [currentPrices, previousPrices, currentConstructorPrices, previousConstructorPrices] =
    await Promise.all([
      loadDriverPrices(supabase, season, round),
      loadDriverPrices(supabase, season, round - 1),
      loadConstructorPrices(supabase, season, round),
      loadConstructorPrices(supabase, season, round - 1),
    ]);

  // Chips played this round, keyed by member. Loaded once rather than per
  // roster, since a round has few plays and many rosters.
  const { data: chipPlays } = await supabase
    .from("chip_plays")
    .select("member_id, chip_id, target_driver_id, target_constructor_id")
    .eq("season", season)
    .eq("round", round);

  const chipsByMember = new Map<string, ActiveChips>();
  for (const play of chipPlays ?? []) {
    const active = chipsByMember.get(play.member_id) ?? {};
    switch (play.chip_id) {
      case "super_driver": active.superDriverId = play.target_driver_id ?? undefined; break;
      case "autopilot": active.autopilot = true; break;
      case "no_negative": active.noNegative = true; break;
      // final_fix, wildcard and unlimited_cap change what may be picked rather
      // than how it scores, so they do not appear here. Captains are not chips
      // at all — they are read off the roster below.
    }
    chipsByMember.set(play.member_id, active);
  }

  const pointsByMember = new Map<string, number>();
  const scoreRows: { member_id: string; season: number; round: number; points: number; duel_points: number | null }[] = [];
  const ledgerEntries: LedgerEntry[] = [];

  for (const roster of rosters ?? []) {
    const slots = (roster.roster_slots ?? []) as unknown as SlotRow[];
    const selection = selectionFromSlots(slots);

    // Captains live on the roster, so they apply whether or not the member
    // played any chip this round.
    const active: ActiveChips = {
      ...(chipsByMember.get(roster.member_id) ?? {}),
      captainIds: [roster.top_captain_id, roster.mid_captain_id].filter(
        (id): id is string => Boolean(id),
      ),
    };

    const score = scoreRoster(selection, facts, active);
    pointsByMember.set(roster.member_id, score.points);
    scoreRows.push({
      member_id: roster.member_id,
      season,
      round,
      points: score.points,
      // Null until a fixture resolves it. A free-for-all league has no
      // fixtures at all, and a duel league has none before its first scheduled
      // round — neither case is a defeat, and 0 said it was.
      duel_points: null,
    });

    // The backmarker slot pays cost cap instead of scoring (spec §4).
    if (selection.backmarker) {
      const payout = backmarkerPayoutEntry(
        roster.member_id,
        season,
        round,
        score.budget,
        selection.backmarker,
      );
      if (payout) ledgerEntries.push(payout);
    }

    // Value drift on what was held. Only competitors priced in both rounds
    // drift; anything bought or sold is already accounted for by its own entry.
    ledgerEntries.push(
      ...priceDriftEntries(
        roster.member_id,
        season,
        round,
        [...selection.top, ...selection.mid, ...(selection.backmarker ? [selection.backmarker] : [])],
        previousPrices,
        currentPrices,
      ),
      ...priceDriftEntries(
        roster.member_id,
        season,
        round,
        [...selection.constructors, ...(selection.reverseConstructor ? [selection.reverseConstructor] : [])],
        previousConstructorPrices,
        currentConstructorPrices,
      ),
    );
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

  // Ledger entries for this round are replaced rather than appended to, so
  // re-scoring after a correction does not credit a payout twice. Only the
  // reasons this job owns are cleared; purchases and fees written when the
  // roster was picked must survive.
  if (ledgerEntries.length) {
    const memberIds = [...new Set(ledgerEntries.map((entry) => entry.memberId))];
    await supabase
      .from("cost_cap_entries")
      .delete()
      .eq("season", season)
      .eq("round", round)
      .in("member_id", memberIds)
      .in("reason", ["price_change", "backmarker_payout"]);

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
    if (ledgerError) throw new Error(`Could not write ledger: ${ledgerError.message}`);
  }

  return {
    season,
    round,
    rostersScored: rosters?.length ?? 0,
    duelsResolved,
    membersWithoutRoster,
    ledgerEntries: ledgerEntries.length,
  };
}
