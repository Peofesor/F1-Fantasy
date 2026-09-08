/**
 * Chips.
 *
 * Every chip starts with one free use per season and further uses must be
 * bought from the store.
 *
 * The weekly 2x nominations (one driver, one constructor) are deliberately not
 * chips. They were free and unlimited, so playing them was never a decision —
 * only something to forget. They live on the roster instead, and their effects
 * are still applied here through `ActiveChips`.
 *
 * There is no season limit on how often a chip may be played. The only limit is
 * per race: one chip of a kind per round, so two multipliers can never stack on
 * a single result. Beyond that, price is the brake — every extra use is bought
 * with the same cost cap that buys drivers, so spamming a strong chip means
 * fielding a weaker roster all season (spec §6).
 */

export type ChipId =
  | "super_driver"
  | "final_fix"
  | "autopilot"
  | "no_negative"
  | "wildcard"
  | "unlimited_cap";

export interface ChipDefinition {
  id: ChipId;
  name: string;
  description: string;
  /** Free uses granted at the start of a season. */
  freeUses: number;
  /** Cost cap charged per extra use bought from the store. */
  price: number;
  /** Whether the chip targets a specific driver or constructor on the roster. */
  target: "driver" | "constructor" | "none";
}

/**
 * Chip prices run 1–3 against a 160 cost cap.
 *
 * A single chip is therefore cheap — deliberately, since a chip you cannot
 * afford to use is just a menu item. The brake is repetition, not the one-off:
 * with no season limit, playing SuperDriver every remaining round of a
 * 23-round season costs 22 x 3 = 66, over a third of the budget, which is the
 * same as giving up a premium driver for the year. One chip is a small
 * decision; a habit is a large one.
 *
 * Within the range, strength sets the price: the 3x and the cap lift sit at 3,
 * the ones that change what you may pick at 2, and the safety net at 1.
 */
export const CHIPS: Record<ChipId, ChipDefinition> = {
  super_driver: {
    id: "super_driver",
    name: "SuperDriver",
    description: "Triples one driver's points for the round.",
    freeUses: 1,
    price: 3,
    target: "driver",
  },
  final_fix: {
    id: "final_fix",
    name: "Final Fix",
    description: "Change one roster slot after qualifying has run.",
    freeUses: 1,
    price: 2,
    target: "none",
  },
  autopilot: {
    id: "autopilot",
    name: "Autopilot",
    description: "Your highest-scoring driver is doubled automatically.",
    freeUses: 1,
    price: 2,
    target: "none",
  },
  no_negative: {
    id: "no_negative",
    name: "No Negative",
    description: "Negative points are cancelled across your whole roster.",
    freeUses: 1,
    price: 1,
    target: "none",
  },
  wildcard: {
    id: "wildcard",
    name: "Wildcard",
    description: "Unlimited free roster changes for this round.",
    freeUses: 1,
    price: 2,
    target: "none",
  },
  unlimited_cap: {
    id: "unlimited_cap",
    name: "Unlimited Cost Cap",
    description: "No spending limit this round. Tier requirements still apply.",
    freeUses: 1,
    price: 3,
    target: "none",
  },
};

export const CHIP_LIST = Object.values(CHIPS);

export interface ChipUsage {
  chipId: ChipId;
  round: number;
}

export interface ChipAvailability {
  chip: ChipDefinition;
  usedThisSeason: number;
  /** Free uses not yet spent. */
  freeRemaining: number;
  /** Extra uses bought and not yet spent. */
  purchasedRemaining: number;
  /** Whether it can be played this round at all. */
  available: boolean;
  /** Cost to play it now: zero while free or purchased uses remain. */
  costToPlay: number;
  reason?: string;
}

/**
 * Works out what a member can play this round.
 *
 * A chip already played this round cannot be played again — stacking two
 * multipliers on one race would produce swings far beyond anything the scoring
 * model is balanced for.
 */
