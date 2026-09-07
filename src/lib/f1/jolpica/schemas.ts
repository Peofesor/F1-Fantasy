import { z } from "zod";

/**
 * Zod schemas for the jolpica-f1 API (the Ergast-compatible successor).
 *
 * Everything upstream is a string, including numbers — that's an Ergast legacy
 * the successor preserves. Parsing happens at the boundary so a shape change
 * upstream fails loudly here instead of silently producing wrong points.
 */

const driverSchema = z.object({
  driverId: z.string(),
  permanentNumber: z.string().optional(),
  code: z.string().optional(),
  givenName: z.string(),
  familyName: z.string(),
  dateOfBirth: z.string().optional(),
  nationality: z.string(),
});

const constructorSchema = z.object({
  constructorId: z.string(),
  name: z.string(),
  nationality: z.string(),
});

export const qualifyingResultSchema = z.object({
  number: z.string(),
  position: z.string(),
  Driver: driverSchema,
  Constructor: constructorSchema,
  // A driver who reached a session but set no time can appear with the key
  // absent entirely or present-but-empty, so both must be tolerated.
  Q1: z.string().optional(),
  Q2: z.string().optional(),
  Q3: z.string().optional(),
});

export const raceResultSchema = z.object({
  number: z.string(),
  position: z.string(),
  positionText: z.string(),
  points: z.string(),
  grid: z.string(),
  laps: z.string(),
  status: z.string(),
  Driver: driverSchema,
  Constructor: constructorSchema,
  FastestLap: z
    .object({
      rank: z.string().optional(),
      lap: z.string().optional(),
      Time: z.object({ time: z.string() }).optional(),
    })
    .optional(),
});

export const driverStandingSchema = z.object({
  position: z.string(),
  points: z.string(),
  wins: z.string(),
  Driver: driverSchema,
  Constructors: z.array(constructorSchema),
});

export const constructorStandingSchema = z.object({
  position: z.string(),
  points: z.string(),
  wins: z.string(),
  Constructor: constructorSchema,
});

export const pitStopSchema = z.object({
  driverId: z.string(),
  lap: z.string(),
  stop: z.string(),
  time: z.string(),
  /** Either "31.368" or, when a red flag intervened, "30:46.248". */
  duration: z.string(),
});

export const lapSchema = z.object({
  number: z.string(),
  Timings: z.array(
    z.object({
      driverId: z.string(),
      position: z.string(),
      time: z.string(),
    }),
  ),
});

const raceSchema = z.object({
  season: z.string(),
  round: z.string(),
  raceName: z.string(),
  date: z.string(),
  time: z.string().optional(),
  Circuit: z.object({
    circuitId: z.string(),
    circuitName: z.string(),
    Location: z.object({
      locality: z.string(),
      country: z.string(),
    }),
  }),
  QualifyingResults: z.array(qualifyingResultSchema).optional(),
  Results: z.array(raceResultSchema).optional(),
  PitStops: z.array(pitStopSchema).optional(),
  Laps: z.array(lapSchema).optional(),
});

export const raceTableResponseSchema = z.object({
  MRData: z.object({
    limit: z.string(),
    offset: z.string(),
    total: z.string(),
    RaceTable: z.object({
      season: z.string().optional(),
      round: z.string().optional(),
      Races: z.array(raceSchema),
    }),
  }),
});

export const standingsResponseSchema = z.object({
  MRData: z.object({
    limit: z.string(),
    offset: z.string(),
    total: z.string(),
    StandingsTable: z.object({
      season: z.string().optional(),
      round: z.string().optional(),
      StandingsLists: z.array(
        z.object({
          season: z.string(),
          round: z.string(),
          DriverStandings: z.array(driverStandingSchema).optional(),
          ConstructorStandings: z.array(constructorStandingSchema).optional(),
        }),
      ),
    }),
  }),
});

export type JolpicaRace = z.infer<typeof raceSchema>;
export type JolpicaQualifyingResult = z.infer<typeof qualifyingResultSchema>;
export type JolpicaRaceResult = z.infer<typeof raceResultSchema>;
export type JolpicaPitStop = z.infer<typeof pitStopSchema>;
export type JolpicaLap = z.infer<typeof lapSchema>;
export type JolpicaDriverStanding = z.infer<typeof driverStandingSchema>;
export type JolpicaConstructorStanding = z.infer<typeof constructorStandingSchema>;
export type RaceTableResponse = z.infer<typeof raceTableResponseSchema>;
export type StandingsResponse = z.infer<typeof standingsResponseSchema>;
