import type {
  FinishClassification,
  LapTiming,
  PitStop,
  QualifyingEntry,
  QualifyingSession,
  RaceResultEntry,
  StandingEntry,
} from "../types";
import type {
  JolpicaConstructorStanding,
  JolpicaDriverStanding,
  JolpicaLap,
  JolpicaPitStop,
  JolpicaQualifyingResult,
  JolpicaRaceResult,
} from "./schemas";

/**
 * Pure transforms from jolpica's wire format into domain types.
 *
 * Nothing here performs I/O, so all of it is testable against captured
 * fixtures without touching the network or a database.
 */

/** Upstream sends "" for a session a driver entered but set no time in. */
function lapTimeOrNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Determines how far into qualifying a driver got.
 *
 * Presence of a *time* is the signal, since a driver can be classified into Q3
 * yet fail to set a lap. That case is rare but real (a crash in Q2 that ends the
 * weekend), and treating it as "reached Q3" would wrongly award progression
 * points, so the furthest session with an actual time wins.
 */
export function highestSessionReached(
  entry: Pick<JolpicaQualifyingResult, "Q1" | "Q2" | "Q3">,
): QualifyingSession {
  if (lapTimeOrNull(entry.Q3) !== null) return "Q3";
  if (lapTimeOrNull(entry.Q2) !== null) return "Q2";
  return "Q1";
}

export function toQualifyingEntries(
  results: JolpicaQualifyingResult[],
): QualifyingEntry[] {
  return results.map((result) => {
    const q1 = lapTimeOrNull(result.Q1);
    const q2 = lapTimeOrNull(result.Q2);
    const q3 = lapTimeOrNull(result.Q3);

    return {
      driverId: result.Driver.driverId,
      constructorId: result.Constructor.constructorId,
      position: Number(result.position),
      q1,
      q2,
      q3,
      highestSessionReached: highestSessionReached(result),
      setNoTime: q1 === null && q2 === null && q3 === null,
    };
  });
}

/**
 * Maps jolpica's result rows onto a small classification set.
 *
 * `positionText` is a controlled vocabulary ("R", "D", "W", "F", "N" or a
 * number) and so is preferred over `status`, which is free text with dozens of
 * mechanical causes ("Gearbox", "Collision damage", ...). `status` is only
 * consulted to separate a clean finish from a lapped one.
 */
export function classifyFinish(
  positionText: string,
  status: string,
): FinishClassification {
  switch (positionText) {
    case "D":
      return "disqualified";
    case "W":
    case "F":
      return "did-not-start";
    case "R":
    case "N":
      return "retired";
  }

  if (status === "Did not start") return "did-not-start";
  if (status === "Disqualified") return "disqualified";
  // "+1 Lap", "+3 Laps", ... all mean classified but lapped.
  if (/^\+\d+ Lap/.test(status)) return "lapped";
  if (status === "Finished") return "finished";

  // Anything else is a mechanical or incident status ("Gearbox", "Collision",
  // "+2 Laps" having already been handled): the car stopped.
  return "retired";
}

export function toRaceResults(results: JolpicaRaceResult[]): RaceResultEntry[] {
  return results.map((result) => {
    const position = Number(result.position);
    const classification = classifyFinish(result.positionText, result.status);
    const rank = result.FastestLap?.rank;

    return {
      driverId: result.Driver.driverId,
      constructorId: result.Constructor.constructorId,
      position: Number.isFinite(position) && position > 0 ? position : null,
      // jolpica reports 0 for a pit-lane start.
      gridPosition: Number(result.grid),
      points: Number(result.points),
      status: result.status,
      classification,
      fastestLapRank: rank !== undefined && rank !== "" ? Number(rank) : null,
    };
  });
}

/** Absent for anyone on zero points, who is unranked rather than joint-last. */
function standingPosition(position: string | undefined): number | null {
  if (position === undefined || position.trim() === "") return null;
  const parsed = Number(position);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toDriverStandings(
  standings: JolpicaDriverStanding[],
): StandingEntry[] {
  return standings.map((standing) => ({
    driverId: standing.Driver.driverId,
    // A mid-season switch would leave several; the current entry is last.
    constructorId:
      standing.Constructors[standing.Constructors.length - 1]?.constructorId ??
      "",
    position: standingPosition(standing.position),
    points: Number(standing.points),
    wins: Number(standing.wins),
  }));
}

export function toConstructorStandings(
  standings: JolpicaConstructorStanding[],
): StandingEntry[] {
  return standings.map((standing) => ({
    driverId: null,
    constructorId: standing.Constructor.constructorId,
    position: standingPosition(standing.position),
    points: Number(standing.points),
    wins: Number(standing.wins),
  }));
}

/**
 * Parses a pit-stop duration into seconds.
 *
 * Upstream uses a bare seconds string ("31.368") normally, but switches to
 * colon-separated units ("30:46.248") once a stop runs past a minute — which
 * happens whenever a red flag suspends the race with cars in the pit lane.
 * Both forms are real data and both must round-trip.
 */
export function parsePitLaneSeconds(duration: string): number {
  const parts = duration.split(":");
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

export function toPitStops(pitStops: JolpicaPitStop[]): PitStop[] {
  return pitStops.map((stop) => ({
    driverId: stop.driverId,
    driverNumber: null,
    lap: Number(stop.lap),
    at: null,
    pitLaneSeconds: parsePitLaneSeconds(stop.duration),
  }));
}

export function toLapTimings(laps: JolpicaLap[]): LapTiming[] {
  return laps.flatMap((lap) =>
    lap.Timings.map((timing) => ({
      driverId: timing.driverId,
      lap: Number(lap.number),
      position: Number(timing.position),
    })),
  );
}

/**
 * The driver leading at the end of lap 1 — one of the supported bet markets.
 * Returns null when lap-1 timing data hasn't been published yet.
 */
export function lapOneLeader(timings: LapTiming[]): string | null {
  const lapOne = timings.filter((timing) => timing.lap === 1);
  const leader = lapOne.find((timing) => timing.position === 1);
  return leader?.driverId ?? null;
}

/**
 * The fastest pit stop of the race, by pit-lane time.
 *
 * Stops taken under a red flag are naturally excluded by taking the minimum,
 * since a suspended stop measures in the tens of minutes.
 */
export function fastestPitStop(stops: PitStop[]): PitStop | null {
  if (stops.length === 0) return null;
  return stops.reduce((fastest, stop) =>
    stop.pitLaneSeconds < fastest.pitLaneSeconds ? stop : fastest,
  );
}
