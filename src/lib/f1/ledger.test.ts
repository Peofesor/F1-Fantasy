import { describe, expect, it } from "vitest";
import {
  backmarkerPayoutEntry,
  EXTRA_CHANGE_FEE,
  FREE_CHANGES_PER_ROUND,
  ledgerBalance,
  priceDriftEntries,
  rosterChangeEntries,
  spendableCap,
  summariseTransfers,
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

describe("summariseTransfers", () => {
  it("counts a swap as one transfer, not two", () => {
    // Counting both halves of a swap would silently double every fee.
    const summary = summariseTransfers(["a", "b"], [], ["a", "c"], []);
    expect(summary.changes).toBe(1);
    expect(summary.out).toEqual(["b"]);
    expect(summary.in).toEqual(["c"]);
  });

  it("charges nothing for a roster filled for the first time", () => {
    const summary = summariseTransfers([], [], ["a", "b", "c"], ["x"]);
    expect(summary.changes).toBe(0);
    expect(summary.fee).toBe(0);
  });

  it("charges nothing within the free allowance", () => {
    const summary = summariseTransfers(["a", "b", "c"], [], ["x", "y", "c"], []);
    expect(summary.changes).toBe(2);
    expect(summary.chargeable).toBe(0);
    expect(summary.fee).toBe(0);
  });

  it("charges for changes beyond the allowance", () => {
    const summary = summariseTransfers(["a", "b", "c", "d"], [], ["w", "x", "y", "z"], []);
    expect(summary.changes).toBe(4);
    expect(summary.chargeable).toBe(2);
    expect(summary.fee).toBeCloseTo(2 * EXTRA_CHANGE_FEE, 1);
  });

  it("consumes the allowance across separate saves in the same round", () => {
    // Otherwise saving twice would hand out four free changes.
    const summary = summariseTransfers(["a", "b"], [], ["x", "y"], [], 2);
    expect(summary.freeRemaining).toBe(0);
    expect(summary.chargeable).toBe(2);
  });

  it("counts constructor changes alongside driver changes", () => {
    const summary = summariseTransfers(["a"], ["x"], ["a"], ["y"]);
    expect(summary.changes).toBe(1);
    expect(summary.in).toEqual(["y"]);
  });

  it("reports no change when the roster is identical", () => {
    const summary = summariseTransfers(["a"], ["x"], ["a"], ["x"]);
    expect(summary.changes).toBe(0);
    expect(summary.fee).toBe(0);
  });
});

describe("spendableCap", () => {
  it("is the bank plus the value of what is held", () => {
    // After buying a 94.5 roster from 130, the bank is 35.5 but spending power
    // is still 130 -- the roster can be sold back when swapping.
    expect(spendableCap(35.5, 94.5)).toBeCloseTo(130, 1);
  });

  it("equals the bank when nothing is held", () => {
    expect(spendableCap(130, 0)).toBeCloseTo(130, 1);
  });

  it("rises when held value rises", () => {
    expect(spendableCap(35.5, 100)).toBeGreaterThan(spendableCap(35.5, 94.5));
  });
});
