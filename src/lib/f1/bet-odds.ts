import { MARKETS, type MarketId } from "./betting";

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
 * The smallest profit offered.
 *
 * Deliberately far below anything worth betting on. A floor set where a bet
 * stops being interesting (0.05) would round *up* a fair price of 0.048, and a
 * floor that pays more than the outcome is worth is the whole bug this pricing
 * exists to fix. A price this small is its own warning: it says plainly that
 * the outcome is close to certain and the bet is pointless.
 */
export const MIN_ODDS = 0.01;

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
  /** How often this selection has produced the outcome. */
  won: number;
  /** How many chances it has had. */
  total: number;
}

/**
 * Turns a record into the price offered on it.
 *
 * A selection with no history at all falls back to the market's listed odds,
 * which is the best guess available before anyone has raced.
 */
export function oddsFor(marketId: MarketId, record: MarketRecord | undefined): number {
  const listed = MARKETS[marketId].odds;
  if (!record || record.total === 0) return listed;

  const rate = (record.won + SMOOTHING) / (record.total + SMOOTHING * 2);
  // Fair profit on a unit stake: what the win pays beyond returning the stake.
  const fair = 1 / rate - 1;
  const offered = fair * HOUSE_MARGIN;

  // Rounded down, and finely: at 0.1 steps a fair price of 0.075 became 0.1,
  // a third more than it was worth, which is enough to make a near-certain
  // outcome pay. Rounding is never allowed to move in the player's favour.
  const capped = Math.min(MAX_ODDS, Math.max(MIN_ODDS, offered));
  return Math.floor(capped * 100) / 100;
}

/**
 * Total returned on a winning bet: the stake back plus winnings.
 *
 * Takes the odds that were agreed when the bet was placed rather than looking
 * them up now. Prices move as the season goes on, and a bet settles on the deal
 * that was struck, not on what the same bet would cost today.
 */
export function payoutAt(stake: number, odds: number, bonus: number): number {
  return Math.round(stake * (1 + odds * bonus) * 10) / 10;
}
