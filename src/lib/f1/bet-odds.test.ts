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
import { BLIND_BET_PREMIUM, listedOdds, MARKET_LIST } from "./betting";

/** What a stake is worth back on average, at these odds and this true rate. */
const expectedValue = (rate: number, odds: number) => rate * (1 + odds);

/**
 * The most a quoted price may be worth back.
 *
 * The house margin is taken on the fair price and the blind-bet premium is then
 * folded in, so what a player actually gets back tops out at the product of the
 * two — a hair under evens. That was always the real number; the premium used
 * to be added at settlement, where the price could not see it.
 */
const CEILING = HOUSE_MARGIN * BLIND_BET_PREMIUM;

/** The price, where there is one. Fails the test if the selection is withdrawn. */
const priceOf = (...args: Parameters<typeof oddsFor>) => {
  const odds = oddsFor(...args);
  expect(odds).not.toBeNull();
  return odds!;
};

describe("oddsFor", () => {
  it("falls back to the listed price when nothing is known", () => {
    expect(oddsFor("race_winner", undefined)).toBe(listedOdds("race_winner"));
    expect(oddsFor("race_winner", { won: 0, total: 0 })).toBe(listedOdds("race_winner"));
  });

  it("pays less the more often the selection has done it", () => {
    const often = priceOf("reached_q3", { won: 25, total: 37 });
    const rarely = priceOf("reached_q3", { won: 3, total: 37 });
    expect(often).toBeLessThan(rarely);
  });

  it("keeps the house edge on an even-money outcome", () => {
    // 50% true rate: fair profit is 1.0, so the offered price is the margin
    // with the blind premium folded in — and still short of paying for itself.
    const odds = priceOf("podium", { won: 100, total: 200 });
    expect(odds).toBeLessThanOrEqual(CEILING);
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
   *
   * The ceiling is the margin times the blind premium, which is what a bet
   * actually returns now that the premium is part of the price rather than
   * added at settlement. It is below 1 at every record, which is the property
   * that matters: no bet on the board pays for itself.
   */
  it("never returns more than the house can cover, at any record", () => {
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
          ).toBeLessThanOrEqual(CEILING + 1e-9);
          expect(
            expectedValue(trueRate, odds),
            `${market.id} at ${won}/${total} priced ${odds}`,
          ).toBeLessThan(1);
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
    expect(expectedValue(0.7, odds)).toBeLessThanOrEqual(CEILING);
  });

  it("never rounds in the player's favour", () => {
    // A fair price of 0.075 became 0.1 under 0.1-step rounding — a third more
    // than it was worth, which is what made near-certain outcomes pay.
    for (const won of [18, 22, 26, 30]) {
      const odds = priceOf("reached_q3", { won, total: 37 });
      expect(odds).toBeLessThanOrEqual((HOUSE_MARGIN / (won / 37) - 1) * BLIND_BET_PREMIUM);
    }
  });

  it("caps what a long shot can pay", () => {
    expect(priceOf("race_winner", { won: 0, total: 400 })).toBeLessThanOrEqual(
      MAX_ODDS * BLIND_BET_PREMIUM,
    );
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
    expect(payoutAt(10, 2)).toBe(30);
    expect(payoutAt(10, 0.5)).toBe(15);
  });

  it("carries the premium on the profit, not on the stake", () => {
    // The premium lives in the price now, so this is a property of `oddsFor`
    // rather than of the payout: premiuming the returned stake as well would
    // pay a player for taking no risk.
    const fair = 2;
    const quoted = fair * BLIND_BET_PREMIUM;
    expect(payoutAt(10, quoted)).toBeCloseTo(10 + 10 * fair * BLIND_BET_PREMIUM, 5);
  });

  it("keeps the premium small enough not to undo the margin", () => {
    // At 1.5 it made every market profitable however it was priced.
    const odds = priceOf("podium", { won: 100, total: 200 });
    expect(expectedValue(0.5, odds)).toBeLessThanOrEqual(1);
  });

  it("rounds to a tenth so a payout is a readable figure", () => {
    expect(payoutAt(3.33, 1.07)).toBe(6.9);
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
    expect(payoutAt(10, 0.28)).toBeCloseTo(10 * grossMultiplier(0.28), 5);
  });

  it("never shows less than the stake on a bet that won", () => {
    // The old display did exactly that on every short price, which is the
    // whole reason this exists.
    for (const odds of [0.01, 0.05, 0.28, 1, 12]) {
      expect(grossMultiplier(odds)).toBeGreaterThan(1);
    }
  });

  it("agrees with the payout at a quoted price", () => {
    // The two are shown side by side — "10 × 3.20 = 32.0" — so they have to be
    // the same arithmetic on the same number.
    const stake = 10;
    const odds = priceOf("race_winner", { won: 3, total: 10 });
    expect(payoutAt(stake, odds)).toBeCloseTo(stake * grossMultiplier(odds), 5);
  });
});
