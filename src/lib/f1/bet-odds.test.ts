import { describe, expect, it } from "vitest";
import {
  grossMultiplier,
  HOUSE_MARGIN,
  MAX_ODDS,
  MIN_ODDS,
  ODDS_WINDOW_RACES,
  oddsFor,
  payoutAt,
} from "./bet-odds";
import { MARKETS, MARKET_LIST, PRE_QUALIFYING_BONUS } from "./betting";

/** What a stake is worth back on average, at these odds and this true rate. */
const expectedValue = (rate: number, odds: number, bonus = 1) => rate * (1 + odds * bonus);

/** The price, where there is one. Fails the test if the selection is withdrawn. */
const priceOf = (...args: Parameters<typeof oddsFor>) => {
  const odds = oddsFor(...args);
  expect(odds).not.toBeNull();
  return odds!;
};

describe("oddsFor", () => {
  it("falls back to the listed price when nothing is known", () => {
    expect(oddsFor("race_winner", undefined)).toBe(MARKETS.race_winner.odds);
    expect(oddsFor("race_winner", { won: 0, total: 0 })).toBe(MARKETS.race_winner.odds);
  });

  it("pays less the more often the selection has done it", () => {
    const often = priceOf("reached_q3", { won: 25, total: 37 });
    const rarely = priceOf("reached_q3", { won: 3, total: 37 });
    expect(often).toBeLessThan(rarely);
  });

  it("keeps the house edge on an even-money outcome", () => {
    // 50% true rate: fair profit is 1.0, so the offered price is the margin.
    const odds = priceOf("podium", { won: 100, total: 200 });
    expect(odds).toBeLessThanOrEqual(HOUSE_MARGIN);
    expect(expectedValue(0.5, odds)).toBeLessThan(1);
  });

  /**
   * The one property the whole module exists to hold.
   *
   * Every bug this pricing has had was a leak in it, and each was found in the
   * live data rather than here: the margin taken off the profit instead of the
   * return, a floor clamping a negative fair price up to something positive,
   * smoothing lengthening the price on an outcome that had never failed. Each
   * looked local and each produced the same result — the safest bets on the
   * board were the profitable ones.
   *
   * Sweeping every record a ten-race window can produce is cheap and catches
   * the next one wherever it is introduced.
   */
  it("never returns more than the house margin, at any record", () => {
    for (const market of MARKET_LIST) {
      for (let total = 1; total <= 40; total += 1) {
        for (let won = 0; won <= total; won += 1) {
          const odds = oddsFor(market.id, { won, total });
          // A withdrawn selection cannot be bet, so it cannot leak.
          if (odds === null) continue;

          const trueRate = won / total;
          expect(
            expectedValue(trueRate, odds),
            `${market.id} at ${won}/${total} priced ${odds}`,
          ).toBeLessThanOrEqual(HOUSE_MARGIN + 1e-9);
        }
      }
    }
  });

  it("takes the cases that used to be free money off the board", () => {
    // Both measured on 2025-26. Norris reached Q3 in 35 of 37 and Bottas
    // retired from 12 of 13, and at the old fixed prices those returned 1.51
    // and 3.69 times the stake. Both are past the margin, so neither has a
    // price at all now — they are not sold cheaper, they are not sold.
    expect(oddsFor("reached_q3", { won: 35, total: 37 })).toBeNull();
    expect(oddsFor("dnf", { won: 12, total: 13 })).toBeNull();
  });

  it("withdraws a selection too likely to price", () => {
    // A perfect record has no price: expected value is 1 + odds at any positive
    // number, so every offer is a gift. Four sprints from four was being sold
    // at 0.08 for an expected 1.08.
    expect(oddsFor("sprint_points", { won: 4, total: 4 })).toBeNull();
    expect(oddsFor("reached_q2", { won: 10, total: 10 })).toBeNull();
    // And so does one just short of certain, for the same reason: above the
    // margin there is no price that both attracts a bet and covers the risk.
    expect(oddsFor("reached_q2", { won: 39, total: 40 })).toBeNull();
  });

  it("still offers a selection the house can cover", () => {
    // The withdrawal rule has to stop somewhere short of "no bets at all": at
    // 70%, which is where the top drivers sit for a points finish, there is a
    // real price.
    const odds = priceOf("top_ten", { won: 7, total: 10 });
    expect(odds).toBeGreaterThanOrEqual(MIN_ODDS);
    expect(expectedValue(0.7, odds)).toBeLessThanOrEqual(HOUSE_MARGIN);
  });

  it("never rounds in the player's favour", () => {
    // A fair price of 0.075 became 0.1 under 0.1-step rounding — a third more
    // than it was worth, which is what made near-certain outcomes pay.
    for (const won of [18, 22, 26, 30]) {
      const odds = priceOf("reached_q3", { won, total: 37 });
      expect(odds).toBeLessThanOrEqual(HOUSE_MARGIN / (won / 37) - 1);
    }
  });

  it("caps what a long shot can pay", () => {
    expect(priceOf("race_winner", { won: 0, total: 400 })).toBeLessThanOrEqual(MAX_ODDS);
  });

  it("smooths a short history so a thin record is not read as certainty", () => {
    // Two from two is not evidence of a 100% driver, and pricing it as one
    // would make the market unbackable. Smoothing only ever shortens the price
    // though — it may not lengthen one, which is how it used to leak.
    const thin = priceOf("race_winner", { won: 0, total: 2 });
    const long = priceOf("race_winner", { won: 0, total: 100 });
    expect(thin).toBeLessThan(long);
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
    const odds = priceOf("podium", { won: 100, total: 200 });
    expect(expectedValue(0.5, odds, PRE_QUALIFYING_BONUS)).toBeLessThanOrEqual(1.05);
  });

  it("rounds to a tenth so a payout is a readable figure", () => {
    expect(payoutAt(3.33, 1.07, 1)).toBe(6.9);
  });
});

