import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import * as jolpica from "./jolpica/client";
import * as openf1 from "./openf1/client";
import {
  toConstructorStandings,
  toDriverStandings,
  toPitStops,
  toQualifyingEntries,
  toRaceResults,
} from "./jolpica/transform";
import {
  excludePitDrivenOvertakes,
  findSessionForRaceDate,
  toOpenF1PitStops,
  toOvertakes,
  toSafetyCarEvents,
} from "./openf1/transform";
import type { JolpicaRace } from "./jolpica/schemas";

/**
 * Ingestion for a single race weekend.
 *
 * Idempotent by design: re-running a round is expected, because results get
 * amended after stewards' decisions. Keyed tables are upserted; the three
 * tables with no natural key (pit_stops, overtakes, safety_car_events) are
 * cleared for the round and reinserted.
 */

export interface IngestReport {
  season: number;
  round: number;
  raceName: string;
  openF1SessionKey: number | null;
  counts: Record<string, number>;
  warnings: string[];
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function storeRaw(
  supabase: SupabaseClient,
  source: "jolpica" | "openf1",
  endpoint: string,
  params: Record<string, string | number>,
  payload: unknown,
): Promise<void> {
  // The unique index covers (source, endpoint, params, content_hash), so an
  // unchanged re-fetch collides and is ignored rather than piling up rows.
  const { error } = await supabase.from("raw_payloads").upsert(
    {
      source,
      endpoint,
      params,
      payload,
      content_hash: hashPayload(payload),
    },
    { onConflict: "source,endpoint,params,content_hash", ignoreDuplicates: true },
  );

  if (error) throw new Error(`Failed to store raw payload for ${endpoint}: ${error.message}`);
}

function assertOk(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

interface JolpicaDriverRecord {
  driverId: string;
  givenName: string;
  familyName: string;
  code?: string;
  permanentNumber?: string;
  nationality: string;
}

interface JolpicaConstructorRecord {
  constructorId: string;
  name: string;
  nationality: string;
}

/**
 * Upserts drivers and constructors, which are foreign-key targets for every
 * other table here and so must land first.
 *
 * Called with participants from *both* results and standings: a season's
 * standings legitimately contain drivers who did not start a given round
 * (someone replaced mid-season still holds the points they scored), so seeding
 * only from race results leaves standings inserts failing on the foreign key.
 */
async function upsertParticipants(
  supabase: SupabaseClient,
  drivers: JolpicaDriverRecord[],
  constructors: JolpicaConstructorRecord[],
): Promise<void> {
  if (drivers.length) {
    const rows = new Map(
      drivers.map((driver) => [
        driver.driverId,
        {
          driver_id: driver.driverId,
          given_name: driver.givenName,
          family_name: driver.familyName,
          code: driver.code ?? null,
          permanent_number: driver.permanentNumber ? Number(driver.permanentNumber) : null,
          nationality: driver.nationality,
        },
      ]),
    );
    assertOk(
      (await supabase.from("drivers").upsert([...rows.values()], { onConflict: "driver_id" }))
        .error,
      "Failed to upsert drivers",
    );
  }

  if (constructors.length) {
    const rows = new Map(
      constructors.map((constructor) => [
        constructor.constructorId,
        {
          constructor_id: constructor.constructorId,
          name: constructor.name,
          nationality: constructor.nationality,
        },
      ]),
    );
    assertOk(
      (
        await supabase
          .from("constructors")
          .upsert([...rows.values()], { onConflict: "constructor_id" })
      ).error,
      "Failed to upsert constructors",
    );
  }
}

/** One fetch of a season's race sessions serves every round in that season. */
const sessionsBySeason = new Map<number, Awaited<ReturnType<typeof openf1.getRaceSessions>>>();

/**
 * Resolves the OpenF1 session for a round by race date.
 *
 * Matching on date rather than country is deliberate. The two APIs disagree on
 * country names -- jolpica says "UAE", "UK", "USA" where OpenF1 says "United
 * Arab Emirates", "United Kingdom", "United States" -- which silently cost 17
 * rounds their overtake and safety-car data on the first backfill. Race dates
 * are unambiguous and need no mapping table, and no two Grands Prix share one.
 */
async function resolveOpenF1Session(
  race: JolpicaRace,
  season: number,
): Promise<{ sessionKey: number | null; warning?: string }> {
  if (season < 2023) {
    return { sessionKey: null, warning: "OpenF1 has no data before 2023" };
  }

  let sessions = sessionsBySeason.get(season);
  if (!sessions) {
    sessions = await openf1.getRaceSessions(season);
    sessionsBySeason.set(season, sessions);
  }

  const session = findSessionForRaceDate(sessions, race.date);

  if (!session) {
    return {
      sessionKey: null,
      warning: `No OpenF1 race session dated ${race.date} (${race.Circuit.Location.country})`,
    };
  }

  return { sessionKey: session.session_key };
}

export async function ingestRound(
  supabase: SupabaseClient,
  season: number,
  round: number,
): Promise<IngestReport> {
  const counts: Record<string, number> = {};
  const warnings: string[] = [];

  const resultsResponse = await jolpica.getRaceResults(season, round);
  const race = resultsResponse?.MRData.RaceTable.Races[0];

  if (!race?.Results?.length) {
    throw new Error(`No published results for ${season} round ${round}`);
  }

  await storeRaw(supabase, "jolpica", "results", { season, round }, resultsResponse);
  await upsertParticipants(
    supabase,
    race.Results.map((result) => result.Driver),
    race.Results.map((result) => result.Constructor),
  );

  const { sessionKey, warning } = await resolveOpenF1Session(race, season);
  if (warning) warnings.push(warning);

  assertOk(
    (
      await supabase.from("rounds").upsert(
        {
          season,
          round,
          race_name: race.raceName,
          circuit_id: race.Circuit.circuitId,
          circuit_name: race.Circuit.circuitName,
          country: race.Circuit.Location.country,
          locality: race.Circuit.Location.locality,
          race_date: race.date,
          race_time: race.time ? race.time.replace("Z", "") : null,
          openf1_session_key: sessionKey,
        },
        { onConflict: "season,round" },
      )
    ).error,
    "Failed to upsert round",
  );

  // --- Race results -------------------------------------------------------
  const numberByDriver = new Map(
    race.Results.map((result) => [result.Driver.driverId, Number(result.number)]),
  );

  const raceResults = toRaceResults(race.Results).map((entry) => ({
    season,
    round,
    driver_id: entry.driverId,
    constructor_id: entry.constructorId,
    driver_number: numberByDriver.get(entry.driverId) ?? 0,
    position: entry.position,
    grid_position: entry.gridPosition,
    points: entry.points,
    status: entry.status,
    classification: entry.classification,
    fastest_lap_rank: entry.fastestLapRank,
  }));

  assertOk(
    (await supabase.from("race_results").upsert(raceResults, { onConflict: "season,round,driver_id" }))
      .error,
    "Failed to upsert race results",
  );
  counts.race_results = raceResults.length;

  // --- Qualifying ---------------------------------------------------------
  const qualifyingResponse = await jolpica.getQualifying(season, round);
  const qualifyingRows = qualifyingResponse?.MRData.RaceTable.Races[0]?.QualifyingResults;

  if (qualifyingRows?.length) {
    await storeRaw(supabase, "jolpica", "qualifying", { season, round }, qualifyingResponse);
    const entries = toQualifyingEntries(qualifyingRows).map((entry) => ({
      season,
      round,
      driver_id: entry.driverId,
      constructor_id: entry.constructorId,
      position: entry.position,
      q1: entry.q1,
      q2: entry.q2,
      q3: entry.q3,
      highest_session_reached: entry.highestSessionReached,
      set_no_time: entry.setNoTime,
    }));
    assertOk(
      (
        await supabase
          .from("qualifying_results")
          .upsert(entries, { onConflict: "season,round,driver_id" })
      ).error,
      "Failed to upsert qualifying results",
    );
    counts.qualifying_results = entries.length;
  } else {
    warnings.push("No qualifying data published");
  }

  // --- Standings ----------------------------------------------------------
  const driverStandingsResponse = await jolpica.getDriverStandings(season, round);
  await storeRaw(
    supabase,
    "jolpica",
    "driverstandings",
    { season, round },
    driverStandingsResponse,
  );
  const driverStandingRows =
    driverStandingsResponse.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];

  if (driverStandingRows.length) {
    // Standings can name drivers absent from this round's results.
    await upsertParticipants(
      supabase,
      driverStandingRows.map((standing) => standing.Driver),
      driverStandingRows.flatMap((standing) => standing.Constructors),
    );

    const rows = toDriverStandings(driverStandingRows).map((entry) => ({
      season,
      round,
      driver_id: entry.driverId as string,
      constructor_id: entry.constructorId,
      position: entry.position,
      points: entry.points,
      wins: entry.wins,
    }));
    assertOk(
      (
        await supabase
          .from("driver_standings")
          .upsert(rows, { onConflict: "season,round,driver_id" })
      ).error,
      "Failed to upsert driver standings",
    );
    counts.driver_standings = rows.length;
  }

  const constructorStandingsResponse = await jolpica.getConstructorStandings(season, round);
  await storeRaw(
    supabase,
    "jolpica",
    "constructorstandings",
    { season, round },
    constructorStandingsResponse,
  );
  const constructorStandingRows =
    constructorStandingsResponse.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ??
    [];

  if (constructorStandingRows.length) {
    await upsertParticipants(
      supabase,
      [],
      constructorStandingRows.map((standing) => standing.Constructor),
    );

    const rows = toConstructorStandings(constructorStandingRows).map((entry) => ({
      season,
      round,
      constructor_id: entry.constructorId,
      position: entry.position,
      points: entry.points,
      wins: entry.wins,
    }));
    assertOk(
      (
        await supabase
          .from("constructor_standings")
          .upsert(rows, { onConflict: "season,round,constructor_id" })
      ).error,
      "Failed to upsert constructor standings",
    );
    counts.constructor_standings = rows.length;
  }

  // --- Pit stops ----------------------------------------------------------
  // No natural key, so the round is cleared before reinserting.
  assertOk(
    (await supabase.from("pit_stops").delete().eq("season", season).eq("round", round)).error,
    "Failed to clear pit stops",
  );

  const pitStopsResponse = await jolpica.getPitStops(season, round);
  const pitStopRows = pitStopsResponse?.MRData.RaceTable.Races[0]?.PitStops;

  if (pitStopRows?.length) {
    await storeRaw(supabase, "jolpica", "pitstops", { season, round }, pitStopsResponse);
    const rows = toPitStops(pitStopRows).map((stop) => ({
      season,
      round,
      driver_id: stop.driverId,
      driver_number: null,
      lap: stop.lap,
      occurred_at: null,
      pit_lane_seconds: stop.pitLaneSeconds,
      source: "jolpica" as const,
    }));
    assertOk(
      (await supabase.from("pit_stops").insert(rows)).error,
      "Failed to insert pit stops",
    );
    counts.pit_stops = rows.length;
  }

  // --- OpenF1-only data ---------------------------------------------------
  assertOk(
    (await supabase.from("overtakes").delete().eq("season", season).eq("round", round)).error,
    "Failed to clear overtakes",
  );
  assertOk(
    (await supabase.from("safety_car_events").delete().eq("season", season).eq("round", round))
      .error,
    "Failed to clear safety car events",
  );

  if (sessionKey !== null) {
    const safetyCarRaw = await openf1.getSafetyCarMessages(sessionKey);
    await storeRaw(supabase, "openf1", "race_control", { session_key: sessionKey }, safetyCarRaw);
    const safetyCarEvents = toSafetyCarEvents(safetyCarRaw);

    if (safetyCarEvents.length) {
      assertOk(
        (
          await supabase.from("safety_car_events").insert(
            safetyCarEvents.map((event) => ({
              season,
              round,
              lap: event.lap,
              occurred_at: event.at.toISOString(),
              message: event.message,
              virtual: event.virtual,
            })),
          )
        ).error,
        "Failed to insert safety car events",
      );
    }
    counts.safety_car_events = safetyCarEvents.length;

    const openF1PitRaw = await openf1.getPitStops(sessionKey);
    await storeRaw(supabase, "openf1", "pit", { session_key: sessionKey }, openF1PitRaw);
    const openF1Stops = toOpenF1PitStops(openF1PitRaw);

    const overtakeRaw = await openf1.getOvertakes(sessionKey);
    await storeRaw(supabase, "openf1", "overtakes", { session_key: sessionKey }, overtakeRaw);

    const allOvertakes = toOvertakes(overtakeRaw);
    // Identity-based: `filter` returns the same object references, so this is
    // exact. Keying on driver+timestamp would collide when one driver is
    // recorded passing two cars in the same millisecond.
    const onTrack = new Set(excludePitDrivenOvertakes(allOvertakes, openF1Stops));

    if (allOvertakes.length) {
      // Both on-track and pit-driven passes are stored, so the settlement rule
      // can be revised later against races already ingested.
      assertOk(
        (
          await supabase.from("overtakes").insert(
            allOvertakes.map((overtake) => ({
              season,
              round,
              overtaking_driver_number: overtake.overtakingDriverNumber,
              overtaken_driver_number: overtake.overtakenDriverNumber,
              occurred_at: overtake.at.toISOString(),
              position: overtake.position,
              on_track: onTrack.has(overtake),
            })),
          )
        ).error,
        "Failed to insert overtakes",
      );
    }
    counts.overtakes = allOvertakes.length;
    counts.overtakes_on_track = onTrack.size;
  }

  return {
    season,
    round,
    raceName: race.raceName,
    openF1SessionKey: sessionKey,
    counts,
    warnings,
  };
}

/** Rounds in a season that already have published results. */
export async function completedRounds(season: number): Promise<number[]> {
  const pages = await jolpica.getSeasonSchedule(season);
  const races = pages.flatMap((page) => page.MRData.RaceTable.Races);
  const today = new Date().toISOString().slice(0, 10);
  return races
    .filter((race) => race.date <= today)
    .map((race) => Number(race.round))
    .sort((a, b) => a - b);
}
