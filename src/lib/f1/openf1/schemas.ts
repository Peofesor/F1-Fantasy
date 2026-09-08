import { z } from "zod";

/**
 * Zod schemas for the OpenF1 API.
 *
 * OpenF1 is the only free source for overtakes, safety-car events and pit-lane
 * timing keyed to sessions. Unlike jolpica it returns real JSON types rather
 * than strings, and it keys drivers by car number rather than a slug — see
 * `linkDriverNumbers` in ./transform.ts for how the two are joined.
 *
 * Licensing note: OpenF1 is CC BY-NC-SA 4.0 (non-commercial). Fine for a private
 * league; a commercial launch needs their permission. See docs/game-design-spec.md §10.
 */

export const sessionSchema = z.object({
  session_key: z.number(),
  meeting_key: z.number(),
  session_type: z.string(),
  session_name: z.string(),
  date_start: z.string(),
  date_end: z.string(),
  year: z.number(),
  country_name: z.string(),
  circuit_short_name: z.string(),
  location: z.string(),
});

export const openF1DriverSchema = z.object({
  session_key: z.number(),
  driver_number: z.number(),
  full_name: z.string(),
  name_acronym: z.string(),
  team_name: z.string().nullable(),
  team_colour: z.string().nullable().optional(),
  headshot_url: z.string().nullable().optional(),
});

export const overtakeSchema = z.object({
  session_key: z.number(),
  overtaking_driver_number: z.number(),
  overtaken_driver_number: z.number(),
  date: z.string(),
  position: z.number(),
});

export const openF1PitSchema = z.object({
  session_key: z.number(),
  driver_number: z.number(),
  lap_number: z.number(),
  date: z.string(),
  /** Seconds spent in the pit lane. */
  lane_duration: z.number().nullable(),
  /**
   * Stationary time. Null on every session checked (2024 and 2026 alike), so
   * the broadcast "fastest pit stop" figure is not obtainable — settlement uses
   * pit-lane time instead.
   */
  stop_duration: z.number().nullable(),
});

export const raceControlSchema = z.object({
  session_key: z.number(),
  date: z.string(),
  category: z.string(),
  message: z.string(),
  lap_number: z.number().nullable(),
});

export const sessionListSchema = z.array(sessionSchema);
export const driverListSchema = z.array(openF1DriverSchema);
export const overtakeListSchema = z.array(overtakeSchema);
export const pitListSchema = z.array(openF1PitSchema);
export const raceControlListSchema = z.array(raceControlSchema);

export type OpenF1Session = z.infer<typeof sessionSchema>;
export type OpenF1Driver = z.infer<typeof openF1DriverSchema>;
export type OpenF1Overtake = z.infer<typeof overtakeSchema>;
export type OpenF1Pit = z.infer<typeof openF1PitSchema>;
export type OpenF1RaceControl = z.infer<typeof raceControlSchema>;
