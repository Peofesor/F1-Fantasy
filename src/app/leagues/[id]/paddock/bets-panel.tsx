"use client";

import { useActionState, useState } from "react";

import {
  checkStake,
  MARKET_LIST,
  maxStake,
  MIN_STAKE,
  STAKE_STEP,

  PRE_QUALIFYING_BONUS,
  type BetTiming,
  type MarketId,
} from "@/lib/f1/betting";
import Link from "next/link";

import { payoutAt } from "@/lib/f1/bet-odds";
import { placeBet, type BetState } from "./bet-actions";

export interface PlacedBet {
  marketId: MarketId;
  marketName: string;
  selection: string;
  stake: number;
  timing: BetTiming;
  outcome: string | null;
  returned: number | null;
  /** The price agreed when it was placed. Null on bets from before per-selection odds. */
  odds: number | null;
}

export function BetsPanel({
  leagueId,
  round,
  bank,
  bets,
  drivers,
  constructors,
  nationalities,
  locked,
  timing,
  hasRoster,
  odds,
  markets,
  leagueLimit,
}: {
  leagueId: string;
  round: number;
  bank: number;
  bets: PlacedBet[];
  drivers: { id: string; name: string }[];
  constructors: { id: string; name: string }[];
  nationalities: string[];
  locked: boolean;
  /** Which odds window a bet placed now falls in, decided by the clock. */
  timing: BetTiming;
  /** Whether a full roster is saved for this round. Betting waits on it. */
  hasRoster: boolean;
  /**
   * Price per market per selection.
   *
   * Missing means nobody has raced it yet, and the listed price stands in.
   * Null is different and deliberate: the house will not take that bet, because
   * the selection comes in more often than any price could cover.
   */
  odds: Record<string, Record<string, number | null>>;
  /**
   * Which markets this round actually has, decided on the server.
   *
   * A sprint market is real only on a sprint weekend, and the client cannot
   * tell — it has no schedule. Passed as ids rather than definitions because
   * these cross the server boundary.
   */
  markets: MarketId[];
  /** The league's own per-bet ceiling, or null when the bank is the only one. */
  leagueLimit: number | null;
}) {
  const [state, formAction, pending] = useActionState<BetState, FormData>(placeBet, null);
  const [marketId, setMarketId] = useState<MarketId>("race_winner");
  const [stake, setStake] = useState(5);
  // Controlled so the price can follow the pick: odds are per selection now.
  const [selection, setSelection] = useState("");

  // Only the markets this round has. A sprint market on a non-sprint weekend
  // is not a market at all.
  const offered = MARKET_LIST.filter((entry) => markets.includes(entry.id));
  const market = offered.find((entry) => entry.id === marketId) ?? offered[0];

  /**
   * What this market pays across the field.
   *
   * The listed price is no longer what anyone is offered — odds follow the
   * selection — so showing it beside a market read as a promise the driver list
   * then broke: "Race winner (4x)" above Antonelli at 1.7x.
   */
  const pricesIn = (marketId: string) =>
    Object.values(odds[marketId] ?? {}).filter((price): price is number => price !== null);

  const oddsRange = (marketId: string) => {
    const prices = pricesIn(marketId);
    if (prices.length === 0) return "—";
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    return low === high ? `${low.toFixed(2)}x` : `${low.toFixed(2)}–${high.toFixed(2)}x`;
  };

  // Markets ordered by their shortest available price, so the near-certainties
  // sit at the top and the long shots at the bottom.
  const sortedMarkets = [...offered].sort((a, b) => {
    const cheapest = (entry: (typeof offered)[number]) => {
      const prices = pricesIn(entry.id);
      return prices.length ? Math.min(...prices) : entry.odds;
    };
    return cheapest(a) - cheapest(b);
  });

  /**
   * The price on the current pick: a number, or null when there is none.
   *
   * An unpicked market shows the listed price as a placeholder. A withdrawn
   * selection must not fall back to it — that fallback is what would put a
   * near-certainty back on the board at its old listed odds.
   */
  const quoted = selection ? odds[market.id]?.[selection] : undefined;
  const withdrawn = quoted === null;
  const selectedOdds = quoted ?? market.odds;
  const placed = new Set(bets.map((bet) => bet.marketId));
  const limit = maxStake(bank, leagueLimit);

  // Why the button is off, in the same words the server uses when it refuses.
  const stakeCheck = checkStake(stake, bank, leagueLimit);
  const blockedReason = !selection
    ? "Choose who the bet is on."
    : withdrawn
      ? "No price on that one — it comes in too often to be worth a bet."
      : stakeCheck.allowed
        ? null
        : (stakeCheck.reason ?? "That stake is not allowed.");

  const rawOptions =
    market.selection === "driver"
      ? drivers
      : market.selection === "constructor"
        ? constructors
        : market.selection === "nationality"
          ? nationalities.map((value) => ({ id: value, name: value }))
          : [
              { id: "yes", name: "Yes" },
              { id: "no", name: "No" },
            ];

  // Shortest price first, the way a bookmaker lists a field: the likeliest
  // outcome is what you scan for, and an alphabetical list buries it. A
  // selection with no price sorts last whichever reason it has — unraced sits
  // at the listed price, withdrawn at the bottom.
  const priceOf = (id: string) => odds[market.id]?.[id];
  const options = [...rawOptions].sort((a, b) => {
    const priceA = priceOf(a.id) ?? Infinity;
    const priceB = priceOf(b.id) ?? Infinity;
    return priceA - priceB || a.name.localeCompare(b.name);
  });

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Bets</h2>
        <span className="text-xs text-zinc-500">
          bank {bank.toFixed(1)} · max stake {limit.toFixed(1)}
          {leagueLimit !== null && leagueLimit < bank ? " (league cap)" : ""}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        Staked from your bank, not from cap tied up in the roster. One bet per market. An open
        bet can be withdrawn until the race starts, and the stake comes back.
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        <strong>When you bet changes the odds.</strong> Betting before qualifying pays{" "}
        {PRE_QUALIFYING_BONUS}x, because you are calling it without knowing the grid. Once
        qualifying has run you know where everyone starts, so the same bet pays normal odds. Both
        settle on the race.
      </p>

      {/* The slip lives on its own page now. A link rather than the list:
          this card is for deciding a bet, and re-reading the ones already
          placed is a different errand that was crowding it out. */}
      {bets.length > 0 && (
        <Link
          href={`/leagues/${leagueId}/bets`}
          className="mt-3 flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
        >
          <span>
            {bets.length} bet{bets.length === 1 ? "" : "s"} on this round
          </span>
          <span className="text-zinc-500">View →</span>
        </Link>
      )}


      {locked ? (
        <p className="mt-3 text-xs text-zinc-500">Round locked — no more bets.</p>
      ) : !hasRoster ? (
        <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <strong>Pick your team first.</strong> Bets and drivers come out of the same cost cap,
          and the team is the bigger claim on it — betting first could leave you unable to field
          a legal one.{" "}
          <Link
            href={`/leagues/${leagueId}/roster`}
            className="underline underline-offset-2"
          >
            Build your roster
          </Link>
          .
        </p>
      ) : bank < MIN_STAKE ? (
        <p className="mt-3 text-xs text-zinc-500">No cap in the bank to bet with.</p>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="round" value={round} />

          <select
            name="marketId"
            value={market.id}
            onChange={(event) => {
              setMarketId(event.target.value as MarketId);
              // A driver priced for the old market would show the wrong odds.
              setSelection("");
            }}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {sortedMarkets.map((entry) => (
              <option key={entry.id} value={entry.id} disabled={placed.has(entry.id)}>
                {entry.name} ({oddsRange(entry.id)}){placed.has(entry.id) ? " — already bet" : ""}
              </option>
            ))}
          </select>

          <p className="text-xs text-zinc-500">{market.description}</p>

          <select
            name="selection"
            required
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Choose…</option>
            {options.map((option) => {
              const price = priceOf(option.id);
              // Null is a refusal, not a missing number: the selection comes in
              // too often for any price to cover it. Shown and disabled rather
              // than dropped, so a driver never silently vanishes from a list
              // and leaves the player wondering whether the page is broken.
              const label =
                price === null
                  ? " — no price"
                  : price === undefined
                    ? ""
                    : ` — ${price.toFixed(2)}x`;
              return (
                <option key={option.id} value={option.id} disabled={price === null}>
                  {option.name}
                  {label}
                </option>
              );
            })}
          </select>

          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">Stake</span>
              <input
                type="number"
                name="stake"
                min={MIN_STAKE}
                max={limit}
                step={STAKE_STEP}
                value={stake}
                onChange={(event) => setStake(Number(event.target.value))}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <span className="shrink-0 text-sm text-zinc-500">stake</span>
          </div>

          {/* The window follows the clock, so it is reported rather than
              offered: letting it be chosen would either be a lie or a
              loophole. The server decides it again on submit. */}
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              {timing === "pre_qualifying" ? (
                <>
                  Qualifying has not run, so this pays{" "}
                  <strong>{PRE_QUALIFYING_BONUS}× the listed odds</strong> — you are calling it
                  without knowing the grid.
                </>
              ) : (
                <>
                Qualifying has run, so this pays the <strong>listed odds</strong>. Betting
                closes when the race starts.
              </>
            )}
          </p>

          {/* The payout is what a bet is for, so it gets the size. */}
          {selection ? (
            <div className="flex items-end justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-50/40 px-3 py-2.5 dark:bg-emerald-950/20">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Returns if it lands
                </p>
                <p className="text-2xl font-semibold tabular-nums leading-none text-emerald-700 dark:text-emerald-400">
                  {payoutAt(
                    stake,
                    selectedOdds,
                    timing === "pre_qualifying" ? PRE_QUALIFYING_BONUS : 1,
                  ).toFixed(1)}
                </p>
              </div>
              <p className="shrink-0 text-right text-xs text-zinc-500">
                <span className="block tabular-nums text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {selectedOdds.toFixed(2)}x
                </span>
                on {stake.toFixed(1)}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-700">
              Pick who it is on to see the price — odds follow the driver, not the market.
            </p>
          )}

          {state && "error" in state && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
              {state.error}
            </p>
          )}
          {state && "ok" in state && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{state.message}</p>
          )}

          {/* A greyed-out button that does not say why is a dead end. The same
              check that disables it names the reason, using the wording the
              server would have returned. */}
          {blockedReason && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {blockedReason}
            </p>
          )}

          <button
            disabled={pending || blockedReason !== null}
            className="w-full rounded-lg bg-[var(--accent)] py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-40"
          >
            {pending ? "Placing…" : "Place bet"}
          </button>
        </form>
      )}
    </section>
  );
}
