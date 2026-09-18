import { describe, expect, it } from "vitest";
import {
  blendSignals,
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

describe("blendSignals", () => {
  const ids = ["hot", "steady", "faded", "nobody"];

  // A driver on a tear, one who has been there all year, one who was and has
  // stopped, and one who has never scored.
  const windowForm = new Map([
    ["hot", 60],
    ["steady", 40],
    ["faded", 2],
    ["nobody", 0],
  ]);
  const seasonForm = new Map([
    ["hot", 80],
    ["steady", 200],
    ["faded", 120],
    ["nobody", 0],
  ]);

  it("weights recent form above the season", () => {
    const blended = blendSignals(ids, windowForm, seasonForm);

    // hot leads the window outright (1.0) and has 80/200 of the season.
    expect(blended.get("hot")).toBeCloseTo(0.7 * 1 + 0.3 * 0.4, 5);
    // steady leads the season outright and has 40/60 of the window.
    expect(blended.get("steady")).toBeCloseTo(0.7 * (40 / 60) + 0.3 * 1, 5);
  });

  it("keeps the in-form driver ahead of the season's leader", () => {
    // The point of 70/30: what is happening now still decides the order.
    const blended = blendSignals(ids, windowForm, seasonForm);
    expect(blended.get("hot")!).toBeGreaterThan(blended.get("steady")!);
  });

  it("rescues a driver whose season the window has forgotten", () => {
    // Faded has 2 points in five races — on form alone, indistinguishable from
    // someone who has never scored. The season half is what separates them.
    const formOnly = blendSignals(ids, windowForm, new Map(), 0.7);
    expect(formOnly.get("faded")! - formOnly.get("nobody")!).toBeCloseTo(2 / 60, 5);

    const blended = blendSignals(ids, windowForm, seasonForm);
    expect(blended.get("faded")! - blended.get("nobody")!).toBeGreaterThan(0.15);
  });

  it("falls back to form alone before a season has any results", () => {
    // Round one. Scaling the form term back up keeps the field across the whole
    // band rather than squashing it into the bottom 70%.
    const blended = blendSignals(ids, windowForm, new Map());
    expect(blended.get("hot")).toBe(1);
    expect(blended.get("steady")).toBeCloseTo(40 / 60, 5);
  });

  it("gives everyone nothing when nobody has scored at all", () => {
    const blended = blendSignals(ids, new Map(), new Map());
    expect([...blended.values()]).toEqual([0, 0, 0, 0]);
  });

  it("is still ordered the same as price, since price maps it monotonically", () => {
    // The blend changes *what* is ranked, not that price follows the ranking.
    const blended = blendSignals(ids, windowForm, seasonForm);
    const prices = priceField(ids, blended);
    expect(prices.get("hot")!).toBeGreaterThan(prices.get("steady")!);
    expect(prices.get("steady")!).toBeGreaterThan(prices.get("faded")!);
    expect(prices.get("faded")!).toBeGreaterThan(prices.get("nobody")!);
  });
});
