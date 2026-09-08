import { describe, expect, it } from "vitest";
import {
  checkStake,
  MARKETS,
  maxStake,
  payout,
  PRE_QUALIFYING_BONUS,
  settle,
  settleBet,
  type SettlementFacts,
} from "./betting";

const facts: SettlementFacts = {
  finishPositions: new Map([
    ["winner", 1],
    ["third", 3],
    ["eighth", 8],
    ["twelfth", 12],
    ["retiree", null],
  ]),
  classifications: new Map([
    ["winner", "finished"],
    ["third", "finished"],
    ["eighth", "finished"],
    ["twelfth", "lapped"],
    ["retiree", "retired"],
  ]),
  fastestLapDriverId: "third",
  qualifyingReached: new Map([
    ["winner", "Q3"],
    ["third", "Q3"],
    ["twelfth", "Q1"],
  ]),
  fastestPitStopConstructorId: "quickteam",
  winnerNationality: "Italian",
  mostOvertakesDriverId: "eighth",
  safetyCarDeployed: true,
  lapOneLeaderDriverId: "winner",
  sprintPositions: new Map([
    ["winner", 3],
    ["third", 1],
    ["eighth", 9],
  ]),
  beatTeammateInRace: new Map([
    ["winner", true],
    ["third", false],
  ]),
  beatTeammateInQualifying: new Map([["winner", true]]),
};

describe("settleBet", () => {
  it("settles the race winner", () => {
    expect(settleBet("race_winner", "winner", facts)).toBe(true);
    expect(settleBet("race_winner", "third", facts)).toBe(false);
  });

  it.each([
    ["podium", "third", true],
    ["podium", "eighth", false],
    ["top_six", "third", true],
    ["top_six", "eighth", false],
    ["top_ten", "eighth", true],
    ["top_ten", "twelfth", false],
  ] as const)("settles %s for %s", (market, driver, expected) => {
    expect(settleBet(market, driver, facts)).toBe(expected);
  });

  it("treats an unclassified driver as outside every finishing market", () => {
    expect(settleBet("top_ten", "retiree", facts)).toBe(false);
  });

  it("settles DNF on classification, not position", () => {
    expect(settleBet("dnf", "retiree", facts)).toBe(true);
    expect(settleBet("dnf", "twelfth", facts)).toBe(false);
  });

  it("settles qualifying progression", () => {
    expect(settleBet("reached_q3", "winner", facts)).toBe(true);
    expect(settleBet("reached_q3", "twelfth", facts)).toBe(false);
    expect(settleBet("eliminated_q1", "twelfth", facts)).toBe(true);
  });

  it("settles the yes/no safety car market both ways", () => {
    expect(settleBet("safety_car", "yes", facts)).toBe(true);
    expect(settleBet("safety_car", "no", facts)).toBe(false);
    expect(settleBet("safety_car", "no", { ...facts, safetyCarDeployed: false })).toBe(true);
  });

  it("matches nationality case-insensitively", () => {
    expect(settleBet("winner_nationality", "italian", facts)).toBe(true);
  });

  it("settles fastest lap, fastest pit stop, overtakes and lap-one leader", () => {
    expect(settleBet("fastest_lap", "third", facts)).toBe(true);
    expect(settleBet("fastest_pit_stop", "quickteam", facts)).toBe(true);
    expect(settleBet("most_overtakes", "eighth", facts)).toBe(true);
    expect(settleBet("lap_one_leader", "winner", facts)).toBe(true);
  });

  it("returns null when the source data is missing", () => {
    // Not a loss: the member cannot be blamed for a feed that did not publish.
    expect(settleBet("fastest_lap", "third", { ...facts, fastestLapDriverId: null })).toBeNull();
    expect(settleBet("reached_q3", "unknown", facts)).toBeNull();
    expect(settleBet("dnf", "unknown", facts)).toBeNull();
  });
});

describe("payout", () => {
  it("returns the stake plus winnings", () => {
    // Odds of 4 means 4x winnings on top of the stake returned.
    expect(payout(10, "race_winner", "pre_race")).toBeCloseTo(50, 1);
  });

  it("pays more for a pre-qualifying bet", () => {
    const early = payout(10, "race_winner", "pre_qualifying");
    const late = payout(10, "race_winner", "pre_race");
    expect(early).toBeGreaterThan(late);
    expect(early).toBeCloseTo(10 * (1 + MARKETS.race_winner.odds * PRE_QUALIFYING_BONUS), 1);
  });

  it("pays least on the widest market", () => {
    expect(payout(10, "top_ten", "pre_race")).toBeLessThan(payout(10, "race_winner", "pre_race"));
  });
});

describe("settle", () => {
  it("returns winnings on a win", () => {
    const result = settle("race_winner", "winner", 10, "pre_race", facts);
    expect(result.outcome).toBe("won");
    expect(result.returned).toBeCloseTo(50, 1);
  });

  it("returns nothing on a loss", () => {
    const result = settle("race_winner", "third", 10, "pre_race", facts);
    expect(result.outcome).toBe("lost");
    expect(result.returned).toBe(0);
  });

  it("voids and refunds when the outcome is unknowable", () => {
    const result = settle("fastest_lap", "third", 10, "pre_race", {
      ...facts,
      fastestLapDriverId: null,
    });
    expect(result.outcome).toBe("void");
    expect(result.returned).toBe(10);
  });
});

describe("checkStake", () => {
  it("caps a stake at a fifth of the bank", () => {
    expect(maxStake(100)).toBeCloseTo(20, 1);
    expect(checkStake(25, 100).allowed).toBe(false);
    expect(checkStake(20, 100).allowed).toBe(true);
  });

  it("rejects a stake larger than the bank with the clearer message", () => {
    // Both limits are exceeded, but "more than you hold" explains the real
    // problem better than quoting a fraction of a bank you cannot cover.
    expect(checkStake(500, 100).reason).toContain("more cap than you hold");
  });

  it("quotes the fraction limit when the bank would cover it", () => {
    expect(checkStake(50, 100).reason).toContain("Maximum stake");
  });

  it("rejects a stake below the minimum", () => {
    expect(checkStake(0.5, 100).allowed).toBe(false);
  });

  it("rejects betting with an empty bank", () => {
    expect(checkStake(1, 0).allowed).toBe(false);
  });
});
