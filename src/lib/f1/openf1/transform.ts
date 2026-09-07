import type { Overtake, PitStop, SafetyCarEvent } from "../types";
import type { JolpicaRaceResult } from "../jolpica/schemas";
import type {
  OpenF1Overtake,
  OpenF1Pit,
  OpenF1RaceControl,
} from "./schemas";

/**
 * Pure transforms for OpenF1 data, including the overtake settlement rule.
 */

/**
 * How far either side of a recorded pit stop an overtake is treated as
 * pit-driven rather than on-track.
 *
 * OpenF1 doesn't document whether a pit record's `date` marks entry or exit, so
 * the window is applied symmetrically to cover both readings.
 */
const PIT_WINDOW_CAP_SECONDS = 60;

export function toOvertakes(overtakes: OpenF1Overtake[]): Overtake[] {
  return overtakes.map((overtake) => ({
    overtakingDriverNumber: overtake.overtaking_driver_number,
    overtakenDriverNumber: overtake.overtaken_driver_number,
    at: new Date(overtake.date),
    position: overtake.position,
  }));
}

export function toOpenF1PitStops(stops: OpenF1Pit[]): PitStop[] {
  return stops
    .filter((stop) => stop.lane_duration !== null)
    .map((stop) => ({
      driverId: null,
      driverNumber: stop.driver_number,
      lap: stop.lap_number,
      at: new Date(stop.date),
      pitLaneSeconds: stop.lane_duration as number,
    }));
}

export function toSafetyCarEvents(
  messages: OpenF1RaceControl[],
): SafetyCarEvent[] {
  return messages
    .filter((message) => message.category === "SafetyCar")
    .map((message) => ({
      lap: message.lap_number ?? 0,
      at: new Date(message.date),
      message: message.message,
      virtual: /VIRTUAL|VSC/i.test(message.message),
    }));
}

/** True when the race saw any safety car — backs the "safety car y/n" market. */
export function hadSafetyCar(events: SafetyCarEvent[]): boolean {
  return events.some((event) => /DEPLOYED/i.test(event.message));
}

/**
 * Drops position changes that happened while the overtaken car was in the pits.
 *
 * OpenF1's feed counts any position swap, including those caused by a rival
 * pitting. The design spec settles the "most overtakes" market on on-track
 * passes only, so those are removed here.
 *
 * The per-stop window is capped: a stop taken under a red flag measures in the
 * tens of minutes, and using that raw duration as an exclusion window would
 * silently discard almost every genuine pass in the race.
 */
export function excludePitDrivenOvertakes(
  overtakes: Overtake[],
  pitStops: PitStop[],
): Overtake[] {
  const stopsByDriver = new Map<number, PitStop[]>();
  for (const stop of pitStops) {
    if (stop.driverNumber === null) continue;
    const existing = stopsByDriver.get(stop.driverNumber);
    if (existing) existing.push(stop);
    else stopsByDriver.set(stop.driverNumber, [stop]);
  }

  return overtakes.filter((overtake) => {
    const stops = stopsByDriver.get(overtake.overtakenDriverNumber);
    if (!stops) return true;

    return !stops.some((stop) => {
      // Only OpenF1-sourced stops carry a timestamp; a stop without one cannot
      // be positioned against the overtake, so it can't justify excluding it.
      if (stop.at === null) return false;
      const delta = Math.abs(overtake.at.getTime() - stop.at.getTime()) / 1000;
      return delta <= stopWindowSeconds(stop);
    });
  });
}

function stopWindowSeconds(stop: PitStop): number {
  return Math.min(stop.pitLaneSeconds, PIT_WINDOW_CAP_SECONDS);
}

/**
 * How far a session's start may sit from the reported race date and still be
 * the same event.
 *
 * A night race can start after midnight UTC while jolpica still files it under
 * the previous local date: Las Vegas 2024 is dated 2024-11-23 by jolpica but
 * starts 2024-11-24T06:00Z per OpenF1, 30 hours after that date's midnight.
 * Grands Prix are at least a week apart, so a day-and-a-half window cannot
 * match the wrong event.
 */
const SESSION_DATE_TOLERANCE_MS = 36 * 60 * 60 * 1000;

/**
 * Finds the OpenF1 session for a race date, tolerating timezone drift.
 *
 * Returns the closest session within the tolerance window, so that even if two
 * candidates qualified the nearer one wins.
 */
export function findSessionForRaceDate<T extends { date_start: string }>(
  sessions: T[],
  raceDate: string,
): T | null {
  const target = Date.parse(`${raceDate}T00:00:00Z`);
  if (!Number.isFinite(target)) return null;

  let best: { session: T; distance: number } | null = null;

  for (const session of sessions) {
    const start = Date.parse(session.date_start);
    if (!Number.isFinite(start)) continue;

    const distance = Math.abs(start - target);
    if (distance > SESSION_DATE_TOLERANCE_MS) continue;
    if (!best || distance < best.distance) best = { session, distance };
  }

  return best?.session ?? null;
}

/** Counts on-track overtakes per car number. */
export function countOvertakesByDriver(
  overtakes: Overtake[],
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const overtake of overtakes) {
    const current = counts.get(overtake.overtakingDriverNumber) ?? 0;
    counts.set(overtake.overtakingDriverNumber, current + 1);
  }
  return counts;
}

/**
 * Builds a car-number to jolpica driverId map for a given race.
 *
 * The two APIs share no identifier: jolpica keys drivers by slug
 * ("max_verstappen"), OpenF1 by car number. jolpica's per-race `number` field is
 * the authoritative join key, since it reflects the number actually raced.
 */
export function linkDriverNumbers(
  results: JolpicaRaceResult[],
): Map<number, string> {
  const byNumber = new Map<number, string>();
  for (const result of results) {
    byNumber.set(Number(result.number), result.Driver.driverId);
  }
  return byNumber;
}
