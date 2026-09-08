import { describe, expect, it } from "vitest";
import { rosterSlotRows } from "./roster-slots";
import type { RosterSelection } from "./roster";

const driverPrices = new Map([
  ["t1", 25], ["t2", 24], ["t3", 23],
  ["m1", 10], ["m2", 9], ["m3", 8], ["m4", 5],
]);
const constructorPrices = new Map([["c1", 20], ["c2", 15], ["c3", 6]]);

const legal: RosterSelection = {
  top: ["t1", "t2", "t3"],
  mid: ["m1", "m2", "m3"],
  backmarker: "m4",
  constructors: ["c1", "c2"],
  reverseConstructor: "c3",
  topCaptainId: "t1",
  midCaptainId: "m1",
};

const rows = () => rosterSlotRows("roster-1", legal, driverPrices, constructorPrices);

describe("rosterSlotRows", () => {
  it("writes one row per slot", () => {
    expect(rows()).toHaveLength(10);
  });

  it("keeps every slot_index inside what the table's check constraint allows", () => {
    // This is the constraint, restated: only the driver brackets hold more
    // than one slot. Numbering the second constructor 2 made every save fail
    // on the database, and no test noticed because the numbering lived inside
    // the Server Action.
    for (const row of rows()) {
      if (row.slot_type === "driver_top" || row.slot_type === "driver_mid") {
        expect(row.slot_index).toBeGreaterThanOrEqual(1);
        expect(row.slot_index).toBeLessThanOrEqual(3);
      } else {
        expect(row.slot_index).toBe(1);
      }
    }
  });

  it("puts both constructors at index 1, told apart by type", () => {
    const constructors = rows().filter((row) => row.constructor_id !== null);
    expect(constructors.map((row) => row.slot_type)).toEqual([
      "constructor_top",
      "constructor_mid",
      "constructor_reverse",
    ]);
    expect(constructors.every((row) => row.slot_index === 1)).toBe(true);
  });

  it("numbers the driver brackets 1..3 without repeating within a type", () => {
    for (const type of ["driver_top", "driver_mid"]) {
      const indexes = rows()
        .filter((row) => row.slot_type === type)
        .map((row) => row.slot_index);
      expect(indexes).toEqual([1, 2, 3]);
    }
  });

  it("gives a driver slot a driver and a constructor slot a constructor", () => {
    // The occupant-matches-type constraint, restated.
    for (const row of rows()) {
      if (row.slot_type.startsWith("driver")) {
        expect(row.driver_id).not.toBeNull();
        expect(row.constructor_id).toBeNull();
      } else {
        expect(row.constructor_id).not.toBeNull();
        expect(row.driver_id).toBeNull();
      }
    }
  });

  it("prices each row from the round's price list", () => {
    const byId = new Map(rows().map((row) => [row.driver_id ?? row.constructor_id, row.price_paid]));
    expect(byId.get("t1")).toBe(25);
    expect(byId.get("c3")).toBe(6);
  });

  it("prices an unknown pick at zero rather than crashing", () => {
    const [row] = rosterSlotRows(
      "roster-1",
      { ...legal, top: ["ghost"], mid: [], backmarker: null, constructors: [], reverseConstructor: null },
      driverPrices,
      constructorPrices,
    );
    expect(row.price_paid).toBe(0);
  });

  it("skips slots that are not filled yet", () => {
    const partial = rosterSlotRows(
      "roster-1",
      { ...legal, backmarker: null, reverseConstructor: null },
      driverPrices,
      constructorPrices,
    );
    expect(partial).toHaveLength(8);
    expect(partial.some((row) => row.slot_type === "driver_backmarker")).toBe(false);
  });

  it("carries the roster id onto every row", () => {
    expect(rows().every((row) => row.roster_id === "roster-1")).toBe(true);
  });
});