describe("the pricing window", () => {
  it("is short enough to be checked by hand", () => {
    // The value matters less than the fact that a player can count it on a
    // results page. An exponential decay reached similar numbers by a route
    // nobody could verify.
    expect(ODDS_WINDOW_RACES).toBeGreaterThanOrEqual(5);
    expect(ODDS_WINDOW_RACES).toBeLessThanOrEqual(15);
  });

  it("prices a driver on form rather than a career", () => {
    // Antonelli: 25 of 37 across two seasons, but 8 of the last 10.
    const career = { won: 25, total: 37 };
    const recent = { won: 8, total: 10 };
    expect(priceOf("top_ten", recent)).toBeLessThan(priceOf("top_ten", career));
  });
});

describe("grossMultiplier", () => {
  it("is what the stake comes back multiplied by", () => {
    // The display figure and the payout must agree: 10 at 0.28 returns 12.8,
    // so the multiplier shown beside it has to be 1.28 and not 0.28.
    expect(grossMultiplier(0.28)).toBeCloseTo(1.28, 5);
    expect(payoutAt(10, 0.28, 1)).toBeCloseTo(10 * grossMultiplier(0.28), 5);
  });

  it("never shows less than the stake on a bet that won", () => {
    // The old display did exactly that on every short price, which is the
    // whole reason this exists.
    for (const odds of [0.01, 0.05, 0.28, 1, 12]) {
      expect(grossMultiplier(odds)).toBeGreaterThan(1);
    }
  });

  it("carries the pre-qualifying bonus the way the payout does", () => {
    const stake = 10;
    const odds = 2;
    expect(payoutAt(stake, odds, PRE_QUALIFYING_BONUS)).toBeCloseTo(
      stake * grossMultiplier(odds, PRE_QUALIFYING_BONUS),
      5,
    );
  });
});
