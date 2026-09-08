import { describe, expect, it } from "vitest";
import { applyChips, canPurchase, chipAvailability, CHIPS, type ChipUsage } from "./chips";

const slots = [
  { slot: "driver_top", competitorId: "star", points: 60 },
  { slot: "driver_top", competitorId: "solid", points: 30 },
  { slot: "driver_mid", competitorId: "dud", points: -20 },
  { slot: "constructor_top", competitorId: "team", points: 40 },
];

const pointsFor = (
  result: { competitorId: string; points: number }[],
  competitorId: string,
) => result.find((slot) => slot.competitorId === competitorId)!.points;

describe("applyChips", () => {
  it("leaves every score untouched when nothing is active", () => {
    expect(applyChips(slots, {})).toEqual(slots);
  });

  it("doubles a captain", () => {
    const result = applyChips(slots, { captainIds: ["star"] });
    expect(pointsFor(result, "star")).toBe(120);
    expect(pointsFor(result, "solid")).toBe(30);
  });

  it("doubles both captains at once", () => {
    // One per bracket, so both apply on the same round.
    const result = applyChips(slots, { captainIds: ["star", "dud"] });
    expect(pointsFor(result, "star")).toBe(120);
    expect(pointsFor(result, "dud")).toBe(-40);
  });

  it("leaves constructors alone", () => {
    // A constructor already scores its two drivers combined; doubling that on
    // top let one slot decide the round.
    const result = applyChips(slots, { captainIds: ["star"] });
    expect(pointsFor(result, "team")).toBe(40);
  });

  it("triples with SuperDriver", () => {
    expect(pointsFor(applyChips(slots, { superDriverId: "solid" }), "solid")).toBe(90);
  });

  it("cancels negatives with No Negative", () => {
    expect(pointsFor(applyChips(slots, { noNegative: true }), "dud")).toBe(0);
  });

  it("multiplies before cancelling negatives", () => {
    // The other order would double a -20 that had already been cancelled,
    // reintroducing the negative the chip exists to prevent.
    const result = applyChips(slots, { captainIds: ["dud"], noNegative: true });
    expect(pointsFor(result, "dud")).toBe(0);
  });

  it("doubles the highest scorer with Autopilot", () => {
    expect(pointsFor(applyChips(slots, { autopilot: true }), "star")).toBe(120);
  });

  it("does not let Autopilot compound on a captain", () => {
    const result = applyChips(slots, { autopilot: true, captainIds: ["star"] });
    expect(pointsFor(result, "star")).toBe(120);
    // It falls to the best driver not already covered.
    expect(pointsFor(result, "solid")).toBe(60);
  });

  it("skips Autopilot when every driver scored nothing or worse", () => {
    const bleak = [{ slot: "driver_top", competitorId: "dud", points: -20 }];
    expect(applyChips(bleak, { autopilot: true })).toEqual(bleak);
  });

  it("ignores a captain who is not on the roster", () => {
    expect(applyChips(slots, { captainIds: ["ghost"] })).toEqual(slots);
  });
});

describe("chipAvailability", () => {
  it("offers the free use before anything is played", () => {
    const state = chipAvailability("super_driver", [], 0, 5);
    expect(state.available).toBe(true);
    expect(state.freeRemaining).toBe(1);
  });

  it("refuses a second play of the same chip in one round", () => {
    const usage: ChipUsage[] = [{ chipId: "super_driver", round: 6 }];
    const state = chipAvailability("super_driver", usage, 5, 6);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Already played this round");
  });

  it("asks for a purchase once the free use is spent", () => {
    const state = chipAvailability("super_driver", [{ chipId: "super_driver", round: 2 }], 0, 5);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Buy another use first");
  });

  it("counts a bought use as playable", () => {
    const state = chipAvailability("super_driver", [{ chipId: "super_driver", round: 2 }], 1, 5);
    expect(state.purchasedRemaining).toBe(1);
    expect(state.available).toBe(true);
  });

  it("imposes no season limit, however often a chip has been played", () => {
    // The only limit is per race. Repeat use is paid for in cost cap, the same
    // currency that buys drivers, so it already costs roster quality.
    const usage: ChipUsage[] = [1, 2, 3, 4, 5].map((round) => ({
      chipId: "super_driver" as const,
      round,
    }));
    const state = chipAvailability("super_driver", usage, 5, 6);
    expect(state.available).toBe(true);
    expect(state.reason).toBeUndefined();
  });
});

