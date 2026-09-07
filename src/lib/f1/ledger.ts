/**
 * Cost-cap ledger.
 *
 * The cap is an append-only ledger rather than a stored balance, so "why is my
 * cap this number?" is always answerable. The balance is the sum of entries.
 *
 * Nine reasons move it, and they fall into three groups:
 *   - one-off:    the opening balance on joining
 *   - roster:     purchases, sales, and drift in the value of what you hold
 *   - gameplay:   transfer fees, chip purchases, bet stakes and payouts, and
 *                 the backmarker payout
 */

export type LedgerReason =
  | "initial"
  | "driver_purchase"
  | "driver_sale"
  | "constructor_purchase"
  | "constructor_sale"
  | "price_change"
  | "transfer_fee"
  | "chip_purchase"
  | "bet_stake"
  | "bet_payout"
  | "backmarker_payout";

export interface LedgerEntry {
  memberId: string;
  season: number;
  round: number;
  /** Signed: negative spends, positive credits. */
  amount: number;
  reason: LedgerReason;
  note?: string;
}

/** Rounded to a tenth, matching price granularity. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function ledgerBalance(entries: readonly { amount: number }[]): number {
  return round1(entries.reduce((total, entry) => total + Number(entry.amount), 0));
}

/**
 * Value drift on a held roster between two rounds.
 *
 * Owning a competitor whose price rises grows the cap; a fall shrinks it
 * (spec §2). Applied symmetrically on purpose: a one-way ratchet would remove
 * any downside to picking a driver whose value craters, which is most of what
 * makes pricing a real decision.
 *
 * Only competitors held in both rounds drift. Something bought or sold between
 * rounds is accounted for by its purchase or sale entry instead, so counting
 * drift on it as well would double-count the same movement.
 */
export function priceDriftEntries(
  memberId: string,
  season: number,
  round: number,
  held: readonly string[],
  previousPrices: ReadonlyMap<string, number>,
  currentPrices: ReadonlyMap<string, number>,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];

  for (const competitorId of held) {
    const before = previousPrices.get(competitorId);
    const after = currentPrices.get(competitorId);
    if (before === undefined || after === undefined) continue;

    const delta = round1(after - before);
    if (delta === 0) continue;

    entries.push({
      memberId,
      season,
      round,
      amount: delta,
      reason: "price_change",
      note: `${competitorId} ${before.toFixed(1)} → ${after.toFixed(1)}`,
    });
  }

  return entries;
}

/**
 * Entries for the difference between two rosters.
 *
 * A swap is recorded as a sale of the outgoing pick and a purchase of the
 * incoming one, rather than a single net figure: the ledger should read like
 * what actually happened, and a net entry would hide which competitor each half
 * of the movement belonged to.
 *
 * A sale returns the competitor's *current* price, not what was paid for it —
 * that is what makes holding a riser profitable and dumping a faller costly.
 */
export function rosterChangeEntries(
  memberId: string,
  season: number,
  round: number,
  previous: readonly string[],
  next: readonly string[],
  prices: ReadonlyMap<string, number>,
  kind: "driver" | "constructor",
): LedgerEntry[] {
  const sold = previous.filter((id) => !next.includes(id));
  const bought = next.filter((id) => !previous.includes(id));

  return [
    ...sold.map((competitorId) => ({
      memberId,
      season,
      round,
      amount: round1(prices.get(competitorId) ?? 0),
      reason: (kind === "driver" ? "driver_sale" : "constructor_sale") as LedgerReason,
      note: competitorId,
    })),
    ...bought.map((competitorId) => ({
      memberId,
      season,
      round,
      amount: -round1(prices.get(competitorId) ?? 0),
      reason: (kind === "driver" ? "driver_purchase" : "constructor_purchase") as LedgerReason,
      note: competitorId,
    })),
  ];
}

/**
 * Free roster changes allowed per round before a fee applies.
 *
 * Matches the official game's two free transfers. One would make any reaction
 * to a price move or a driver change punitive; unlimited would make the cap
 * irrelevant, since you could always chase the best-value picks.
 */