export function chipAvailability(
  chipId: ChipId,
  usage: readonly ChipUsage[],
  purchased: number,
  round: number,
): ChipAvailability {
  const chip = CHIPS[chipId];
  const usedThisSeason = usage.filter((entry) => entry.chipId === chipId).length;
  const playedThisRound = usage.some(
    (entry) => entry.chipId === chipId && entry.round === round,
  );

  const freeRemaining = Math.max(0, chip.freeUses - usedThisSeason);
  const purchasedRemaining = Math.max(0, purchased - Math.max(0, usedThisSeason - chip.freeUses));

  let reason: string | undefined;
  if (playedThisRound) reason = "Already played this round";
  else if (freeRemaining === 0 && purchasedRemaining === 0) reason = "Buy another use first";

  return {
    chip,
    usedThisSeason,
    freeRemaining,
    purchasedRemaining,
    available: !playedThisRound && (freeRemaining > 0 || purchasedRemaining > 0),
    costToPlay: 0,
    reason,
  };
}

/** Whether another use of a chip may be bought. */
export function canPurchase(
  chipId: ChipId,
  usedThisSeason: number,
  purchased: number,
  balance: number,
): { allowed: boolean; price: number; reason?: string } {
  const chip = CHIPS[chipId];
  if (balance < chip.price) {
    return { allowed: false, price: chip.price, reason: "Not enough cost cap" };
  }
  void usedThisSeason;
  return { allowed: true, price: chip.price };
}

/**
 * A chip's state, flattened for rendering.
 *
 * Lives here rather than beside the panel component because the page is a
 * Server Component: anything it calls must not sit in a "use client" module,
 * and this is plain data-shaping with no React in it.
 */
export interface ChipRow {
  chipId: ChipId;
  name: string;
  description: string;
  price: number;
  target: "driver" | "constructor" | "none";
  usedThisSeason: number;
  freeRemaining: number;
  purchasedRemaining: number;
  available: boolean;
  reason?: string;
  playedThisRound: boolean;
  playedTarget?: string;
}

export function toChipRow(
  state: ChipAvailability,
  playedThisRound: boolean,
  playedTarget?: string,
): ChipRow {
  return {
    chipId: state.chip.id,
    name: state.chip.name,
    description: state.chip.description,
    price: state.chip.price,
    target: state.chip.target,
    usedThisSeason: state.usedThisSeason,
    freeRemaining: state.freeRemaining,
    purchasedRemaining: state.purchasedRemaining,
    available: state.available,
    reason: state.reason,
    playedThisRound,
    playedTarget,
  };
}

export interface ActiveChips {
  /** Driver nominated on the roster to score double. Not a chip. */
  turboDriverId?: string;
  /** Constructor nominated on the roster to score double. Not a chip. */
  konstruktorBoostId?: string;
  /** Driver whose score is tripled. */
  superDriverId?: string;
  /** Doubles whichever driver scored highest, chosen after the fact. */
  autopilot?: boolean;
  /** Cancels negative points across the roster. */
  noNegative?: boolean;
}

/**
 * Applies chip effects to a set of slot scores.
 *
 * Order matters and is deliberate: multipliers first, then No Negative. Applied
 * the other way round, doubling a −20 after cancelling it would reintroduce the
 * negative the chip was bought to prevent.
 *
 * Autopilot resolves last among the multipliers because it targets whichever
 * driver actually scored highest, which is only knowable once the round is
 * scored. It is skipped when an explicit multiplier already covers that driver,
 * so the two cannot compound on one result.
 */
export function applyChips(
  slots: readonly { slot: string; competitorId: string; points: number }[],
  chips: ActiveChips,
): { slot: string; competitorId: string; points: number }[] {
  let result = slots.map((slot) => ({ ...slot }));

  const multiply = (competitorId: string | undefined, factor: number) => {
    if (!competitorId) return;
    result = result.map((slot) =>
      slot.competitorId === competitorId ? { ...slot, points: slot.points * factor } : slot,
    );
  };

  multiply(chips.turboDriverId, 2);
  multiply(chips.konstruktorBoostId, 2);
  multiply(chips.superDriverId, 3);

  if (chips.autopilot) {
    const alreadyBoosted = new Set(
      [chips.turboDriverId, chips.superDriverId].filter(Boolean) as string[],
    );
    const candidates = result.filter(
      (slot) => slot.slot.startsWith("driver_") && !alreadyBoosted.has(slot.competitorId),
    );
    const best = candidates.reduce<typeof candidates[number] | null>(
      (top, slot) => (top === null || slot.points > top.points ? slot : top),
      null,
    );
    if (best && best.points > 0) multiply(best.competitorId, 2);
  }

  if (chips.noNegative) {
    result = result.map((slot) => ({ ...slot, points: Math.max(0, slot.points) }));
  }

  return result;
}
