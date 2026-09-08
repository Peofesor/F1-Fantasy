import { describe, expect, it } from "vitest";
import {
  availableSlotFor,
  EMPTY_SELECTION,
  rosterCostOf,
  validateRoster,
  type RosterContext,
  type RosterSelection,
} from "./roster";
import type { Tier } from "./tiers";

const tiers = new Map<string, Tier>([
  ["t1", "top"],
  ["t2", "top"],
  ["t3", "top"],
  ["t4", "top"],
  ["m1", "mid"],
  ["m2", "mid"],
  ["m3", "mid"],
  ["m4", "mid"],
]);

const constructorTiers = new Map<string, Tier>([
  ["c1", "top"],
  ["c2", "mid"],
  ["c3", "mid"],
]);

const context: RosterContext = {
  tiers,
  constructorTiers,
  driverPrices: new Map([
    ["t1", 25], ["t2", 24], ["t3", 23], ["t4", 22],
    ["m1", 10], ["m2", 9], ["m3", 8], ["m4", 5],
  ]),
  constructorPrices: new Map([["c1", 20], ["c2", 15], ["c3", 6]]),
  // Comfortably above the legal roster below (145), so budget failures are
  // exercised by the tests that deliberately lower it rather than leaking into
  // every other assertion.
  costCap: 160,
};

const legal: RosterSelection = {
  top: ["t1", "t2", "t3"],
  mid: ["m1", "m2", "m3"],
  backmarker: "m4",
  constructors: ["c1", "c2"],
  reverseConstructor: "c3",
  topCaptainId: "t1",
  midCaptainId: "m1",
};

describe("validateRoster", () => {
  it("accepts a legal roster", () => {
    const result = validateRoster(legal, context);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.complete).toBe(true);
  });

  it("computes cost and remaining budget", () => {
    const result = validateRoster(legal, context);
    // 25+24+23 + 10+9+8 + 5 + 20+15 + 6
    expect(result.cost).toBeCloseTo(145, 1);
    expect(result.remaining).toBeCloseTo(15, 1);
  });

  it("rejects an otherwise legal roster that exceeds the cap", () => {
    const result = validateRoster(legal, { ...context, costCap: 130 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Over budget by 15.0"))).toBe(true);
  });

  it("still reports composition as complete when only the budget fails", () => {
    // Being over budget is a fixable spend problem, not a malformed roster.
    const result = validateRoster(legal, { ...context, costCap: 130 });
    expect(result.complete).toBe(true);
  });

  it("rejects a mid-bracket driver in a top slot", () => {
    const result = validateRoster(
      { ...legal, top: ["t1", "t2", "m1"], mid: ["m2", "m3", "m4"], backmarker: "t3" },
      context,
    );
    expect(result.errors.some((e) => e.includes("m1 is not in the top bracket"))).toBe(true);
  });

  it("rejects a top-bracket driver in a mid slot", () => {
    const result = validateRoster(
      { ...legal, mid: ["m1", "m2", "t4"] },
      context,
    );
    expect(result.errors.some((e) => e.includes("t4 is not in the mid bracket"))).toBe(true);
  });

  it("allows any driver in the backmarker slot regardless of bracket", () => {
    // The backmarker slot is deliberately unrestricted. The cap is raised here
    // so the assertion isolates bracket freedom: a top-bracket driver in that
    // slot costs 22 against 5, which would otherwise fail on budget instead.
    const result = validateRoster(
      { ...legal, backmarker: "t4" },
      { ...context, costCap: 200 },
    );
    expect(result.valid).toBe(true);
  });

  it("rejects the same driver twice", () => {
    const result = validateRoster(
      { ...legal, backmarker: "t1" },
      context,
    );
    expect(result.errors.some((e) => e.includes("picked more than once"))).toBe(true);
  });

  it("rejects a constructor used both normally and as the reverse pick", () => {
    const result = validateRoster(
      { ...legal, reverseConstructor: "c1" },
      context,
    );
    expect(result.errors.some((e) => e.includes("picked more than once"))).toBe(true);
  });

  it("reports every missing slot at once rather than one at a time", () => {
    const result = validateRoster(EMPTY_SELECTION, context);
    expect(result.complete).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it("counts an unknown pick as free rather than crashing", () => {
    const result = validateRoster(
      { ...legal, backmarker: "ghost" },
      context,
    );
    expect(result.cost).toBeCloseTo(140, 1);
  });
});

describe("rosterCostOf", () => {
  it("sums drivers and constructors", () => {
    expect(rosterCostOf(legal, context)).toBeCloseTo(145, 1);
  });

  it("is zero for an empty selection", () => {
    expect(rosterCostOf(EMPTY_SELECTION, context)).toBe(0);
  });
});

describe("availableSlotFor", () => {
  it("offers the top slot to a top-bracket driver while space remains", () => {
    expect(availableSlotFor("t1", EMPTY_SELECTION, tiers)).toBe("top");
  });

  it("offers the mid slot to a mid-bracket driver", () => {
    expect(availableSlotFor("m1", EMPTY_SELECTION, tiers)).toBe("mid");
  });

  it("falls back to the backmarker slot once a bracket is full", () => {
    const full: RosterSelection = { ...EMPTY_SELECTION, top: ["t1", "t2", "t3"] };
    expect(availableSlotFor("t4", full, tiers)).toBe("backmarker");
  });

  it("offers nothing for a driver already on the roster", () => {
    expect(availableSlotFor("t1", legal, tiers)).toBeNull();
  });

  it("offers nothing when every slot is taken", () => {
    expect(availableSlotFor("t4", legal, tiers)).toBeNull();
  });
});

describe("bracket captains", () => {
  it("requires a captain in each bracket for a complete roster", () => {
    const result = validateRoster(
      { ...legal, topCaptainId: null, midCaptainId: null },
      context,
    );
    expect(result.complete).toBe(false);
    expect(result.errors).toContain("Pick a captain from your top drivers.");
    expect(result.errors).toContain("Pick a captain from your midfield drivers.");
  });

  it("accepts any of the three drivers in a bracket", () => {
    expect(validateRoster({ ...legal, topCaptainId: "t3" }, context).valid).toBe(true);
    expect(validateRoster({ ...legal, midCaptainId: "m3" }, context).valid).toBe(true);
  });

  it("rejects a mid driver as the top captain", () => {
    // The armband belongs to its own bracket, or the mid choice would collapse
    // into "whoever scores most overall" again.
    const result = validateRoster({ ...legal, topCaptainId: "m1" }, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not one of your top drivers"))).toBe(true);
  });

  it("rejects a top driver as the mid captain", () => {
    const result = validateRoster({ ...legal, midCaptainId: "t1" }, context);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not one of your midfield drivers"))).toBe(true);
  });

  it("rejects the backmarker as a captain", () => {
    // It pays cost cap rather than points, so doubling it would double nothing.
    const result = validateRoster({ ...legal, midCaptainId: "m4" }, context);
    expect(result.valid).toBe(false);
  });

  it("rejects a driver who is not on the roster at all", () => {
    const result = validateRoster({ ...legal, topCaptainId: "t4" }, context);
    expect(result.errors.some((e) => e.includes("not one of your top drivers"))).toBe(true);
  });
});
