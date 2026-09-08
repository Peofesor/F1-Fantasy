/**
 * Tier assignment.
 *
 * A driver's tier decides which roster slot they can fill: the top 8 form the
 * top bracket, everyone else the mid bracket. The backmarker slot is
 * unrestricted, so only these two brackets are enforced.
 *
 * Ordering comes from points scored in the last 5 race weekends rather than
 * current-season standings. Standings cannot rank anyone at round one — the
 * whole field is on zero points and formally unranked — and early standings are
 * close to noise besides: measured on 2025, the top 6 after round 1 matched the
 * season-final top 6 only 3 of 6 times, reaching 6/6 only by round 8. Since
 * tier changes auto-swap a player's driver without their consent, churning on
 * that noise would be actively hostile.
 */

export type Tier = "top" | "mid";

/** Default bracket size. The mid bracket is simply everyone below it. */
export const TOP_BRACKET_SIZE = 8;

/**
 * Constructors in the top bracket.
 *
 * Four of roughly eleven, mirroring how the field actually splits: a handful of
 * teams win, the rest race each other. One top and one mid slot then force a
 * genuine choice rather than letting a roster hold the two best teams.
 */
export const TOP_CONSTRUCTOR_BRACKET_SIZE = 4;

/** How many race weekends the tier ordering looks back over. */
export const ROLLING_WINDOW_ROUNDS = 5;

export interface RoundKey {
  season: number;
  round: number;
}

/** One driver's points from one race weekend. */
export interface RoundPoints extends RoundKey {
  driverId: string;
  points: number;
}

/** Ascending rank — 1 is best. Used to break ties and to place drivers with no history. */
export type SeedRanks = ReadonlyMap<string, number>;

function compareRounds(a: RoundKey, b: RoundKey): number {
  return a.season - b.season || a.round - b.round;
}

function isAtOrBefore(entry: RoundKey, cutoff: RoundKey): boolean {
  return compareRounds(entry, cutoff) <= 0;
}

/**
 * Sums each driver's points across the most recent race weekends up to and
 * including `through`.
 *
 * The window deliberately crosses the season boundary: at the start of a season
 * it therefore reflects the end of the previous one, which is both a reasonable
 * estimate of current form and the reason no round-one special case is needed.
 * Fewer than `windowSize` weekends available (early in the dataset) simply means
 * a shorter window rather than an error.
 */
export function rollingWindowPoints(
  entries: readonly RoundPoints[],
  through: RoundKey,
  windowSize: number = ROLLING_WINDOW_ROUNDS,
): Map<string, number> {
  const eligible = entries.filter((entry) => isAtOrBefore(entry, through));

  const roundKeys = [...new Set(eligible.map((entry) => `${entry.season}:${entry.round}`))]
    .map((key) => {
      const [season, round] = key.split(":").map(Number);
      return { season, round };
    })
    .sort((a, b) => compareRounds(b, a))
    .slice(0, windowSize);

  const inWindow = new Set(roundKeys.map((key) => `${key.season}:${key.round}`));

  const totals = new Map<string, number>();
  for (const entry of eligible) {
    if (!inWindow.has(`${entry.season}:${entry.round}`)) continue;
    totals.set(entry.driverId, (totals.get(entry.driverId) ?? 0) + entry.points);
  }
  return totals;
}

/**
 * Builds seed ranks used to break ties and to place drivers with no scoring
 * history.
 *
 * A driver who raced last season seeds from their final championship position.
 * Rookies and returning drivers — roughly three a season — have none, so they
 * seed from their team's final constructor position instead. Placing them at
 * the bottom would be wrong in both directions: a rookie in a fast car is not a
 * backmarker, and pricing them as one would let players buy a quick car
 * cheaply.
 *
 * The constructor position is doubled to convert a team rank into a comparable
 * driver rank, since each team fields two drivers: the 4th team's rookie seeds
 * around 8th, just inside the top bracket.
 */
