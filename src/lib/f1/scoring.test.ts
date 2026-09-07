import { describe, expect, it } from "vitest";
import {
  backmarkerBudget,
  overtakePoints,
  positionChangePoints,
  qualifyingPoints,
  racePoints,
  rankConstructorsForRace,
  reverseConstructorPoints,
  scoreDriver,
  type DriverRaceInput,
} from "./scoring";

function driver(overrides: Partial<DriverRaceInput> = {}): DriverRaceInput {
  return {
    driverId: "norris",
    qualifyingPosition: 5,
    qualifyingNoTime: false,
    gridPosition: 5,
    finishPosition: 5,
    classification: "finished",
    fastestLap: false,
    driverOfTheDay: false,
    overtakes: 0,
    ...overrides,
  };
}

describe("qualifyingPoints", () => {
  it("awards 10 down to 1 across the top ten", () => {
    expect(qualifyingPoints(1)).toBe(10);
    expect(qualifyingPoints(10)).toBe(1);
  });

  it("awards nothing outside the top ten", () => {
    expect(qualifyingPoints(11)).toBe(0);
    expect(qualifyingPoints(null)).toBe(0);
  });
});

describe("racePoints", () => {
  it("matches the real points table", () => {
    expect(racePoints(1)).toBe(25);
    expect(racePoints(2)).toBe(18);
    expect(racePoints(10)).toBe(1);
  });

  it("awards nothing below tenth or when unclassified", () => {
    expect(racePoints(11)).toBe(0);
    expect(racePoints(null)).toBe(0);
  });
});

describe("positionChangePoints", () => {
  it("rewards places gained and penalises places lost", () => {
    expect(positionChangePoints(10, 4)).toBe(6);
    expect(positionChangePoints(3, 8)).toBe(-5);
  });

  it("is uncapped, matching the official game", () => {
    expect(positionChangePoints(20, 1)).toBe(19);
  });

  it("scores nothing for a pit-lane start", () => {
    // Grid 0 means a pit-lane start; treating it literally would read as a
    // twenty-place gain.
    expect(positionChangePoints(0, 5)).toBe(0);
  });

  it("scores nothing when the driver did not finish", () => {
    expect(positionChangePoints(5, null)).toBe(0);
  });
});

describe("overtakePoints", () => {
  it("divides by three and rounds down", () => {
    expect(overtakePoints(7)).toBe(2);
    expect(overtakePoints(2)).toBe(0);
    expect(overtakePoints(9)).toBe(3);
  });

  it("keeps the biggest recorded race below the value of a win", () => {
    // 43 was the 2026 maximum; unscaled it would beat the 25 for winning.
    expect(overtakePoints(43)).toBe(14);
    expect(overtakePoints(43)).toBeLessThan(racePoints(1));
  });

  it("never returns a negative", () => {
    expect(overtakePoints(-5)).toBe(0);
  });
});

