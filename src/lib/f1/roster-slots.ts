import type { RosterSelection } from "./roster";

/**
 * Turning a selection into the rows `roster_slots` stores.
 *
 * Kept out of the Server Action and free of any database handle so it can be
 * tested. It was inline before, and a mistake in it was invisible to every test
 * in the suite: `slot_index` was numbered per *list* rather than per slot type,
 * so the second constructor came out as index 2 while the table's
 * `roster_slot_index_within_type` constraint allows only 1 for its type. Saving
 * any roster failed on the database, and the only place that showed was a live
 * save behind a login.
 *
 * The rule the constraint encodes: only the two driver brackets hold more than
 * one slot, so only they count upwards. Everything else is a single slot at
 * index 1.
 */
export interface RosterSlotRow {
  roster_id: string;
  slot_type: string;
  slot_index: number;
  driver_id: string | null;
  constructor_id: string | null;
  price_paid: number;
}

/** Slot types that hold more than one pick and therefore number upwards. */
export const MULTI_SLOT_TYPES = ["driver_top", "driver_mid"] as const;

export function rosterSlotRows(
  rosterId: string,
  selection: RosterSelection,
  driverPrices: ReadonlyMap<string, number>,
  constructorPrices: ReadonlyMap<string, number>,
): RosterSlotRow[] {
  const driver = (slotType: string, driverId: string, index: number): RosterSlotRow => ({
    roster_id: rosterId,
    slot_type: slotType,
    slot_index: index,
    driver_id: driverId,
    constructor_id: null,
    price_paid: driverPrices.get(driverId) ?? 0,
  });

  const constructor = (slotType: string, constructorId: string): RosterSlotRow => ({
    roster_id: rosterId,
    slot_type: slotType,
    slot_index: 1,
    driver_id: null,
    constructor_id: constructorId,
    price_paid: constructorPrices.get(constructorId) ?? 0,
  });

  const rows: RosterSlotRow[] = [
    ...selection.top.map((driverId, index) => driver("driver_top", driverId, index + 1)),
    ...selection.mid.map((driverId, index) => driver("driver_mid", driverId, index + 1)),
  ];

  if (selection.backmarker) {
    rows.push(driver("driver_backmarker", selection.backmarker, 1));
  }

  // Each constructor bracket is a single slot, so both sit at index 1 and are
  // told apart by their type. Numbering them 1 and 2 was the bug.
  const [topConstructor, midConstructor] = selection.constructors;
  if (topConstructor) rows.push(constructor("constructor_top", topConstructor));
  if (midConstructor) rows.push(constructor("constructor_mid", midConstructor));
  if (selection.reverseConstructor) {
    rows.push(constructor("constructor_reverse", selection.reverseConstructor));
  }

  return rows;
}
