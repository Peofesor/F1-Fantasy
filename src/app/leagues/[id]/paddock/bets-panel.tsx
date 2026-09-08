"use client";

import { useActionState, useState } from "react";

import {
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
import { cancelBet, placeBet, type BetState } from "./bet-actions";

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
  /** Price per market per selection. Missing entries fall back to the listed odds. */
  odds: Record<string, Record<string, number>>;
  /** The league's own per-bet ceiling, or null when the bank is the only one. */
  leagueLimit: number | null;
}) {
  const [state, formAction, pending] = useActionState<BetState, FormData>(placeBet, null);
  const [cancelState, cancelAction] = useActionState<BetState, FormData>(cancelBet, null);
  const [marketId, setMarketId] = useState<MarketId>("race_winner");
  const [stake, setStake] = useState(5);
  // Controlled so the price can follow the pick: odds are per selection now.
  const [selection, setSelection] = useState("");

  const market = MARKET_LIST.find((entry) => entry.id === marketId)!;

  /**
   * What this market pays across the field.
   *
   * The listed price is no longer what anyone is offered — odds follow the
   * selection — so showing it beside a market read as a promise the driver list
   * then broke: "Race winner (4x)" above Antonelli at 1.7x.
   */
  const oddsRange = (marketId: string) => {
    const prices = Object.values(odds[marketId] ?? {});
    if (prices.length === 0) return "—";
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    return low === high ? `${low.toFixed(1)}x` : `${low.toFixed(1)}–${high.toFixed(1)}x`;
  };

  // Markets ordered by their shortest available price, so the near-certainties
  // sit at the top and the long shots at the bottom.
  const sortedMarkets = [...MARKET_LIST].sort((a, b) => {
    const cheapest = (id: string) => {
      const prices = Object.values(odds[id] ?? {});
      return prices.length ? Math.min(...prices) : a.odds;
    };
    return cheapest(a.id) - cheapest(b.id);
  });
  // The price follows the selection, so an unpicked market shows the listed one.
  const selectedOdds = (selection && odds[marketId]?.[selection]) || market.odds;
  const placed = new Set(bets.map((bet) => bet.marketId));
  const limit = maxStake(bank, leagueLimit);

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
  // outcome is what you scan for, and an alphabetical list buries it. Anything
  // unpriced sorts last rather than pretending to be the favourite.
  const options = [...rawOptions].sort((a, b) => {
    const priceA = odds[marketId]?.[a.id] ?? Infinity;
    const priceB = odds[marketId]?.[b.id] ?? Infinity;
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

      {bets.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {bets.map((bet) => (
            <li key={bet.marketId} className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate">
                {bet.marketName} — <span className="text-zinc-500">{bet.selection}</span>
              </span>
              <span className="shrink-0 tabular-nums text-xs text-zinc-500">{bet.stake}</span>
              <span
                className={`shrink-0 text-xs ${
                  bet.outcome === "won"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : bet.outcome === "lost"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-500"
                }`}
              >
                {bet.outcome ?? "open"}
                {bet.odds !== null && ` · ${bet.odds.toFixed(2)}x`}
                {bet.timing === "pre_qualifying" && ` ×${PRE_QUALIFYING_BONUS}`}
                {bet.returned ? ` +${bet.returned}` : ""}
              </span>

              {/* An open bet can be taken back until the race starts; the
                  stake comes straight back to the bank. */}
              {bet.outcome === null && !locked && (
                <form action={cancelAction} className="shrink-0">
                  <input type="hidden" name="leagueId" value={leagueId} />
                  <input type="hidden" name="marketId" value={bet.marketId} />
                  <input type="hidden" name="round" value={round} />
                  <button className="text-xs text-zinc-500 underline underline-offset-2">
                    Withdraw
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {cancelState && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            "error" in cancelState
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {"error" in cancelState ? cancelState.error : cancelState.message}
        </p>
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
            value={marketId}
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
              const price = odds[marketId]?.[option.id];
              return (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {price ? ` — ${price.toFixed(1)}x` : ""}
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

          <button
            disabled={pending || stake > limit}
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Placing…" : "Place bet"}
          </button>
        </form>
      )}
    </section>
  );
}