describe("canPurchase", () => {
  it("allows buying an extra use with enough cap", () => {
    const result = canPurchase("super_driver", 1, 0, 100);
    expect(result.allowed).toBe(true);
    expect(result.price).toBe(CHIPS.super_driver.price);
  });

  it("refuses without enough cost cap", () => {
    const result = canPurchase("super_driver", 1, 0, 1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Not enough cost cap");
  });

  it("sells any number of uses as long as the cap is there", () => {
    const result = canPurchase("super_driver", 0, 12, 500);
    expect(result.allowed).toBe(true);
  });
});

describe("chip prices", () => {
  it("keeps every chip within 1–3", () => {
    for (const chip of Object.values(CHIPS)) {
      expect(chip.price).toBeGreaterThanOrEqual(1);
      expect(chip.price).toBeLessThanOrEqual(3);
    }
  });

  it("prices the strongest effects at the top of the range", () => {
    expect(CHIPS.super_driver.price).toBe(3);
    expect(CHIPS.unlimited_cap.price).toBe(3);
    expect(CHIPS.no_negative.price).toBe(1);
  });

  it("grants exactly one free use of each", () => {
    for (const chip of Object.values(CHIPS)) {
      expect(chip.freeUses).toBe(1);
    }
  });
});

describe("one chip a weekend", () => {
  it("blocks a different chip once one has been played", () => {
    // The limit is per round, not per chip: stacking a multiplier on a safety
    // net on a roster rewrite swung a round further than the model allows.
    const usage: ChipUsage[] = [{ chipId: "autopilot", round: 6 }];
    const state = chipAvailability("super_driver", usage, 5, 6);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("Another chip is already played this round");
  });

  it("still allows a different chip in a different round", () => {
    const usage: ChipUsage[] = [{ chipId: "autopilot", round: 5 }];
    expect(chipAvailability("super_driver", usage, 5, 6).available).toBe(true);
  });

  it("names the chip's own play first when it is the one already down", () => {
    const usage: ChipUsage[] = [
      { chipId: "super_driver", round: 6 },
      { chipId: "autopilot", round: 6 },
    ];
    expect(chipAvailability("super_driver", usage, 5, 6).reason).toBe(
      "Already played this round",
    );
  });

  it("leaves buying alone — the limit is on playing, not owning", () => {
    const usage: ChipUsage[] = [{ chipId: "autopilot", round: 6 }];
    void usage;
    expect(canPurchase("super_driver", 1, 0, 100).allowed).toBe(true);
  });
});

describe("allowance per half-season", () => {
  const firstHalf = { allowance: null, rounds: [1, 2, 3, 4, 5] };
  const secondHalf = { allowance: null, rounds: [6, 7, 8, 9, 10] };

  it("grants one of each per half by default", () => {
    expect(chipAvailability("super_driver", [], 0, 3, firstHalf).freeRemaining).toBe(1);
  });

  it("refills at the break", () => {
    // Spent in the first half, available again in the second: the point of
    // splitting is that the run-in is not left with nothing to play.
    const usage: ChipUsage[] = [{ chipId: "super_driver", round: 2 }];
    expect(chipAvailability("super_driver", usage, 0, 3, firstHalf).available).toBe(false);
    expect(chipAvailability("super_driver", usage, 0, 7, secondHalf).available).toBe(true);
  });

  it("honours a league that grants more", () => {
    const generous = { allowance: { super_driver: 3 }, rounds: [1, 2, 3, 4, 5] };
    const usage: ChipUsage[] = [{ chipId: "super_driver", round: 2 }];
    expect(chipAvailability("super_driver", usage, 0, 3, generous).freeRemaining).toBe(2);
  });

  it("honours a league that grants none", () => {
    const strict = { allowance: { super_driver: 0 }, rounds: [1, 2, 3, 4, 5] };
    const state = chipAvailability("super_driver", [], 0, 3, strict);
    expect(state.available).toBe(false);
    expect(state.reason).toBe("None left this half — buy one");
  });

  it("lets a bought use through once the free one is spent", () => {
    // Bought uses are paid for, so they do not expire at the break.
    const usage: ChipUsage[] = [{ chipId: "super_driver", round: 2 }];
    expect(chipAvailability("super_driver", usage, 1, 3, firstHalf).available).toBe(true);
  });

  it("treats a season with no break as a single half", () => {
    const usage: ChipUsage[] = [{ chipId: "super_driver", round: 2 }];
    expect(chipAvailability("super_driver", usage, 0, 9, null).available).toBe(false);
  });
});