export const FREE_CHANGES_PER_ROUND = 2;

/**
 * Cost cap charged per change beyond the free allowance.
 *
 * Set at 4.0 — the price of the cheapest possible driver — so an extra transfer
 * costs about as much as a backmarker, and three or four of them cost a real
 * upgrade. The official game charges points instead; charging the cap keeps
 * every cost in this game denominated in one currency (spec §2).
 */
export const EXTRA_CHANGE_FEE = 4.0;

export function transferFeeEntries(
  memberId: string,
  season: number,
  round: number,
  changeCount: number,
): LedgerEntry[] {
  const chargeable = Math.max(0, changeCount - FREE_CHANGES_PER_ROUND);
  if (chargeable === 0) return [];

  return [
    {
      memberId,
      season,
      round,
      amount: -round1(chargeable * EXTRA_CHANGE_FEE),
      reason: "transfer_fee",
      note: `${chargeable} change(s) beyond the ${FREE_CHANGES_PER_ROUND} free`,
    },
  ];
}

/** The backmarker slot pays cost cap instead of scoring points (spec §4). */
export function backmarkerPayoutEntry(
  memberId: string,
  season: number,
  round: number,
  budget: number,
  driverId: string,
): LedgerEntry | null {
  if (budget <= 0) return null;
  return {
    memberId,
    season,
    round,
    amount: round1(budget),
    reason: "backmarker_payout",
    note: driverId,
  };
}

/**
 * What a member can actually spend on a roster.
 *
 * The ledger balance is the *bank*: buying a roster deducts its cost, so after
 * buying in, the balance is what is left over. The roster itself is still an
 * asset — swapping a competitor sells it back at its current price — so total
 * spending power is the bank plus the value of what is currently held.
 *
 * Validating a roster against the bank alone double-counts the purchase and
 * makes every held roster look unaffordable the moment it is bought.
 */
export function spendableCap(balance: number, heldRosterValue: number): number {
  return round1(balance + heldRosterValue);
}

/** The uncommitted portion — what is free for bets and chips. */
export function bankBalance(balance: number): number {
  return round1(balance);
}

export interface TransferSummary {
  /** Competitors leaving the roster. */
  out: string[];
  /** Competitors joining it. */
  in: string[];
  changes: number;
  freeRemaining: number;
  chargeable: number;
  fee: number;
}

/**
 * Summarises what a proposed roster would cost in transfers.
 *
 * Counts incoming picks rather than the total churn: swapping one driver for
 * another is one transfer, not two. Counting both halves would silently double
 * every fee.
 *
 * `changesAlreadyMade` carries transfers already used this round, so the free
 * allowance is consumed across separate edits rather than resetting each time
 * the roster is saved — otherwise saving twice would grant four free changes.
 */
export function summariseTransfers(
  previousDrivers: readonly string[],
  previousConstructors: readonly string[],
  nextDrivers: readonly string[],
  nextConstructors: readonly string[],
  changesAlreadyMade = 0,
): TransferSummary {
  // A roster being filled for the first time is not a transfer.
  const isFirstRoster =
    previousDrivers.length === 0 && previousConstructors.length === 0;

  const out = [
    ...previousDrivers.filter((id) => !nextDrivers.includes(id)),
    ...previousConstructors.filter((id) => !nextConstructors.includes(id)),
  ];
  const incoming = [
    ...nextDrivers.filter((id) => !previousDrivers.includes(id)),
    ...nextConstructors.filter((id) => !previousConstructors.includes(id)),
  ];

  const changes = isFirstRoster ? 0 : incoming.length;
  const alreadyChargeableFree = Math.min(changesAlreadyMade, FREE_CHANGES_PER_ROUND);
  const freeRemaining = Math.max(0, FREE_CHANGES_PER_ROUND - alreadyChargeableFree);
  const chargeable = Math.max(0, changes - freeRemaining);

  return {
    out,
    in: incoming,
    changes,
    freeRemaining,
    chargeable,
    fee: round1(chargeable * EXTRA_CHANGE_FEE),
  };
}
