import type { Tier } from "./tiers";

/**
 * Roster composition rules.
 *
 * Kept pure and separate from both the UI and the database so the same rules
 * can be enforced in three places that must agree: live feedback while picking,
 * server-side validation before saving (a Server Action is reachable by direct
 * POST, so client validation guarantees nothing), and the database constraints
 * that back it all up.
 */

export const TOP_SLOTS = 3;
export const MID_SLOTS = 3;
export const CONSTRUCTOR_SLOTS = 2;

export interface RosterSelection {
  /** Drivers for the three top-bracket slots. */
  top: readonly string[];
  /** Drivers for the three mid-bracket slots. */
  mid: readonly string[];
  /** Unrestricted slot: any driver. Pays cost cap, scores no points. */
  backmarker: string | null;
  /** Two normally-scored constructors. */
  constructors: readonly string[];
  /** One constructor scored on its per-race placing. */
  reverseConstructor: string | null;
}

export interface RosterContext {
  tiers: ReadonlyMap<string, Tier>;
  driverPrices: ReadonlyMap<string, number>;
  constructorPrices: ReadonlyMap<string, number>;
  costCap: number;
}

export interface RosterValidation {
  errors: string[];
  /** Total spend, whether or not the selection is legal. */
  cost: number;
  /** Cap minus cost; negative means over budget. */
  remaining: number;
  complete: boolean;
  valid: boolean;
}

export const EMPTY_SELECTION: RosterSelection = {
  top: [],
  mid: [],
  backmarker: null,
  constructors: [],
  reverseConstructor: null,
};

/** Every driver on the roster, in slot order. */
export function selectedDrivers(selection: RosterSelection): string[] {
  return [
    ...selection.top,
    ...selection.mid,
    ...(selection.backmarker ? [selection.backmarker] : []),
  ];
}

export function selectedConstructors(selection: RosterSelection): string[] {
  return [
    ...selection.constructors,
    ...(selection.reverseConstructor ? [selection.reverseConstructor] : []),
  ];
}

export function rosterCostOf(
  selection: RosterSelection,
  context: RosterContext,
): number {
  const drivers = selectedDrivers(selection).reduce(
    (total, id) => total + (context.driverPrices.get(id) ?? 0),
    0,
  );
  const constructors = selectedConstructors(selection).reduce(
    (total, id) => total + (context.constructorPrices.get(id) ?? 0),
    0,
  );
  return Math.round((drivers + constructors) * 10) / 10;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated];
}

/**
 * Checks a selection against every composition rule.
 *
 * Reports all problems rather than stopping at the first, so a player fixing a
 * roster sees everything wrong with it at once instead of one issue per attempt.
 */
export function validateRoster(
  selection: RosterSelection,
  context: RosterContext,
): RosterValidation {
  const errors: string[] = [];

  if (selection.top.length !== TOP_SLOTS) {
    errors.push(`Pick ${TOP_SLOTS} top-bracket drivers (you have ${selection.top.length}).`);
  }
  if (selection.mid.length !== MID_SLOTS) {
    errors.push(`Pick ${MID_SLOTS} mid-bracket drivers (you have ${selection.mid.length}).`);
  }
  if (selection.backmarker === null) {
    errors.push("Pick a backmarker.");
  }
  if (selection.constructors.length !== CONSTRUCTOR_SLOTS) {
    errors.push(
      `Pick ${CONSTRUCTOR_SLOTS} constructors (you have ${selection.constructors.length}).`,
    );
  }
  if (selection.reverseConstructor === null) {
    errors.push("Pick a reverse-scored constructor.");
  }

  // Tier membership. The backmarker slot is deliberately unrestricted.
  for (const driverId of selection.top) {
    if (context.tiers.get(driverId) !== "top") {
      errors.push(`${driverId} is not in the top bracket.`);
    }
  }
  for (const driverId of selection.mid) {
    if (context.tiers.get(driverId) !== "mid") {
      errors.push(`${driverId} is not in the mid bracket.`);
    }
  }

  for (const driverId of duplicates(selectedDrivers(selection))) {
    errors.push(`${driverId} is picked more than once.`);
  }
  for (const constructorId of duplicates(selectedConstructors(selection))) {
    errors.push(`${constructorId} is picked more than once.`);
  }

  const cost = rosterCostOf(selection, context);
  const remaining = Math.round((context.costCap - cost) * 10) / 10;
  if (remaining < 0) {
    errors.push(`Over budget by ${Math.abs(remaining).toFixed(1)}.`);
  }

  const complete =
    selection.top.length === TOP_SLOTS &&
    selection.mid.length === MID_SLOTS &&
    selection.backmarker !== null &&
    selection.constructors.length === CONSTRUCTOR_SLOTS &&
    selection.reverseConstructor !== null;

  return { errors, cost, remaining, complete, valid: errors.length === 0 };
}

/**
 * Which slot, if any, a driver may still be added to.
 *
 * Drives the picker UI: a driver already on the roster, or whose bracket is
 * full, cannot be added again.
 */
export function availableSlotFor(
  driverId: string,
  selection: RosterSelection,
  tiers: ReadonlyMap<string, Tier>,
): "top" | "mid" | "backmarker" | null {
  if (selectedDrivers(selection).includes(driverId)) return null;

  const tier = tiers.get(driverId);
  if (tier === "top" && selection.top.length < TOP_SLOTS) return "top";
  if (tier === "mid" && selection.mid.length < MID_SLOTS) return "mid";
  if (selection.backmarker === null) return "backmarker";
  return null;
}
