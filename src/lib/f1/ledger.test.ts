import { describe, expect, it } from "vitest";
import {
  backmarkerPayoutEntry,
  EXTRA_CHANGE_FEE,
  FREE_CHANGES_PER_ROUND,
  ledgerBalance,
  priceDriftEntries,
  rosterChangeEntries,
  spareCap,
  transferFeeEntries,
} from "./ledger";

describe("ledgerBalance", () => {
  it("sums signed entries", () => {
    expect(ledgerBalance([{ amount: 130 }, { amount: -25 }, { amount: 3.5 }])).toBeCloseTo(108.5, 1);
  });

  it("is zero for an empty ledger", () => {
    expect(ledgerBalance([])).toBe(0);
  });
});

describe("priceDriftEntries", () => {
  const previous = new Map([["riser", 20], ["faller", 20], ["flat", 20]]);
  const current = new Map([["riser", 22.5], ["faller", 18], ["flat", 20]]);

  it("credits a rise", () => {
    const [entry] = priceDriftEntries("m", 2026, 5, ["riser"], previous, current);
    expect(entry.amount).toBeCloseTo(2.5, 1);
    expect(entry.reason).toBe("price_change");
  });

  it("charges a fall symmetrically", () => {
    // A one-way ratchet would remove any downside to a pick whose value craters.
    const [entry] = priceDriftEntries("m", 2026, 5, ["faller"], previous, current);
    expect(entry.amount).toBeCloseTo(-2, 1);
  });

  it("ignores an unchanged price", () => {
    expect(priceDriftEntries("m", 2026, 5, ["flat"], previous, current)).toEqual([]);
  });

  it("ignores a competitor missing from either round", () => {
    expect(priceDriftEntries("m", 2026, 5, ["ghost"], previous, current)).toEqual([]);
  });

  it("records the movement in the note so the entry explains itself", () => {
    const [entry] = priceDriftEntries("m", 2026, 5, ["riser"], previous, current);
    expect(entry.note).toContain("20.0");
    expect(entry.note).toContain("22.5");
  });
});

describe("rosterChangeEntries", () => {
  const prices = new Map([["kept", 10], ["out", 12], ["in", 15]]);

  it("records a swap as a sale and a purchase, not a net figure", () => {
    const entries = rosterChangeEntries("m", 2026, 5, ["kept", "out"], ["kept", "in"], prices, "driver");
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.reason === "driver_sale")?.amount).toBeCloseTo(12, 1);
    expect(entries.find((e) => e.reason === "driver_purchase")?.amount).toBeCloseTo(-15, 1);
  });

  it("charges nothing when the roster is unchanged", () => {
    expect(rosterChangeEntries("m", 2026, 5, ["kept"], ["kept"], prices, "driver")).toEqual([]);
  });

  it("values a sale at the current price, not what was paid", () => {
    // This is what makes holding a riser profitable and dumping a faller costly.
    const later = new Map([["out", 20]]);
    const [sale] = rosterChangeEntries("m", 2026, 5, ["out"], [], later, "driver");
    expect(sale.amount).toBeCloseTo(20, 1);
  });

  it("uses constructor reasons for constructor changes", () => {
    const entries = rosterChangeEntries("m", 2026, 5, [], ["in"], prices, "constructor");
    expect(entries[0].reason).toBe("constructor_purchase");
  });
});

describe("transferFeeEntries", () => {
  it("charges nothing within the free allowance", () => {
    expect(transferFeeEntries("m", 2026, 5, FREE_CHANGES_PER_ROUND)).toEqual([]);
  });

  it("charges per change beyond the allowance", () => {
    const [entry] = transferFeeEntries("m", 2026, 5, FREE_CHANGES_PER_ROUND + 3);
    expect(entry.amount).toBeCloseTo(-3 * EXTRA_CHANGE_FEE, 1);
    expect(entry.reason).toBe("transfer_fee");
  });

  it("charges nothing for no changes at all", () => {
    expect(transferFeeEntries("m", 2026, 5, 0)).toEqual([]);
  });
});

describe("backmarkerPayoutEntry", () => {
  it("credits the budget the slot generated", () => {
    const entry = backmarkerPayoutEntry("m", 2026, 5, 18, "bottas");
    expect(entry?.amount).toBeCloseTo(18, 1);
    expect(entry?.reason).toBe("backmarker_payout");
  });

  it("records nothing when the backmarker paid nothing", () => {
    // A retirement pays zero; an entry of zero would be noise in the ledger.
    expect(backmarkerPayoutEntry("m", 2026, 5, 0, "bottas")).toBeNull();
  });
});

describe("spareCap", () => {
  it("is the balance not committed to the roster", () => {
    expect(spareCap(130, 114)).toBeCloseTo(16, 1);
  });

  it("can be negative when the roster is worth more than the balance", () => {
    // Possible after prices fall: the cap shrank but the roster is still held.
    expect(spareCap(100, 118)).toBeCloseTo(-18, 1);
  });
});
