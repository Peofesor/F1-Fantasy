import { BLIND_BET_PREMIUM, listedOdds, type MarketId } from "./betting";

/**
 * Odds priced per selection, not per market.
 *
 * A fixed price per market cannot work when the player picks who it applies to.
 * Measured across 2025–26, every market paid more than it should have to
 * somebody: "Reaches Q3" at 1.6 was 95% certain on Norris, and "Does not
 * finish" at 4.0 came in 92% of the time on Bottas — a near-guaranteed
 * quadrupling. Eight of nine markets were profitable at listed odds, and all
 * nine were once the pre-qualifying bonus applied.
 *
 * So the price comes from how often that driver has actually done the thing.
 * A market only has to be interesting to be worth betting on now; it no longer
 * has to be uniformly hard across a field where it never was.
 */

/**
 * The house's cut, applied to every price.
 *
 * At 0.9 a perfectly-judged bet returns 90% of its true worth, so betting is a
 * slow drain rather than a way to print cost cap — the cap is meant to be
 * earned by picking a good team. It is small enough that a genuinely good read
 * still pays.
 *
 * The blind-bet premium sits on top of it, so what a player actually gets back
 * is between 0.90 and HOUSE_MARGIN × BLIND_BET_PREMIUM = 0.99 per unit staked,
 * thinnest on the long shots. That was always true — the premium used to be
 * added at settlement, where this number could not see it — and folding it into
 * the quote is what makes it visible here.
 */
export const HOUSE_MARGIN = 0.9;

/**
 * Odds are the profit per unit staked, not the total returned.
 *
 * A winning bet returns `stake × (1 + odds)`, so 3.0 trebles the stake on top
 * of getting it back. Pricing them as gross decimal odds (1/rate) while paying
 * them as net was worth an extra stake on every winning bet: a 93%-certain pick
 * priced at 1.1 nearly doubled the money instead of returning about what went
 * in.
 */
export const MAX_ODDS = 12;

/**
 * The smallest profit offered. Below this, the selection is not offered at all.
 *
 * There is no price at which a near-certainty can be sold. Expected value is
 * `rate × (1 + odds)`, so once a selection comes in more often than
 * HOUSE_MARGIN, every positive price pays more than the outcome is worth —
 * and clamping the negative fair price up to a floor is exactly how the house
 * loses money. Ten-from-ten selections were being offered at 0.01 for an
 * expected 1.01 per unit staked: Hamilton in the top six, Antonelli into Q3,
 * Stroll retiring, a safety car appearing. Free money, in the four safest bets
 * on the board.
 *
 * So a selection that likely is withdrawn rather than shaded. That is honest in
 * a way a token price is not — "we won't take that bet" says what 0.01x only
 * hints at.
 */
export const MIN_ODDS = 0.05;

/**
 * Smoothing applied to a hit rate before it becomes a price.
 *
 * Without it, a driver who has gone 13 for 13 prices at infinity and one who
 * has never done a thing is unbackable. Adding a notional win and loss pulls
 * short histories toward even money and leaves long ones almost untouched:
 * 13/13 becomes 14/15, while 35/37 barely moves.
 */
export const SMOOTHING = 1;

export interface MarketRecord {
  /**
   * How often this selection has produced the outcome, weighted by how recent
   * each attempt was — so these are not whole numbers.
   */
  won: number;
  /** How many chances it has had, on the same weighting. */
  total: number;
}

/**
 * How far back a price looks: the last ten race weekends, and nothing before.
 *
 * A flat two-season count priced a driver on a career rather than on form —
 * Antonelli made the points in 11 of 13 rounds in 2026 but only 14 of 24 as a
 * rookie the year before, and the combined 68% offered odds on a driver who no
 * longer exists. This replaced an exponential decay that reached the same
 * numbers by a route nobody could check by hand: on that same case the decay
 * gave 0.34 and a flat ten-race window gives 0.29.
 *
 * A hard window is worth the small loss of smoothness because it is a rule a
 * player can verify. "The last ten races" can be counted on a results page;
 * "a half-life of ten races" cannot.
 */
