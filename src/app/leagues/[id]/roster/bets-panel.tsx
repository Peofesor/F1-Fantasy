"use client";

import { useActionState, useState } from "react";

import { MARKET_LIST, maxStake, payout, type BetTiming, type MarketId } from "@/lib/f1/betting";
import { placeBet, type BetState } from "./bet-actions";

export interface PlacedBet {
  marketId: MarketId;
  marketName: string;
  selection: string;
  stake: number;
  timing: BetTiming;
  outcome: string | null;
  returned: number | null;
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
}: {
  leagueId: string;
  round: number;
  bank: number;
  bets: PlacedBet[];
  drivers: { id: string; name: string }[];
  constructors: { id: string; name: string }[];
  nationalities: string[];
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState<BetState, FormData>(placeBet, null);
  const [marketId, setMarketId] = useState<MarketId>("race_winner");
  const [stake, setStake] = useState(5);
  const [timing, setTiming] = useState<BetTiming>("pre_race");

  const market = MARKET_LIST.find((entry) => entry.id === marketId)!;
  const placed = new Set(bets.map((bet) => bet.marketId));
  const limit = maxStake(bank);

  const options =
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

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Bets</h2>
        <span className="text-xs text-zinc-500">
          bank {bank.toFixed(1)} · max stake {limit.toFixed(1)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        Staked from your bank, not from cap tied up in the roster. One bet per market, and a
        bet cannot be withdrawn.
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
                {bet.outcome ?? (bet.timing === "pre_qualifying" ? "pre-quali" : "open")}
                {bet.returned ? ` +${bet.returned}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {locked ? (
        <p className="mt-3 text-xs text-zinc-500">Round locked — no more bets.</p>
      ) : bank < 1 ? (
        <p className="mt-3 text-xs text-zinc-500">No cap in the bank to bet with.</p>
      ) : (
        <form action={formAction} className="mt-3 space-y-2">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="round" value={round} />

          <select
            name="marketId"
            value={marketId}
            onChange={(event) => setMarketId(event.target.value as MarketId)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {MARKET_LIST.map((entry) => (
              <option key={entry.id} value={entry.id} disabled={placed.has(entry.id)}>
                {entry.name} ({entry.odds}x){placed.has(entry.id) ? " — already bet" : ""}
              </option>
            ))}
          </select>

          <p className="text-xs text-zinc-500">{market.description}</p>

          <select
            name="selection"
            required
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Choose…</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <label className="flex-1">
              <span className="sr-only">Stake</span>
              <input
                type="number"
                name="stake"
                min={1}
                max={limit}
                step={0.5}
                value={stake}
                onChange={(event) => setStake(Number(event.target.value))}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <select
              name="timing"
              value={timing}
              onChange={(event) => setTiming(event.target.value as BetTiming)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="pre_race">Pre-race</option>
              <option value="pre_qualifying">Pre-quali (1.5x)</option>
            </select>
          </div>

          <p className="text-xs text-zinc-500">
            Returns {payout(stake, marketId, timing).toFixed(1)} if it lands.
          </p>

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
