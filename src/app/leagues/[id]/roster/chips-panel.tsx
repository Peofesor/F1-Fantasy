"use client";

import { useActionState, useRef, useState } from "react";

import type { ChipRow } from "@/lib/f1/chips";
import { money } from "@/lib/f1/money";
import { buyChip, cancelChip, playChip, type ChipState } from "./chip-actions";

/** A driver on the roster, and which bracket's slot they fill. */
export interface ChipDriverOption {
  id: string;
  name: string;
  bracket: "top" | "mid";
}

export function ChipsPanel({
  leagueId,
  round,
  chips,
  balance,
  driverOptions,
  constructorOptions,
  topCaptainId,
  midCaptainId,
  displacedCaptainId,
  onCaptainMoved,
  locked,
}: {
  leagueId: string;
  round: number;
  chips: ChipRow[];
  /** Spare cap, so a chip that cannot be afforded says so before it is tapped. */
  balance: number;
  driverOptions: ChipDriverOption[];
  constructorOptions: { id: string; name: string }[];
  /** The current armbands, so SuperDriver can tell when it lands on one. */
  topCaptainId: string | null;
  midCaptainId: string | null;
  /**
   * The driver whose 2x this round's SuperDriver play moved, if it moved one.
   * Taking the chip back has to put the armband somewhere, and this is who it
   * was taken from.
   */
  displacedCaptainId: string | null;
  /**
   * Called when a SuperDriver play moves an armband, so the picker's draft
   * matches what the server just wrote. Without it the next save would put the
   * old captain back and undo the move.
   */
  onCaptainMoved: (bracket: "top" | "mid", driverId: string) => void;
  locked: boolean;
}) {
  const [playState, playAction] = useActionState<ChipState, FormData>(playChip, null);
  const [cancelState, cancelAction] = useActionState<ChipState, FormData>(cancelChip, null);
  const [buyState, buyAction] = useActionState<ChipState, FormData>(buyChip, null);
  const [targets, setTargets] = useState<Record<string, string>>({});
  // Who takes the 2x when the 3x lands on the driver already wearing it.
  const [heir, setHeir] = useState("");
  // Who takes the 2x back when the chip is taken back. Only the override is
  // held in state: the default is whoever lost the armband, and that is a prop
  // which arrives *after* the play — initialising state from it would have
  // captured the null from before and left the choice empty on the one render
  // where it matters.
  const [returnPick, setReturnPick] = useState("");
  const returnee = returnPick || (displacedCaptainId ?? "");
  // Playing or buying a chip spends cost cap and cannot be undone once the
  // round locks, so both wait behind a confirmation naming what is about to
  // happen. The pending action carries the form it will submit.
  const [pending, setPending] = useState<{
    title: string;
    detail: string;
    confirmLabel: string;
    form: HTMLFormElement;
    /** Run once the submit is actually let through. */
    after?: () => void;
  } | null>(null);

  /**
   * Whether the submit now arriving is the one the dialog just let through.
   *
   * Confirming re-submits the same form, which fires the same onSubmit handler
   * — so without this the guard cancelled the very submit it had just been
   * confirmed for and put the dialog straight back up. Nothing could be played
   * or taken back at all: the button appeared to do nothing.
   *
   * A ref rather than state because it is read inside the event handler that
   * the same click triggers, before any re-render could deliver a new value.
   */
  const confirmed = useRef(false);

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
    after?: () => void,
  ) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    event.preventDefault();
    setPending({ title, detail, confirmLabel, form: event.currentTarget, after });
  }

  const message = playState ?? cancelState ?? buyState;

  return (
    // Titled by the sheet that opens it, so it carries no heading of its own.
    <section>
      <p className="text-xs text-zinc-500">
        One free use each per season, and more can be bought here. One chip of a kind per round,
        and a bought chip is not refundable.
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

          const target = targets[chip.chipId] ?? "";

          // Whether the cap covers this chip. Asked once and used three times:
          // it decides the disabled state, the explanation, and whether the
          // button is dressed as something to press.
          const affordable = chip.price <= balance;

          // The 3x landing on the driver who already has the 2x wastes the
          // armband on a slot that is boosted anyway — six times one driver and
          // nothing on the rest. Rather than let that happen quietly, the play
          // asks where the 2x should go instead.
          const bracket =
            chip.chipId === "super_driver"
              ? driverOptions.find((option) => option.id === target)?.bracket
              : undefined;
          const wearer =
            bracket === "top" ? topCaptainId : bracket === "mid" ? midCaptainId : null;
          const displacesCaptain = Boolean(target) && target === wearer;
          const heirs = displacesCaptain
            ? driverOptions.filter((option) => option.bracket === bracket && option.id !== target)
            : [];
          const targetName = options.find((option) => option.id === target)?.name;
          const heirName = heirs.find((option) => option.id === heir)?.name;

          // Taking this chip back has to hand the 2x to somebody, because
          // playing it took the armband off someone. Only this chip, and only
          // when its play actually moved one.
          const returns = chip.chipId === "super_driver" && Boolean(displacedCaptainId);
          const returnBracket = displacedCaptainId
            ? driverOptions.find((option) => option.id === displacedCaptainId)?.bracket
            : undefined;
          const returnOptions = returns
            ? driverOptions.filter((option) => option.bracket === returnBracket)
            : [];
          const displacedName = returnOptions.find(
            (option) => option.id === displacedCaptainId,
          )?.name;
          const returneeName = returns
            ? returnOptions.find((option) => option.id === returnee)?.name
            : undefined;

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
                <span className="flex shrink-0 items-baseline gap-2">
                  {/* Buying sits beside the count it changes. It used to be a
                      separate store on another page, which meant leaving the
                      team you were deciding about to go and buy the thing you
                      wanted to use on it. */}
                  <form
                    action={buyAction}
                    onSubmit={(event) =>
                      confirmFirst(
                        event,
                        `Buy ${chip.name}?`,
                        `${money(chip.price)} from your ${money(balance)}. Chips are not refundable — once bought, the cap is spent whether or not you ever play it.`,
                        `Buy for ${money(chip.price)}`,
                      )
                    }
                  >
                    <input type="hidden" name="leagueId" value={leagueId} />
                    <input type="hidden" name="chipId" value={chip.chipId} />
                    <input type="hidden" name="quantity" value={1} />
                    {/* Dressed in the league colour when it can actually be
                        pressed. As a grey outline it read as a label rather
                        than a button, and on a dark background it barely read
                        at all — while the one thing it wants to say is that
                        there is something here worth spending on. A chip
                        beyond the cap keeps the outline: it is not an offer. */}
                    <button
                      disabled={!affordable}
                      title={
                        affordable
                          ? undefined
                          : `${money(chip.price)} and you have ${money(balance)}`
                      }
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium disabled:opacity-40 ${
                        affordable
                          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "border border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      Buy · {money(chip.price)}
                    </button>
                  </form>
                  <span className="text-xs text-zinc-500">
                    {`${chip.freeRemaining + chip.purchasedRemaining} left · ${chip.usedThisSeason} played`}
                  </span>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{chip.description}</p>

              {chip.playedThisRound ? (
                <div className="mt-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
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
                            [
                              "The use returns to your inventory and can be played again this season.",
                              returneeName && `The 2x goes to ${returneeName}.`,
                            ]
                              .filter(Boolean)
                              .join(" "),
                            "Take it back",
                            // The armband is written by the same action, but the
                            // picker's draft has to follow or the next save puts
                            // the chip's choice back.
                            returns && returnBracket && returnee
                              ? () => onCaptainMoved(returnBracket, returnee)
                              : undefined,
                          )
                        }
                      >
                        <input type="hidden" name="leagueId" value={leagueId} />
                        <input type="hidden" name="chipId" value={chip.chipId} />
                        <input type="hidden" name="round" value={round} />
                        {returns && <input type="hidden" name="captain" value={returnee} />}
                        <button
                          disabled={returns && !returnee}
                          className="text-xs text-zinc-500 underline underline-offset-2 disabled:no-underline disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Playing this moved an armband, so taking it back has to
                      put one somewhere. Asked here rather than left for the
                      player to notice: the chip is about to stop existing, and
                      the 2x it displaced would otherwise outlive the reason it
                      was moved. */}
                  {returns && !locked && (
                    <div className="rounded-md bg-amber-50 p-2 dark:bg-amber-950/40">
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        Playing this took the 2x off {displacedName ?? "another driver"}. Taking it
                        back gives the 2x to:
                      </p>
                      <select
                        value={returnee}
                        onChange={(event) => setReturnPick(event.target.value)}
                        aria-label="Who takes the 2x back"
                        className="mt-1.5 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-xs dark:border-amber-800 dark:bg-zinc-900"
                      >
                        <option value="">Choose a driver…</option>
                        {returnOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  {chip.available && !locked ? (
                    <form
                      action={playAction}
                      onSubmit={(event) =>
                        confirmFirst(
                          event,
                          `Play ${chip.name}?`,
                          [
                            chip.description,
                            targetName
                              ? `It will apply to ${targetName} in round ${round}.`
                              : `It applies to round ${round}.`,
                            heirName && `The 2x moves to ${heirName}.`,
                          ]
                            .filter(Boolean)
                            .join(" "),
                          "Play it",
                          // Applied when the play is let through rather than
                          // waiting on the round trip: the armband the picker
                          // shows is the one the server is being told to write,
                          // and a stale draft would save the old one back.
                          displacesCaptain && bracket && heir
                            ? () => onCaptainMoved(bracket, heir)
                            : undefined,
                        )
                      }
                      className="flex flex-col gap-2"
                    >
                      <input type="hidden" name="leagueId" value={leagueId} />
                      <input type="hidden" name="chipId" value={chip.chipId} />
                      <input type="hidden" name="round" value={round} />

                      <div className="flex flex-wrap items-center gap-2">
                        {options.length > 0 && (
                          <select
                            name="target"
                            value={target}
                            onChange={(event) => {
                              setTargets((current) => ({
                                ...current,
                                [chip.chipId]: event.target.value,
                              }));
                              // A driver chosen for one target is not an heir
                              // for the next one.
                              setHeir("");
                            }}
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
                        <button
                          disabled={displacesCaptain && !heir}
                          className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
                        >
                          Play
                        </button>
                      </div>

                      {displacesCaptain && (
                        <div className="rounded-md bg-amber-50 p-2 dark:bg-amber-950/40">
                          <p className="text-xs text-amber-800 dark:text-amber-300">
                            {targetName} already has the 2x. Doubling and tripling the same driver
                            spends the armband on a slot that is boosted anyway — give it to
                            another {bracket === "top" ? "top" : "midfield"} driver.
                          </p>
                          <select
                            name="captain"
                            required
                            value={heir}
                            onChange={(event) => setHeir(event.target.value)}
                            className="mt-1.5 w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-xs dark:border-amber-800 dark:bg-zinc-900"
                          >
                            <option value="">Move the 2x to…</option>
                            {heirs.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </form>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {locked ? "Round locked" : chip.reason}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {pending && (
        <div
          // Tapping outside a confirmation is the same as declining it.
          onClick={(event) => {
            if (event.target === event.currentTarget) setPending(null);
          }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
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
                  const { form, after } = pending;
                  setPending(null);
                  after?.();
                  // Submitting the original form keeps the Server Action and
                  // its hidden fields intact rather than rebuilding the request.
                  // The flag lets this one past the guard that opened the
                  // dialog, which would otherwise cancel it and reopen.
                  confirmed.current = true;
                  form.requestSubmit();
                }}
                className="flex-1 rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-[var(--accent-ink)]"
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