export const ODDS_WINDOW_RACES = 10;

/**
 * Turns a record into the price offered on it, or null if it cannot be offered.
 *
 * A selection with no history at all falls back to the market's listed odds,
 * which is the best guess available before anyone has raced.
 */
export function oddsFor(marketId: MarketId, record: MarketRecord | undefined): number | null {
  if (!record || record.total === 0) return listedOdds(marketId);

  const observed = record.won / record.total;

  // Smoothing is for a record too short to trust — a driver two races into a
  // season, not one with a full window behind them. Applying it to a complete
  // window taxed the long shots for nothing: a genuine 10% pick was priced as
  // 17% and returned 0.54 per unit staked against the intended 0.9.
  const smoothed =
    record.total >= ODDS_WINDOW_RACES
      ? observed
      : (record.won + SMOOTHING) / (record.total + SMOOTHING * 2);

  // Smoothing pulls toward even money, which cuts both ways and only one of
  // them is safe. On a long shot it raises the assumed rate and shortens the
  // price, which protects the house. On a near-certainty it *lowers* the
  // assumed rate and lengthens the price, which is the house paying for its own
  // caution: four sprints from four became a notional five from six and was
  // offered at 0.08 on an outcome that had never once failed — an expected 1.08
  // per unit staked.
  //
  // Taking whichever rate is higher keeps the protection and drops the gift.
  // Since the price is HOUSE_MARGIN / rate - 1, a rate at or above the observed
  // one can never return more than HOUSE_MARGIN, whatever the record. That
  // holds for every market and every selection, which is what makes it worth
  // stating as a rule rather than checking case by case.
  const rate = Math.max(observed, smoothed);

  // The margin applies to the whole return, not only to the profit on top of
  // the stake. Taking it off the profit alone left the edge depending on how
  // likely the outcome was: a 70% pick returned 1.015 per unit staked and a
  // near-certainty 1.08, so the safest bets on the board were the profitable
  // ones. Priced against the full return, expected value is HOUSE_MARGIN
  // wherever you bet, which is what a house edge is supposed to mean.
  const offered = HOUSE_MARGIN / rate - 1;

  // Rounded down, and finely: at 0.1 steps a fair price of 0.075 became 0.1,
  // a third more than it was worth, which is enough to make a near-certain
  // outcome pay. Rounding is never allowed to move in the player's favour, so
  // the floor is checked after rounding rather than before — rounding a 0.048
  // up to the floor would reintroduce the same bug in miniature.
  const fair = Math.floor(Math.min(MAX_ODDS, offered) * 100) / 100;
  if (fair < MIN_ODDS) return null;

  // The blind-bet premium is part of the price rather than a bonus added when
  // the bet is settled, so the number quoted is the number paid. Applied after
  // the cap and after the withdrawal rule, so neither the longest price nor
  // which selections are on the board moves: this is the same money, said once
  // instead of twice.
  return Math.floor(fair * BLIND_BET_PREMIUM * 100) / 100;
}

/**
 * Total returned on a winning bet: the stake back plus winnings.
 *
 * Takes the odds that were agreed when the bet was placed rather than looking
 * them up now. Prices move as the season goes on, and a bet settles on the deal
 * that was struck, not on what the same bet would cost today.
 */
export function payoutAt(stake: number, odds: number): number {
  return Math.round(stake * (1 + odds) * 10) / 10;
}

/**
 * What a winning bet multiplies the stake by, for display.
 *
 * `odds` is the profit per unit staked, so a 0.28 price returns 1.28 times the
 * stake. Showing the stored number with an "x" beside it said the opposite —
 * "0.28x" reads as getting a quarter of your money back on a bet you won.
 *
 * `payoutAt` is the same arithmetic and stays the single source for the amount.
 */
export function grossMultiplier(odds: number): number {
  return Math.round((1 + odds) * 100) / 100;
}
