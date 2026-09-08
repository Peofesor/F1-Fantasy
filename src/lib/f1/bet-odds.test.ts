import { describe, expect, it } from "vitest";
import {
  HOUSE_MARGIN,
  MAX_ODDS,
  oddsFor,
  payoutAt,
  RECENCY_HALF_LIFE_RACES,
  recencyWeight,
} from "./bet-odds";
import { MARKETS, PRE_QUALIFYING_BONUS } from "./betting";

/** What a stake is worth back on average, at these odds and this true rate. */
const expectedValue = (rate: number, odds: number, bonus = 1) => rate * (1 + odds * bonus);

describe("oddsFor", () => {
  it("falls back to the listed price when nothing is known", () => {
    expect(oddsFor("race_winner", undefined)).toBe(MARKETS.race_winner.odds);
    expect(oddsFor("race_winner", { won: 0, total: 0 })).toBe(MARKETS.race_winner.odds);
  });

  it("pays less the more often the selection has done it", () => {
    const often = oddsFor("reached_q3", { won: 35, total: 37 });
    const rarely = oddsFor("reached_q3", { won: 3, total: 37 });
    expect(often).toBeLessThan(rarely);
  });

  it("keeps the house edge on an even-money outcome", () => {
    // 50% true rate: fair profit is 1.0, so the offered price is the margin.
    const odds = oddsFor("podium", { won: 100, total: 200 });
    expect(odds).toBeLessThanOrEqual(HOUSE_MARGIN);
    expect(expectedValue(0.5, odds)).toBeLessThan(1);
  });

  it("prices the cases that used to be free money below break-even", () => {
    // Both measured on 2025-26. At the old fixed prices these returned 1.51
    // and 3.69 times the stake; they must now cost more than they pay.
    const q3Norris = oddsFor("reached_q3", { won: 35, total: 37 });
    const dnfBottas = oddsFor("dnf", { won: 12, total: 13 });
    expect(expectedValue(35 / 37, q3Norris)).toBeLessThan(1.1);
    expect(expectedValue(12 / 13, dnfBottas)).toBeLessThan(1.1);
  });

  it("never rounds in the player's favour", () => {
    // A fair price of 0.075 became 0.1 under 0.1-step rounding — a third more
    // than it was worth, which is what made near-certain outcomes pay.
    for (const won of [30, 33, 35, 36]) {
      const odds = oddsFor("reached_q3", { won, total: 37 });
      const smoothed = (won + 1) / (37 + 2);
      expect(odds).toBeLessThanOrEqual((1 / smoothed - 1) * HOUSE_MARGIN);
    }
  });

  it("caps what a long shot can pay", () => {
    expect(oddsFor("race_winner", { won: 0, total: 400 })).toBeLessThanOrEqual(MAX_ODDS);
  });

  it("never offers a negative or zero price", () => {
    expect(oddsFor("top_ten", { won: 400, total: 400 })).toBeGreaterThan(0);
  });

  it("smooths a short history toward even money", () => {
    // 13 from 13 would otherwise price at zero profit, on 13 races.
    const perfect = oddsFor("eliminated_q1", { won: 13, total: 13 });
    const longer = oddsFor("eliminated_q1", { won: 130, total: 130 });
    expect(perfect).toBeGreaterThan(longer);
  });
});

describe("payoutAt", () => {
  it("returns the stake plus the profit", () => {
    expect(payoutAt(10, 2, 1)).toBe(30);
    expect(payoutAt(10, 0.5, 1)).toBe(15);
  });

  it("applies the pre-qualifying bonus to the profit, not the stake", () => {
    // Bonusing the returned stake as well would pay for taking no risk.
    expect(payoutAt(10, 2, PRE_QUALIFYING_BONUS)).toBe(10 + 10 * 2 * PRE_QUALIFYING_BONUS);
  });

  it("keeps the bonus small enough not to undo the margin", () => {
    // At 1.5 the bonus made every market profitable however it was priced.
    const odds = oddsFor("podium", { won: 100, total: 200 });
    expect(expectedValue(0.5, odds, PRE_QUALIFYING_BONUS)).toBeLessThanOrEqual(1.05);
  });

  it("rounds to a tenth so a payout is a readable figure", () => {
    expect(payoutAt(3.33, 1.07, 1)).toBe(6.9);
  });
});

describe("recencyWeight", () => {
  it("counts the most recent race in full", () => {
    expect(recencyWeight(0)).toBe(1);
  });

  it("halves a result one half-life back", () => {
    expect(recencyWeight(RECENCY_HALF_LIFE_RACES)).toBeCloseTo(0.5, 5);
  });

  it("keeps falling without ever reaching zero", () => {
    expect(recencyWeight(100)).toBeGreaterThan(0);
    expect(recencyWeight(100)).toBeLessThan(recencyWeight(50));
  });

  it("treats a race from the future as current rather than negative", () => {
    expect(recencyWeight(-5)).toBe(1);
  });

  it("prices a driver on current form rather than a career", () => {
    // Antonelli: 14 of 24 as a rookie, 11 of 13 the year after. Flat counting
    // gave 68% and a price of 0.45 on an outcome he now manages 85% of the
    // time. Weighted, the recent season is what shows.
    const flat = { won: 25, total: 37 };
    const weighted = { won: 10.42, total: 13.78 };
    expect(oddsFor("top_ten", weighted)).toBeLessThan(oddsFor("top_ten", flat));
  });
});
