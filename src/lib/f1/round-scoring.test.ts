import { describe, expect, it } from "vitest";
import { constructorScore, resolveDuel, scoreRoster, type RoundFacts } from "./round-scoring";
import type { DriverRaceInput } from "./scoring";
import type { RosterSelection } from "./roster";

function driverInput(overrides: Partial<DriverRaceInput> = {}): DriverRaceInput {
  return {
    driverId: "d",
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

const facts: RoundFacts = {
  drivers: new Map<string, DriverRaceInput>([
    ["winner", driverInput({ driverId: "winner", qualifyingPosition: 1, gridPosition: 1, finishPosition: 1 })],
    ["second", driverInput({ driverId: "second", qualifyingPosition: 2, gridPosition: 2, finishPosition: 2 })],
    ["midfield", driverInput({ driverId: "midfield", qualifyingPosition: 11, gridPosition: 11, finishPosition: 9 })],
    ["backmarker", driverInput({ driverId: "backmarker", qualifyingPosition: 20, gridPosition: 20, finishPosition: 18 })],
    ["retiree", driverInput({ driverId: "retiree", finishPosition: 20, classification: "retired" })],
  ]),
  constructorDrivers: new Map([
    ["fastteam", ["winner", "second"]],
    ["slowteam", ["backmarker", "retiree"]],
  ]),
  constructorRanking: ["fastteam", "slowteam"],
};

const selection: RosterSelection = {
  top: ["winner", "second", "midfield"],
  mid: [],
  backmarker: "backmarker",
  constructors: ["fastteam"],
  reverseConstructor: "slowteam",
  turboDriverId: null,
  boostConstructorId: null,
};

describe("constructorScore", () => {
  it("sums its drivers' scores", () => {
    // winner: 10 quali + 25 race + 0 delta = 35; second: 9 + 18 = 27
    expect(constructorScore("fastteam", facts)).toBe(62);
  });

  it("scores nothing for an unknown constructor", () => {
    expect(constructorScore("ghost", facts)).toBe(0);
  });
});

describe("scoreRoster", () => {
  it("excludes the backmarker from points and reports it as budget instead", () => {
    const score = scoreRoster(selection, facts);
    const backmarkerSlot = score.slots.find((slot) => slot.slot === "driver_backmarker");
    expect(backmarkerSlot?.points).toBe(0);
    expect(score.budget).toBe(18);
  });

  it("pays no budget when the backmarker retired", () => {
    const score = scoreRoster({ ...selection, backmarker: "retiree" }, facts);
    expect(score.budget).toBe(0);
  });

  it("scores the reverse constructor on its race placing", () => {
    const score = scoreRoster(selection, facts);
    const reverse = score.slots.find((slot) => slot.slot === "constructor_reverse");
    // Last of two teams pays 2.
    expect(reverse?.points).toBe(2);
  });

  it("totals every scoring slot", () => {
    const score = scoreRoster(selection, facts);
    // 35 + 27 + midfield(0 quali + 2 race + 2 delta = 4) + team 62 + reverse 2
    expect(score.points).toBe(130);
  });

  it("scores a missing driver as zero rather than throwing", () => {
    // A driver replaced mid-season may be absent from a later round.
    const score = scoreRoster({ ...selection, top: ["ghost"] }, facts);
    expect(score.slots.find((slot) => slot.competitorId === "ghost")?.points).toBe(0);
  });

  it("includes a per-driver breakdown so a score can be explained", () => {
    const score = scoreRoster(selection, facts);
    const winner = score.slots.find((slot) => slot.competitorId === "winner");
    expect(winner?.breakdown?.race).toBe(25);
    expect(winner?.breakdown?.qualifying).toBe(10);
  });
});

describe("resolveDuel", () => {
  const scores = new Map([["a", 100], ["b", 80], ["c", 100]]);

  it("awards the point to the higher scorer", () => {
    const outcome = resolveDuel("a", "b", scores);
    expect(outcome.homeDuelPoints).toBe(1);
    expect(outcome.awayDuelPoints).toBe(0);
  });

  it("works the same way round", () => {
    const outcome = resolveDuel("b", "a", scores);
    expect(outcome.homeDuelPoints).toBe(0);
    expect(outcome.awayDuelPoints).toBe(1);
  });

  it("splits the point on a draw", () => {
    const outcome = resolveDuel("a", "c", scores);
    expect(outcome.homeDuelPoints).toBe(0.5);
    expect(outcome.awayDuelPoints).toBe(0.5);
  });

  it("treats a member with no roster as zero, losing to anyone who picked", () => {
    // No forfeit rule is needed: not picking is already the worst outcome.
    const outcome = resolveDuel("a", "absent", scores);
    expect(outcome.awayPoints).toBe(0);
    expect(outcome.homeDuelPoints).toBe(1);
  });

  it("draws when neither member picked a roster", () => {
    const outcome = resolveDuel("absent1", "absent2", scores);
    expect(outcome.homeDuelPoints).toBe(0.5);
    expect(outcome.awayDuelPoints).toBe(0.5);
  });
});
