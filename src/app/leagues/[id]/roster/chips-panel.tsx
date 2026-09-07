"use client";

import { useActionState, useState } from "react";

import { CHIP_LIST, type ChipAvailability, type ChipId } from "@/lib/f1/chips";
import { buyChip, cancelChip, playChip, type ChipState } from "./chip-actions";

export interface ChipRow {
  chipId: ChipId;
  name: string;
  description: string;
  unlimited: boolean;
  price: number;
  seasonCap: number;
  target: "driver" | "constructor" | "none";
  usedThisSeason: number;
  freeRemaining: number;
  purchasedRemaining: number;
  available: boolean;
  reason?: string;
  playedThisRound: boolean;
  playedTarget?: string;
}

export function ChipsPanel({
  leagueId,
  round,
  chips,
  balance,
  driverOptions,
  constructorOptions,
  locked,
}: {
  leagueId: string;
  round: number;
  chips: ChipRow[];
  balance: number;
  driverOptions: { id: string; name: string }[];
  constructorOptions: { id: string; name: string }[];
  locked: boolean;
}) {
  const [playState, playAction] = useActionState<ChipState, FormData>(playChip, null);
  const [buyState, buyAction] = useActionState<ChipState, FormData>(buyChip, null);
  const [cancelState, cancelAction] = useActionState<ChipState, FormData>(cancelChip, null);
  const [targets, setTargets] = useState<Record<string, string>>({});

  const message = playState ?? buyState ?? cancelState;

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Chips</h2>
        <span className="text-xs text-zinc-500">cap {balance.toFixed(1)}</span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        One free use each per season. Extra uses cost cap, and one chip of a kind per round.
      </p>

      {message && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            "error" in message
              ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          }`}
        >
          {"error" in message ? message.error : message.message}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {chips.map((chip) => {
          const options =
            chip.target === "driver"
              ? driverOptions
              : chip.target === "constructor"
                ? constructorOptions
                : [];

          return (
            <li
              key={chip.chipId}
              className={`rounded-lg border p-3 ${
                chip.playedThisRound
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{chip.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {chip.unlimited
                    ? "unlimited"
                    : `${chip.freeRemaining + chip.purchasedRemaining} left · ${chip.usedThisSeason}/${chip.seasonCap} used`}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{chip.description}</p>

              {chip.playedThisRound ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
                    Played{chip.playedTarget ? ` on ${chip.playedTarget}` : ""}
                  </span>
                  {!locked && (
                    <form action={cancelAction}>
                      <input type="hidden" name="leagueId" value={leagueId} />
                      <input type="hidden" name="chipId" value={chip.chipId} />
                      <input type="hidden" name="round" value={round} />
                      <button className="text-xs text-zinc-500 underline underline-offset-2">
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {chip.available && !locked ? (
                    <form action={playAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="leagueId" value={leagueId} />
                      <input type="hidden" name="chipId" value={chip.chipId} />
                      <input type="hidden" name="round" value={round} />
                      {options.length > 0 && (
                        <select
                          name="target"
                          value={targets[chip.chipId] ?? ""}
                          onChange={(event) =>
                            setTargets((current) => ({
                              ...current,
                              [chip.chipId]: event.target.value,
                            }))
                          }
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                        >
                          <option value="">Choose {chip.target}…</option>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                        Play
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {locked ? "Round locked" : chip.reason}
                    </span>
                  )}

                  {!chip.unlimited &&
                    chip.usedThisSeason + chip.purchasedRemaining < chip.seasonCap && (
                      <form action={buyAction}>
                        <input type="hidden" name="leagueId" value={leagueId} />
                        <input type="hidden" name="chipId" value={chip.chipId} />
                        <button
                          disabled={balance < chip.price}
                          className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
                        >
                          Buy for {chip.price}
                        </button>
                      </form>
                    )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Kept alongside the component so the page and panel cannot disagree on shape. */
export function toChipRow(
  state: ChipAvailability,
  playedThisRound: boolean,
  playedTarget?: string,
): ChipRow {
  return {
    chipId: state.chip.id,
    name: state.chip.name,
    description: state.chip.description,
    unlimited: state.chip.unlimited,
    price: state.chip.price,
    seasonCap: state.chip.unlimited ? 0 : state.chip.seasonCap,
    target: state.chip.target,
    usedThisSeason: state.usedThisSeason,
    freeRemaining: state.chip.unlimited ? 0 : state.freeRemaining,
    purchasedRemaining: state.purchasedRemaining,
    available: state.available,
    reason: state.reason,
    playedThisRound,
    playedTarget,
  };
}

export { CHIP_LIST };
