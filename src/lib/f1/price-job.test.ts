import { describe, expect, it } from "vitest";
import { pricesForRound } from "./price-job";
import { DRIVER_PRICE_BAND } from "./pricing";
import type { RoundPoints } from "./tiers";

function entry(season: number, round: number, driverId: string, points: number): RoundPoints {
  return { season, round, driverId, points };
}

describe("pricesForRound", () => {
  const drivers = ["fast", "slow"];

  it("does not let a round's own result influence its price", () => {
    // The decisive property: a roster is picked before the race, so the price
    // must be knowable beforehand. "slow" wins the round being priced, which
    // must not make them expensive for that same round.
    const results = [
      entry(2026, 1, "fast", 25),
      entry(2026, 1, "slow", 0),
      entry(2026, 2, "fast", 0),
      entry(2026, 2, "slow", 25),
    ];

    const priced = pricesForRound(results, results, { season: 2026, round: 2 }, drivers, []);
    expect(priced.driverPrices.get("fast")).toBeCloseTo(DRIVER_PRICE_BAND.max, 1);
    expect(priced.driverPrices.get("slow")).toBeCloseTo(DRIVER_PRICE_BAND.min, 1);
  });

  it("reflects results from earlier rounds", () => {
    const results = [entry(2026, 1, "fast", 25), entry(2026, 1, "slow", 1)];
    const priced = pricesForRound(results, results, { season: 2026, round: 2 }, drivers, []);
    expect(priced.driverPrices.get("fast")).toBeGreaterThan(priced.driverPrices.get("slow")!);
  });

  it("prices everyone at the floor when nothing precedes the round", () => {
    // The first round in the dataset: no form exists to tell anyone apart.
    const results = [entry(2026, 1, "fast", 25)];
    const priced = pricesForRound(results, results, { season: 2026, round: 1 }, drivers, []);
    expect(priced.driverPrices.get("fast")).toBeCloseTo(DRIVER_PRICE_BAND.min, 1);
    expect(priced.driverPrices.get("slow")).toBeCloseTo(DRIVER_PRICE_BAND.min, 1);
  });

  it("carries form across a season boundary into round one", () => {
    // This is why a new season does not reset everyone to the floor.
    const results = [
      entry(2025, 24, "fast", 25),
      entry(2025, 24, "slow", 0),
    ];
    const priced = pricesForRound(results, results, { season: 2026, round: 1 }, drivers, []);
    expect(priced.driverPrices.get("fast")).toBeGreaterThan(priced.driverPrices.get("slow")!);
  });

  it("prices constructors from their own results", () => {
    const driverResults = [entry(2026, 1, "fast", 25)];
    const constructorResults = [entry(2026, 1, "goodteam", 25), entry(2026, 1, "badteam", 0)];
    const priced = pricesForRound(
      driverResults,
      constructorResults,
      { season: 2026, round: 2 },
      drivers,
      ["goodteam", "badteam"],
    );
    expect(priced.constructorPrices.get("goodteam")).toBeGreaterThan(
      priced.constructorPrices.get("badteam")!,
    );
  });

  it("returns the round it priced", () => {
    const priced = pricesForRound([], [], { season: 2026, round: 7 }, drivers, []);
    expect(priced).toMatchObject({ season: 2026, round: 7 });
  });
});
