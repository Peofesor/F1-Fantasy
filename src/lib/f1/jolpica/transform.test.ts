import { describe, expect, it } from "vitest";
import {
  classifyFinish,
  fastestPitStop,
  highestSessionReached,
  lapOneLeader,
  parsePitLaneSeconds,
  toDriverStandings,
  toQualifyingEntries,
  toRaceResults,
} from "./transform";
import type { JolpicaQualifyingResult, JolpicaRaceResult } from "./schemas";
import type { PitStop } from "../types";

function qualifyingResult(
  overrides: Partial<JolpicaQualifyingResult>,
): JolpicaQualifyingResult {
  return {
    number: "1",
    position: "1",
    Driver: {
      driverId: "norris",
      givenName: "Lando",
      familyName: "Norris",
      nationality: "British",
    },
    Constructor: {
      constructorId: "mclaren",
      name: "McLaren",
      nationality: "British",
    },
    ...overrides,
  };
}

describe("highestSessionReached", () => {
  it("reports Q3 when a Q3 time was set", () => {
    expect(
      highestSessionReached({ Q1: "1:22.6", Q2: "1:22.0", Q3: "1:21.7" }),
    ).toBe("Q3");
  });

  it("reports Q2 when eliminated there", () => {
    expect(highestSessionReached({ Q1: "1:22.6", Q2: "1:22.9" })).toBe("Q2");
  });

  it("reports Q1 when eliminated there", () => {
    expect(highestSessionReached({ Q1: "1:23.4" })).toBe("Q1");
  });

  it("ignores a session entered but not set a time in", () => {
    // Reaching Q3 and crashing without a lap must not read as a Q3 time,
    // otherwise progression points would be awarded for a lap never set.
    expect(highestSessionReached({ Q1: "1:22.6", Q2: "1:22.0", Q3: "" })).toBe(
      "Q2",
    );
  });
});

describe("toQualifyingEntries", () => {
  it("flags a driver who set no time at all", () => {
    const [entry] = toQualifyingEntries([
      qualifyingResult({ position: "20", Q1: "" }),
    ]);
    expect(entry.setNoTime).toBe(true);
    expect(entry.highestSessionReached).toBe("Q1");
  });

  it("does not flag a driver with any time", () => {
    const [entry] = toQualifyingEntries([
      qualifyingResult({ Q1: "1:22.612", Q2: "1:22.077", Q3: "1:21.786" }),
    ]);
    expect(entry.setNoTime).toBe(false);
    expect(entry.q3).toBe("1:21.786");
  });

  it("normalises absent and empty sessions to null", () => {
    const [entry] = toQualifyingEntries([
      qualifyingResult({ Q1: "1:23.0", Q2: "  " }),
    ]);
    expect(entry.q2).toBeNull();
    expect(entry.q3).toBeNull();
  });
});

describe("classifyFinish", () => {
  it.each([
    ["1", "Finished", "finished"],
    ["12", "+1 Lap", "lapped"],
    ["15", "+3 Laps", "lapped"],
    ["R", "Accident", "retired"],
    ["R", "Gearbox", "retired"],
    ["D", "Disqualified", "disqualified"],
    ["W", "Withdrew", "did-not-start"],
    ["F", "Did not qualify", "did-not-start"],
    ["N", "Not classified", "retired"],
  ])("classifies positionText %s / %s as %s", (positionText, status, expected) => {
    expect(classifyFinish(positionText, status)).toBe(expected);
  });

  it("prefers positionText over a misleading status", () => {
    // A disqualified car can carry a mechanical status; the controlled
    // vocabulary in positionText is authoritative.
    expect(classifyFinish("D", "Engine")).toBe("disqualified");
  });
});

