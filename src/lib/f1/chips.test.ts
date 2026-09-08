import { describe, expect, it } from "vitest";
import { applyChips, canPurchase, chipAvailability, CHIPS, type ChipUsage } from "./chips";

const slots = [
  { slot: "driver_top", competitorId: "star", points: 60 },
  { slot: "driver_top", competitorId: "solid", points: 30 },
  { slot: "driver_mid", competitorId: "dud", points: -20 },
  { slot: "constructor", competitorId: "team", points: 40 },
];

describe("applyChips", () => {
  it("doubles the turbo driver", () => {
    const result = applyChips(slots, { turboDriverId: "solid" });
    expect(result.find((s) => s.competitorId === "solid")?.points).toBe(60);
  });

  it("triples the super driver", () => {
    const result = applyChips(slots, { superDriverId: "star" });
    expect(result.find((s) => s.competitorId === "star")?.points).toBe(180);
  });

  it("doubles a constructor with the konstruktor boost", () => {
    const result = applyChips(slots, { konstruktorBoostId: "team" });
    expect(result.find((s) => s.competitorId === "team")?.points).toBe(80);
  });

  it("cancels negatives with No Negative", () => {
    const result = applyChips(slots, { noNegative: true });
    expect(result.find((s) => s.competitorId === "dud")?.points).toBe(0);
  });

  it("applies multipliers before No Negative, not after", () => {
    // Doubling a -20 after cancelling it would reintroduce the negative the
    // chip was bought to prevent.
    const result = applyChips(slots, { turboDriverId: "dud", noNegative: true });
    expect(result.find((s) => s.competitorId === "dud")?.points).toBe(0);
  });

  it("autopilot doubles the highest-scoring driver", () => {
    const result = applyChips(slots, { autopilot: true });
    expect(result.find((s) => s.competitorId === "star")?.points).toBe(120);
  });

  it("autopilot ignores constructors, which have their own chip", () => {
    const result = applyChips(
      [{ slot: "constructor", competitorId: "team", points: 500 }, ...slots],
      { autopilot: true },
    );
    expect(result.find((s) => s.competitorId === "team")?.points).toBe(500);
  });

  it("autopilot does not compound with an explicit multiplier", () => {
    // Otherwise the best driver could be boosted twice on one result.
    const result = applyChips(slots, { superDriverId: "star", autopilot: true });
    expect(result.find((s) => s.competitorId === "star")?.points).toBe(180);
    // It falls to the next best instead.
    expect(result.find((s) => s.competitorId === "solid")?.points).toBe(60);
  });

  it("autopilot does nothing when every driver scored zero or less", () => {
    const bleak = [{ slot: "driver_top", competitorId: "a", points: -5 }];
    expect(applyChips(bleak, { autopilot: true })[0].points).toBe(-5);
  });

  it("leaves scores untouched when no chip is played", () => {
    expect(applyChips(slots, {})).toEqual(slots);
  });
});

describe("chipAvailability", () => {
  const noUsage: ChipUsage[] = [];

  it("treats unlimited chips as always available", () => {
    const state = chipAvailability("turbo_driver", noUsage, 0, 5);
    expect(state.available).toBe(true);
    expect(state.costToPlay).toBe(0);
  });

  it("blocks an unlimited chip already played this round", () => {
    // Stacking two multipliers on one race would swing far beyond what the
    // scoring model is balanced for.
    const state = chipAvailability("turbo_driver", [{ chipId: "turbo_driver", round: 5 }], 0, 5);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Already played this round");
  });

  it("grants the free use of a limited chip", () => {
    const state = chipAvailability("super_driver", noUsage, 0, 5);
    expect(state.freeRemaining).toBe(1);
    expect(state.available).toBe(true);
  });

  it("blocks a limited chip once the free use is spent and none are bought", () => {
    const state = chipAvailability("super_driver", [{ chipId: "super_driver", round: 2 }], 0, 5);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Buy another use first");
  });

  it("allows a purchased use after the free one", () => {
    const state = chipAvailability("super_driver", [{ chipId: "super_driver", round: 2 }], 1, 5);
    expect(state.purchasedRemaining).toBe(1);
    expect(state.available).toBe(true);
  });

  it("imposes no season limit, however often a chip has been played", () => {
    // The only limit is per race. Repeat use is paid for in cost cap, which is
    // the same currency that buys drivers, so it already costs roster quality.
    const usage: ChipUsage[] = [1, 2, 3, 4, 5].map((round) => ({
      chipId: "super_driver" as const,
      round,
    }));
    const state = chipAvailability("super_driver", usage, 5, 6);
    expect(state.available).toBe(true);
    expect(state.reason).toBeUndefined();
  });

  it("still refuses a second play of the same chip in one round", () => {
    const usage: ChipUsage[] = [{ chipId: "super_driver", round: 6 }];
    const state = chipAvailability("super_driver", usage, 5, 6);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Already played this round");
  });
});

describe("canPurchase", () => {
  it("refuses to sell an unlimited chip", () => {
    expect(canPurchase("turbo_driver", 0, 0, 500).allowed).toBe(false);
  });

  it("allows buying an extra use with enough cap", () => {
    const result = canPurchase("super_driver", 1, 0, 100);
    expect(result.allowed).toBe(true);
    expect(result.price).toBe(CHIPS.super_driver.price);
  });

  it("refuses without enough cost cap", () => {
    const result = canPurchase("super_driver", 1, 0, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Not enough cost cap");
  });

  it("sells any number of uses as long as the cap is there", () => {
    const result = canPurchase("super_driver", 0, 12, 500);
    expect(result.allowed).toBe(true);
  });
});
