/**
 * Price derivation.
 *
 * No upstream source publishes F1 Fantasy prices, so prices are derived from
 * form rather than imported. The signal is the same rolling 5-race window that
 * drives tier assignment (see ./tiers.ts), deliberately: if price and tier were
 * computed from different signals they could disagree, and a driver could be
 * top-bracket while priced like a backmarker.
 *
 * Prices are recomputed after every race, and a player's cost cap moves with
 * the value of what they own (spec §2).
 */

export interface PriceBand {
  min: number;
  max: number;
}

/**
 * Driver prices span roughly the same spread as the official game relative to
 * the cost cap: the best driver costs about a quarter of a starting budget,
 * the cheapest about a twentieth.
 */
export const DRIVER_PRICE_BAND: PriceBand = { min: 4, max: 28 };

export const CONSTRUCTOR_PRICE_BAND: PriceBand = { min: 5, max: 26 };

/**
 * Curve applied to normalised form before mapping onto the price band.
 *
 * F1 points are heavily top-weighted (25 for a win against 1 for tenth), so
 * mapping them linearly would make the championship leader enormously expensive
 * and bunch everyone else near the floor. An exponent below 1 compresses the
 * top and spreads the midfield, which is where roster decisions actually get
 * made.
 */
export const PRICE_CURVE_EXPONENT = 0.5;

/** Prices are rounded to this granularity so they read cleanly. */
const PRICE_STEP = 0.1;

function roundToStep(value: number): number {
  return Math.round(value / PRICE_STEP) * PRICE_STEP;
}

/**
 * Maps one competitor's form onto a price.
 *
 * `maxPoints` is the highest form figure in the field, so pricing is relative:
 * the strongest competitor sits at the top of the band regardless of whether
 * the window covered a high- or low-scoring stretch.
 */
export function priceFromForm(
  points: number,
  maxPoints: number,
  band: PriceBand = DRIVER_PRICE_BAND,
  exponent: number = PRICE_CURVE_EXPONENT,
): number {
  if (maxPoints <= 0) return roundToStep(band.min);

  const normalised = Math.min(1, Math.max(0, points / maxPoints));
  const curved = Math.pow(normalised, exponent);
  return roundToStep(band.min + (band.max - band.min) * curved);
}

/**
 * Prices a whole field at once.
 *
 * Competitors absent from `form` scored nothing in the window and take the
 * floor price — correct for a driver who has not scored, and the reason a
 * rookie's tier seed (which uses their team) matters more than their price.
 */
export function priceField(
  competitorIds: readonly string[],
  form: ReadonlyMap<string, number>,
  band: PriceBand = DRIVER_PRICE_BAND,
  exponent: number = PRICE_CURVE_EXPONENT,
): Map<string, number> {
  const maxPoints = Math.max(0, ...competitorIds.map((id) => form.get(id) ?? 0));

  const prices = new Map<string, number>();
  for (const id of competitorIds) {
    prices.set(id, priceFromForm(form.get(id) ?? 0, maxPoints, band, exponent));
  }
  return prices;
}

export interface RosterCost {
  /** 3 top-bracket drivers, 3 mid, 1 backmarker. */
  drivers: number;
  /** 2 normal constructors plus 1 reverse-scored. */
  constructors: number;
  total: number;
}

/**
 * Costs a legal roster shape from a chosen set of picks.
 *
 * Used to check that the price bands and the starting cost cap actually admit a
 * legal roster — a formula that prices the cheapest legal team above the cap
 * would make the game unplayable from round one.
 */
export function rosterCost(
  driverPicks: readonly string[],
  constructorPicks: readonly string[],
  driverPrices: ReadonlyMap<string, number>,
  constructorPrices: ReadonlyMap<string, number>,
): RosterCost {
  const sum = (ids: readonly string[], prices: ReadonlyMap<string, number>) =>
    ids.reduce((total, id) => total + (prices.get(id) ?? 0), 0);

  const drivers = sum(driverPicks, driverPrices);
  const constructors = sum(constructorPicks, constructorPrices);
  return {
    drivers: roundToStep(drivers),
    constructors: roundToStep(constructors),
    total: roundToStep(drivers + constructors),
  };
}

/**
 * Cheapest and dearest legal rosters, given the tier split.
 *
 * The cheapest must fit the cost cap or the game cannot start; the dearest
 * should exceed it, since a roster of every best pick being affordable would
 * remove the trade-off the budget exists to create.
 */
export function rosterCostRange(
  topBracket: readonly string[],
  midBracket: readonly string[],
  constructorIds: readonly string[],
  driverPrices: ReadonlyMap<string, number>,
  constructorPrices: ReadonlyMap<string, number>,
): { cheapest: number; dearest: number } {
  const byPrice = (prices: ReadonlyMap<string, number>) => (a: string, b: string) =>
    (prices.get(a) ?? 0) - (prices.get(b) ?? 0);

  const top = [...topBracket].sort(byPrice(driverPrices));
  const mid = [...midBracket].sort(byPrice(driverPrices));
  const cons = [...constructorIds].sort(byPrice(constructorPrices));

  // The backmarker slot is unrestricted, so it may be filled from any driver.
  const allDrivers = [...topBracket, ...midBracket].sort(byPrice(driverPrices));

  const cheapestBackmarker = allDrivers.find(
    (id) => !top.slice(0, 3).includes(id) && !mid.slice(0, 3).includes(id),
  );
  const dearestBackmarker = [...allDrivers]
    .reverse()
    .find((id) => !top.slice(-3).includes(id) && !mid.slice(-3).includes(id));

  const cheapest = rosterCost(
    [...top.slice(0, 3), ...mid.slice(0, 3), ...(cheapestBackmarker ? [cheapestBackmarker] : [])],
    cons.slice(0, 3),
    driverPrices,
    constructorPrices,
  ).total;

  const dearest = rosterCost(
    [...top.slice(-3), ...mid.slice(-3), ...(dearestBackmarker ? [dearestBackmarker] : [])],
    cons.slice(-3),
    driverPrices,
    constructorPrices,
  ).total;

  return { cheapest, dearest };
}