describe("toRaceResults", () => {
  function raceResult(overrides: Partial<JolpicaRaceResult>): JolpicaRaceResult {
    return {
      number: "1",
      position: "1",
      positionText: "1",
      points: "25",
      grid: "3",
      laps: "53",
      status: "Finished",
      Driver: {
        driverId: "norris",
        givenName: "Lando",
        familyName: "Norris",
        nationality: "British",
      },
      Constructor: {
        constructorId: "mclaren",
        name: "McLaren",
        nationality: "British",
      },
      ...overrides,
    };
  }

  it("keeps a pit-lane start as grid 0 rather than inventing a position", () => {
    const [result] = toRaceResults([raceResult({ grid: "0" })]);
    expect(result.gridPosition).toBe(0);
  });

  it("nulls the position for an unclassified entry", () => {
    const [result] = toRaceResults([
      raceResult({ position: "0", positionText: "R", status: "Accident" }),
    ]);
    expect(result.position).toBeNull();
    expect(result.classification).toBe("retired");
  });

  it("records the fastest lap rank when present", () => {
    const [result] = toRaceResults([
      raceResult({ FastestLap: { rank: "1", lap: "44" } }),
    ]);
    expect(result.fastestLapRank).toBe(1);
  });

  it("leaves fastest lap null when absent", () => {
    expect(toRaceResults([raceResult({})])[0].fastestLapRank).toBeNull();
  });
});

describe("toDriverStandings", () => {
  const standing = (overrides: Record<string, unknown> = {}) =>
    ({
      points: "0",
      wins: "0",
      Driver: {
        driverId: "hadjar",
        givenName: "Isack",
        familyName: "Hadjar",
        nationality: "French",
      },
      Constructors: [
        { constructorId: "rb", name: "RB F1 Team", nationality: "Italian" },
      ],
      ...overrides,
    }) as Parameters<typeof toDriverStandings>[0][number];

  it("treats a driver on zero points as unranked, not joint-last", () => {
    // jolpica omits `position` and sends positionText "-" for these entries.
    const [entry] = toDriverStandings([standing({ positionText: "-" })]);
    expect(entry.position).toBeNull();
  });

  it("reads a real position when one is given", () => {
    const [entry] = toDriverStandings([
      standing({ position: "4", positionText: "4", points: "58" }),
    ]);
    expect(entry.position).toBe(4);
    expect(entry.points).toBe(58);
  });

  it("takes the current constructor when a driver switched mid-season", () => {
    const [entry] = toDriverStandings([
      standing({
        position: "9",
        Constructors: [
          { constructorId: "sauber", name: "Sauber", nationality: "Swiss" },
          { constructorId: "williams", name: "Williams", nationality: "British" },
        ],
      }),
    ]);
    expect(entry.constructorId).toBe("williams");
  });
});

describe("parsePitLaneSeconds", () => {
  it("parses a plain seconds duration", () => {
    expect(parsePitLaneSeconds("31.368")).toBeCloseTo(31.368, 3);
  });

  it("parses a red-flag stop expressed as minutes and seconds", () => {
    // Monza 2026: the race was suspended with cars in the pit lane, so the
    // recorded pit-lane time is genuinely half an hour.
    expect(parsePitLaneSeconds("30:46.248")).toBeCloseTo(1846.248, 3);
  });

  it("parses an hours-long duration", () => {
    expect(parsePitLaneSeconds("1:02:03.5")).toBeCloseTo(3723.5, 3);
  });
});

describe("fastestPitStop", () => {
  const stop = (pitLaneSeconds: number, driverId: string): PitStop => ({
    driverId,
    driverNumber: null,
    lap: 10,
    at: null,
    pitLaneSeconds,
  });

  it("returns the shortest pit-lane time", () => {
    const fastest = fastestPitStop([
      stop(31.4, "alonso"),
      stop(29.8, "russell"),
      stop(30.2, "gasly"),
    ]);
    expect(fastest?.driverId).toBe("russell");
  });

  it("naturally excludes a red-flag stop as an outlier", () => {
    const fastest = fastestPitStop([
      stop(1846.2, "russell"),
      stop(30.1, "gasly"),
    ]);
    expect(fastest?.driverId).toBe("gasly");
  });

  it("returns null when no stops were made", () => {
    expect(fastestPitStop([])).toBeNull();
  });
});

describe("lapOneLeader", () => {
  it("finds the driver holding position 1 after lap 1", () => {
    expect(
      lapOneLeader([
        { driverId: "russell", lap: 1, position: 2 },
        { driverId: "gasly", lap: 1, position: 1 },
        { driverId: "norris", lap: 2, position: 1 },
      ]),
    ).toBe("gasly");
  });

  it("returns null when lap-1 data has not been published", () => {
    expect(lapOneLeader([{ driverId: "norris", lap: 2, position: 1 }])).toBeNull();
  });
});