describe("scoreDriver", () => {
  it("sums every component of a clean points finish", () => {
    const score = scoreDriver(
      driver({ qualifyingPosition: 2, gridPosition: 2, finishPosition: 1, overtakes: 6 }),
    );
    expect(score.qualifying).toBe(9);
    expect(score.race).toBe(25);
    expect(score.positionsGained).toBe(1);
    expect(score.overtakes).toBe(2);
    expect(score.total).toBe(37);
  });

  it("applies the DNF penalty", () => {
    const score = scoreDriver(
      driver({ finishPosition: null, classification: "retired", qualifyingPosition: 3 }),
    );
    expect(score.penalties).toBe(-20);
    expect(score.race).toBe(0);
    expect(score.total).toBe(-12); // 8 for qualifying third, minus 20
  });

  it("penalises a disqualification like a retirement", () => {
    const score = scoreDriver(
      driver({ finishPosition: null, classification: "disqualified", qualifyingPosition: null }),
    );
    expect(score.total).toBe(-20);
  });

  it("applies the qualifying penalty for setting no time", () => {
    const score = scoreDriver(driver({ qualifyingPosition: null, qualifyingNoTime: true }));
    expect(score.penalties).toBe(-5);
  });

  it("adds fastest lap and driver of the day", () => {
    const score = scoreDriver(driver({ fastestLap: true, driverOfTheDay: true }));
    expect(score.fastestLap).toBe(10);
    expect(score.driverOfTheDay).toBe(10);
  });

  it("does not charge a retiring driver for places they never lost", () => {
    // jolpica assigns retirements a classification number too, so a car that
    // stopped early still appears as e.g. 22nd. Scoring that as a positions
    // delta double-penalises the retirement — Leclerc at Monza 2026 took -19
    // for lost places on top of the -20 DNF.
    const score = scoreDriver(
      driver({
        qualifyingPosition: 7,
        gridPosition: 3,
        finishPosition: 22,
        classification: "retired",
      }),
    );
    expect(score.positionsGained).toBe(0);
    expect(score.race).toBe(0);
    expect(score.total).toBe(-16); // 4 for qualifying seventh, minus 20
  });

  it("still scores a lapped car, which is classified", () => {
    const score = scoreDriver(
      driver({ qualifyingPosition: 12, gridPosition: 12, finishPosition: 9, classification: "lapped" }),
    );
    expect(score.race).toBe(2);
    expect(score.positionsGained).toBe(3);
    expect(score.penalties).toBe(0);
  });

  it("can produce a negative total for a bad weekend", () => {
    const score = scoreDriver(
      driver({
        qualifyingPosition: null,
        qualifyingNoTime: true,
        gridPosition: 18,
        finishPosition: null,
        classification: "retired",
      }),
    );
    expect(score.total).toBe(-25);
  });
});

describe("backmarkerBudget", () => {
  it("pays more for a worse finish", () => {
    expect(backmarkerBudget(20, "finished")).toBe(20);
    expect(backmarkerBudget(12, "finished")).toBe(12);
  });

  it("pays nothing for a retirement", () => {
    // Otherwise the optimal pick becomes whoever crashes most.
    expect(backmarkerBudget(null, "retired")).toBe(0);
  });

  it("pays nothing for a disqualification", () => {
    expect(backmarkerBudget(18, "disqualified")).toBe(0);
  });

  it("pays little for a strong finish", () => {
    expect(backmarkerBudget(1, "finished")).toBe(1);
  });
});

describe("rankConstructorsForRace", () => {
  const entry = (constructorId: string, positions: (number | null)[]) => ({
    constructorId,
    finishes: positions.map((position) => ({
      position,
      classification: position === null ? ("retired" as const) : ("finished" as const),
    })),
  });

  it("ranks by combined finishing position, best first", () => {
    const ranking = rankConstructorsForRace(
      [entry("slow", [15, 16]), entry("fast", [1, 3]), entry("mid", [7, 8])],
      20,
    );
    expect(ranking).toEqual(["fast", "mid", "slow"]);
  });

  it("treats a retirement as worse than the last classified finisher", () => {
    const ranking = rankConstructorsForRace(
      [entry("finished", [19, 20]), entry("retired", [19, null])],
      20,
    );
    expect(ranking).toEqual(["finished", "retired"]);
  });

  it("is deterministic when teams tie", () => {
    const ranking = rankConstructorsForRace([entry("bravo", [5, 6]), entry("alpha", [5, 6])], 20);
    expect(ranking).toEqual(["alpha", "bravo"]);
  });
});

describe("reverseConstructorPoints", () => {
  it("pays the worst-placed team the most", () => {
    const ranking = ["fast", "mid", "slow"];
    expect(reverseConstructorPoints("slow", ranking)).toBe(3);
    expect(reverseConstructorPoints("fast", ranking)).toBe(1);
  });

  it("pays nothing for a team that did not race", () => {
    expect(reverseConstructorPoints("absent", ["fast", "slow"])).toBe(0);
  });
});
