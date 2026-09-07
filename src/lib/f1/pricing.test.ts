import { describe, expect, it } from "vitest";
import {
  CONSTRUCTOR_PRICE_BAND,
  DRIVER_PRICE_BAND,
  priceField,
  priceFromForm,
  rosterCost,
  rosterCostRange,
} from "./pricing";

describe("priceFromForm", () => {
  it("puts the strongest competitor at the top of the band", () => {
    expect(priceFromForm(100, 100)).toBeCloseTo(DRIVER_PRICE_BAND.max, 1);
  });

  it("puts a competitor with no form at the floor", () => {
    expect(priceFromForm(0, 100)).toBeCloseTo(DRIVER_PRICE_BAND.min, 1);
  });

  it("prices everyone at the floor when nobody has scored", () => {
    // The very start of the dataset, before any window has content.
    expect(priceFromForm(0, 0)).toBeCloseTo(DRIVER_PRICE_BAND.min, 1);
  });

  it("compresses the top and spreads the midfield", () => {
    // F1 points are heavily top-weighted, so a linear map would bunch everyone
    // below the leader near the floor. At half the leader's points a driver
    // should sit well above the midpoint of the band.
    const midfield = priceFromForm(50, 100);
    const bandMidpoint = (DRIVER_PRICE_BAND.min + DRIVER_PRICE_BAND.max) / 2;
    expect(midfield).toBeGreaterThan(bandMidpoint);
  });

  it("is monotonic in form", () => {
    expect(priceFromForm(60, 100)).toBeGreaterThan(priceFromForm(30, 100));
  });

  it("clamps form above the maximum", () => {
    expect(priceFromForm(150, 100)).toBeCloseTo(DRIVER_PRICE_BAND.max, 1);
  });

  it("honours a different band", () => {
    expect(priceFromForm(100, 100, CONSTRUCTOR_PRICE_BAND)).toBeCloseTo(
      CONSTRUCTOR_PRICE_BAND.max,
      1,
    );
  });
});

describe("priceField", () => {
  it("prices relative to the best in the field, not an absolute scale", () => {
    // A low-scoring window must still produce a full price spread, otherwise
    // everyone would be cheap after a quiet run of races.
    const lowScoring = priceField(["a", "b"], new Map([["a", 10], ["b", 5]]));
    const highScoring = priceField(["a", "b"], new Map([["a", 200], ["b", 100]]));
    expect(lowScoring.get("a")).toBeCloseTo(highScoring.get("a")!, 1);
  });

  it("gives the floor price to anyone absent from the form map", () => {
    const prices = priceField(["a", "unscored"], new Map([["a", 50]]));
    expect(prices.get("unscored")).toBeCloseTo(DRIVER_PRICE_BAND.min, 1);
  });

  it("prices every competitor asked for", () => {
    const prices = priceField(["a", "b", "c"], new Map([["a", 1]]));
    expect(prices.size).toBe(3);
  });
});

describe("rosterCost", () => {
  const driverPrices = new Map([["a", 20], ["b", 10], ["c", 5]]);
  const constructorPrices = new Map([["x", 15], ["y", 8]]);

  it("splits driver and constructor spend", () => {
    const cost = rosterCost(["a", "b"], ["x"], driverPrices, constructorPrices);
    expect(cost.drivers).toBeCloseTo(30, 1);
    expect(cost.constructors).toBeCloseTo(15, 1);
    expect(cost.total).toBeCloseTo(45, 1);
  });

  it("treats an unpriced pick as free rather than throwing", () => {
    const cost = rosterCost(["a", "unknown"], [], driverPrices, constructorPrices);
    expect(cost.total).toBeCloseTo(20, 1);
  });
});

describe("rosterCostRange", () => {
  it("reports a cheapest below the dearest", () => {
    const drivers = new Map(
      Array.from({ length: 20 }, (_, i) => [`d${i}`, 4 + i] as const),
    );
    const constructors = new Map(
      Array.from({ length: 10 }, (_, i) => [`c${i}`, 5 + i * 2] as const),
    );
    const top = Array.from({ length: 8 }, (_, i) => `d${19 - i}`);
    const mid = Array.from({ length: 12 }, (_, i) => `d${i}`);

    const { cheapest, dearest } = rosterCostRange(
      top,
      mid,
      [...constructors.keys()],
      drivers,
      constructors,
    );

    expect(cheapest).toBeLessThan(dearest);
    expect(cheapest).toBeGreaterThan(0);
  });
});
