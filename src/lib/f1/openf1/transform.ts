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
