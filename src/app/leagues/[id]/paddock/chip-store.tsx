"use client";

import { useActionState, useState } from "react";

import { MAX_CHIP_QUANTITY, type ChipRow } from "@/lib/f1/chips";
import { buyChip, type ChipState } from "../roster/chip-actions";

/**
 * Buying chips.
 *
 * Buying is separated from playing on purpose. Playing a chip is a decision
 * about the team in front of you, so it belongs on the roster page; buying one
 * is spending cost cap, which is the same act as placing a bet and belongs
 * beside it.
 *
 * A buy button on every card asked for the decision six times over, and asked
 * before showing what it would cost you — the price was on the card, the
 * balance was not, so working out whether two were affordable meant arithmetic
 * against a number further up the page. Picking a chip now opens one bar at the
 * foot of the card carrying the name, the price, what there is to spend and
 * what would be left: the whole decision on one line, made once.
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
  const [state, formAction, pending] = useActionState<ChipState, FormData>(buyChip, null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const selected = chips.find((chip) => chip.chipId === selectedId) ?? null;
  const total = selected ? Math.round(selected.price * quantity * 10) / 10 : 0;
  const remaining = Math.round((balance - total) * 10) / 10;
  const affordable = selected !== null && total <= balance;

  const select = (chipId: string) => {
    setSelectedId((current) => (current === chipId ? null : chipId));
    setQuantity(1);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
      <div className="p-4">
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
            const isSelected = chip.chipId === selectedId;
            return (
              <li key={chip.chipId}>
                <button
                  type="button"
                  onClick={() => select(chip.chipId)}
                  aria-pressed={isSelected}
                  className={`flex h-full w-full flex-col rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <span className="flex w-full items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-tight">{chip.name}</span>
                    {held > 0 && (
                      <span className="shrink-0 rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--accent-ink)]">
                        {held}
                      </span>
                    )}
                  </span>

                  <span className="mt-1 flex-1 text-xs leading-snug text-zinc-500">
                    {chip.description}
                  </span>

                  <span className="mt-2 text-sm font-semibold tabular-nums">
                    {chip.price.toFixed(1)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Part of the card rather than a dialog: buying a chip is a small,
          reversible spend, and a modal would weigh more than the decision. */}
      {selected && (
        <form
          action={formAction}
          className="border-t border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_18%,var(--background))] p-4 dark:border-zinc-800"
        >
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="chipId" value={selected.chipId} />

          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-semibold">{selected.name}</span>
            <span className="shrink-0 text-xs text-zinc-500">{selected.price.toFixed(1)} each</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              How many
              <input
                type="number"
                name="quantity"
                min={1}
                max={MAX_CHIP_QUANTITY}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(Math.floor(Number(event.target.value)) || 1)}
                className="w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <button
              disabled={pending || !affordable}
              className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-40"
            >
              {pending ? "Buying…" : `Buy for ${total.toFixed(1)}`}
            </button>
          </div>

          {/* Cost against balance against what is left — the three numbers the
              decision needs, rather than one of them and a note to go looking
              for the others. */}
          <p className="mt-2 text-xs tabular-nums text-zinc-500">
            {affordable ? (
              <>
                {balance.toFixed(1)} to spend − {total.toFixed(1)} ={" "}
                <strong className="text-zinc-900 dark:text-zinc-100">{remaining.toFixed(1)}</strong>{" "}
                left
              </>
            ) : (
              <span className="text-red-600 dark:text-red-400">
                That costs {total.toFixed(1)} and you have {balance.toFixed(1)}.
              </span>
            )}
          </p>
        </form>
      )}
    </section>
  );
}