export function buildSeedRanks(
  priorDriverStandings: readonly { driverId: string; position: number | null }[],
  priorConstructorStandings: readonly { constructorId: string; position: number | null }[],
  teamByDriver: ReadonlyMap<string, string>,
): Map<string, number> {
  const seeds = new Map<string, number>();

  for (const standing of priorDriverStandings) {
    if (standing.position !== null) seeds.set(standing.driverId, standing.position);
  }

  const constructorRank = new Map<string, number>();
  for (const standing of priorConstructorStandings) {
    if (standing.position !== null) constructorRank.set(standing.constructorId, standing.position);
  }

  // Anything beyond the known field sorts last but stays deterministic.
  const unknownRank = Math.max(seeds.size, constructorRank.size * 2) + 100;

  for (const [driverId, constructorId] of teamByDriver) {
    if (seeds.has(driverId)) continue;
    const teamRank = constructorRank.get(constructorId);
    seeds.set(driverId, teamRank === undefined ? unknownRank : teamRank * 2);
  }

  return seeds;
}

/**
 * Orders drivers for tier assignment: most points first, ties broken by seed,
 * then by id so the result never depends on input order.
 *
 * Drivers with no points fall below every scoring driver automatically, since
 * their total is zero.
 */
export function orderDrivers(
  driverIds: readonly string[],
  points: ReadonlyMap<string, number>,
  seeds: SeedRanks,
): string[] {
  const unseeded = Number.MAX_SAFE_INTEGER;
  return [...driverIds].sort((a, b) => {
    const pointsDelta = (points.get(b) ?? 0) - (points.get(a) ?? 0);
    if (pointsDelta !== 0) return pointsDelta;

    const seedDelta = (seeds.get(a) ?? unseeded) - (seeds.get(b) ?? unseeded);
    if (seedDelta !== 0) return seedDelta;

    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Assigns every driver a tier. The first `topSize` in the ordering form the top
 * bracket; the remainder are mid.
 */
export function assignTiers(
  driverIds: readonly string[],
  points: ReadonlyMap<string, number>,
  seeds: SeedRanks,
  topSize: number = TOP_BRACKET_SIZE,
): Map<string, Tier> {
  const ordered = orderDrivers(driverIds, points, seeds);
  const tiers = new Map<string, Tier>();
  ordered.forEach((driverId, index) => {
    tiers.set(driverId, index < topSize ? "top" : "mid");
  });
  return tiers;
}

/**
 * Works out which drivers swapped brackets between two orderings, pairing each
 * demotion with the promotion that displaced it.
 *
 * This drives the auto-swap rule: a roster holding a demoted driver has them
 * replaced 1-for-1 by their counterpart, so the roster never becomes invalid
 * and the player is never asked to fix something outside their control.
 *
 * Pairing follows rank, not name: the highest-placed departing driver is
 * matched with the highest-placed arriving one. This takes the full orderings
 * rather than tier maps precisely so that it can. Pairing alphabetically would
 * decide arbitrarily which replacement a player receives when two drivers swap
 * out at once, which is a real fairness problem given the swap is involuntary.
 */
export function tierSwaps(
  previousOrder: readonly string[],
  currentOrder: readonly string[],
  topSize: number = TOP_BRACKET_SIZE,
): { demoted: string; promoted: string }[] {
  const wasTop = new Set(previousOrder.slice(0, topSize));
  const isTop = new Set(currentOrder.slice(0, topSize));

  // Ordered by previous standing: whoever ranked highest before comes first.
  const demoted = previousOrder.filter(
    (driverId) => wasTop.has(driverId) && !isTop.has(driverId),
  );

  // Ordered by current standing, so the pairing matches like for like.
  const promoted = currentOrder.filter(
    (driverId) => isTop.has(driverId) && !wasTop.has(driverId) && previousOrder.includes(driverId),
  );

  return demoted
    .slice(0, Math.min(demoted.length, promoted.length))
    .map((driverId, index) => ({ demoted: driverId, promoted: promoted[index] }));
}
