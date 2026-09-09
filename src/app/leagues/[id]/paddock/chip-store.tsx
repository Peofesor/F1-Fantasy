"use client";

import { useActionState, useState } from "react";

import type { ChipRow } from "@/lib/f1/chips";
import { buyChip, type ChipState } from "../roster/chip-actions";

/**
 * Buying chips.
 *
 * Buying is separated from playing on purpose. Playing a chip is a decision
 * about the team in front of you, so it belongs on the roster page; buying one
 * is spending cost cap, which is the same act as placing a bet and belongs
 * beside it. Keeping the store next to the odds also puts the two ways of
 * spending spare cap in one place, where they can be weighed against each
 * other.
 */
export function ChipStore({
  leagueId,
  chips,
  balance,
}: {
  leagueId: string;
  chips: ChipRow[];
  balance: number;
}) {
  const [state, formAction] = useActionState<ChipState, FormData>(buyChip, null);
  const [pending, setPending] = useState<{ chip: ChipRow; form: HTMLFormElement } | null>(null);

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      <h2 className="text-sm font-semibold">Chips</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Free uses are granted per half-season and again after the summer break. Buy more here,
        then play them from your roster — <strong>one chip a weekend</strong>, whichever it is.
      </p>

      {state && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            "error" in state
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {"error" in state ? state.error : state.message}
        </p>
      )}

      <ul className="mt-3 grid grid-cols-2 gap-2">
        {chips.map((chip) => {
          const held = chip.freeRemaining + chip.purchasedRemaining;
          const affordable = balance >= chip.price;
          return (
            <li
              key={chip.chipId}
              className={`flex flex-col rounded-xl border p-3 ${
                held > 0
                  ? "border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium leading-tight">{chip.name}</span>
                {held > 0 && (
                  <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {held}
                  </span>
                )}
              </div>

              <span className="mt-1 flex-1 text-xs leading-snug text-zinc-500">
                {chip.description}
              </span>

              <form
                action={formAction}
                onSubmit={(event) => {
                  event.preventDefault();
                  setPending({ chip, form: event.currentTarget });
                }}
                className="mt-2"
              >
                <input type="hidden" name="leagueId" value={leagueId} />
                <input type="hidden" name="chipId" value={chip.chipId} />
                <button
                  disabled={!affordable}
                  className="w-full rounded-lg border border-zinc-300 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-zinc-700"
                >
                  {affordable ? `Buy · ${chip.price}` : `Costs ${chip.price}`}
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">Buy another {pending.chip.name}?</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {pending.chip.price} comes off your cost cap, leaving{" "}
              {(balance - pending.chip.price).toFixed(1)}. It buys one more use — you still choose
              the round to play it in, from your roster.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { form } = pending;
                  setPending(null);
                  form.requestSubmit();
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-[var(--accent-ink)]"
              >
                Buy for {pending.chip.price}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
