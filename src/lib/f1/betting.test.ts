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
  roundStake,
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
  it("lets the whole bank ride", () => {
    // The ceiling used to be a fifth. A bet now requires a paid-for roster, so
    // the bank is genuinely spare, and odds carry a house margin, so betting
    // big is a faster way to lose rather than a shortcut to winning.
    expect(maxStake(100)).toBeCloseTo(100, 1);
    expect(checkStake(100, 100).allowed).toBe(true);
    expect(checkStake(60, 100).allowed).toBe(true);
  });

  it("rejects a stake larger than the bank", () => {
    const result = checkStake(500, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("more cap than your bank holds");
  });

  it("keeps the ceiling usable on a small bank", () => {
    // A fifth of 2.0 is 0.4, under the 1.0 minimum, so the form asked for a
    // number between 1 and 0.4 and no stake was possible at all.
    expect(maxStake(2)).toBeCloseTo(2, 1);
    expect(checkStake(2, 2).allowed).toBe(true);
  });

  it("rejects a stake below the minimum", () => {
    // The minimum is a tenth of a million now, matching the step the rest of
    // the ledger already rounds to.
    expect(checkStake(0.05, 100).allowed).toBe(false);
    expect(checkStake(0.5, 100).allowed).toBe(true);
  });

  it("rejects betting with an empty bank", () => {
    expect(checkStake(1, 0).allowed).toBe(false);
  });
});

describe("roundStake", () => {
  it("keeps a tenth intact", () => {
    expect(roundStake(2.1)).toBeCloseTo(2.1, 5);
    expect(roundStake(0.1)).toBeCloseTo(0.1, 5);
  });

  it("rounds down, never up", () => {
    // Rounding up would charge cap the member did not offer, and on an all-in
    // bet it would charge cap they do not have.
    expect(roundStake(2.19)).toBeCloseTo(2.1, 5);
    expect(roundStake(2.99)).toBeCloseTo(2.9, 5);
  });

  it("survives the usual floating-point trap", () => {
    // 0.3 / 0.1 is 2.9999… in binary; a naive floor would make this 0.2.
    expect(roundStake(0.3)).toBeCloseTo(0.3, 5);
    expect(roundStake(0.7)).toBeCloseTo(0.7, 5);
    expect(roundStake(29.4)).toBeCloseTo(29.4, 5);
  });

  it("accepts a tenth as the smallest stake", () => {
    expect(checkStake(0.1, 10).allowed).toBe(true);
    expect(checkStake(0.05, 10).allowed).toBe(false);
  });

  it("lets a tenth-sized bank be staked in full", () => {
    expect(maxStake(0.1)).toBeCloseTo(0.1, 5);
    expect(checkStake(0.1, 0.1).allowed).toBe(true);
  });
});

describe("a league's own stake ceiling", () => {
  it("does nothing when the league sets none", () => {
    expect(maxStake(100, null)).toBeCloseTo(100, 1);
    expect(checkStake(100, 100, null).allowed).toBe(true);
  });

  it("caps a stake at the league's figure", () => {
    expect(maxStake(100, 10)).toBeCloseTo(10, 1);
    expect(checkStake(10, 100, 10).allowed).toBe(true);
    expect(checkStake(10.5, 100, 10).allowed).toBe(false);
  });

  it("says which limit was hit, since the two need different fixes", () => {
    expect(checkStake(50, 100, 10).reason).toContain("league caps a bet at 10.0");
    expect(checkStake(200, 100, 500).reason).toContain("more cap than your bank holds");
  });

  it("never lets a league limit raise what the bank can cover", () => {
    // A generous house rule is still bounded by the money that exists.
    expect(maxStake(5, 500)).toBeCloseTo(5, 1);
    expect(checkStake(6, 5, 500).allowed).toBe(false);
  });
});
