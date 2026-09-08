"use client";

import { useActionState, useState } from "react";

import type { ChipRow } from "@/lib/f1/chips";
import { buyChip, cancelChip, playChip, type ChipState } from "./chip-actions";

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
  // Playing or buying a chip spends cost cap and cannot be undone once the
  // round locks, so both wait behind a confirmation naming what is about to
  // happen. The pending action carries the form it will submit.
  const [pending, setPending] = useState<{
    title: string;
    detail: string;
    confirmLabel: string;
    form: HTMLFormElement;
  } | null>(null);

  /**
   * Intercepts a submit so the action can be described before it runs.
   *
   * The form is submitted programmatically on confirm, which keeps the Server
   * Action and its hidden fields exactly as they were rather than rebuilding
   * the request by hand.
   */
  function confirmFirst(
    event: React.FormEvent<HTMLFormElement>,
    title: string,
    detail: string,
    confirmLabel: string,
  ) {
    event.preventDefault();
    setPending({ title, detail, confirmLabel, form: event.currentTarget });
  }

  const message = playState ?? buyState ?? cancelState;

  return (
    // Titled by the sheet that opens it, so it carries no heading of its own.
    <section>
      <p className="text-xs text-zinc-500">
        One free use each per season, then buy more with cost cap. No season
        limit — the only rule is one chip of a kind per round.
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
                  {`${chip.freeRemaining + chip.purchasedRemaining} left · ${chip.usedThisSeason} played`}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{chip.description}</p>

              {chip.playedThisRound ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">
                    Played{chip.playedTarget ? ` on ${chip.playedTarget}` : ""}
                  </span>
                  {!locked && (
                    <form
                      action={cancelAction}
                      onSubmit={(event) =>
                        confirmFirst(
                          event,
                          `Take ${chip.name} back?`,
                          "The use returns to your inventory and can be played again this season.",
                          "Take it back",
                        )
                      }
                    >
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
                    <form
                      action={playAction}
                      onSubmit={(event) => {
                        const target = targets[chip.chipId];
                        const on = options.find((option) => option.id === target)?.name;
                        confirmFirst(
                          event,
                          `Play ${chip.name}?`,
                          on
                            ? `${chip.description} It will apply to ${on} in round ${round}.`
                            : `${chip.description} It applies to round ${round}.`,
                          "Play it",
                        );
                      }}
                      className="flex flex-wrap items-center gap-2"
                    >
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

                  {/* No season limit: another use can always be bought, and
                      price is what keeps it from being free. */}
                  <form
                    action={buyAction}
                    onSubmit={(event) =>
                      confirmFirst(
                        event,
                        `Buy another ${chip.name}?`,
                        `${chip.price} comes off your cost cap, leaving ${(balance - chip.price).toFixed(1)}. It buys one more use, not a play — you still choose the round.`,
                        `Buy for ${chip.price}`,
                      )
                    }
                  >
                        <input type="hidden" name="leagueId" value={leagueId} />
                        <input type="hidden" name="chipId" value={chip.chipId} />
                        <button
                          disabled={balance < chip.price}
                          className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
                        >
                          Buy for {chip.price}
                        </button>
                  </form>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">{pending.title}</h3>
            <p className="mt-1 text-sm text-zinc-500">{pending.detail}</p>
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
                  // Submitting the original form keeps the Server Action and
                  // its hidden fields intact rather than rebuilding the request.
                  form.requestSubmit();
                }}
                className="flex-1 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
