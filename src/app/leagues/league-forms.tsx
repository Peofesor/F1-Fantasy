"use client";

import { useActionState, useRef } from "react";

import { DEFAULT_COST_CAP, MIN_COST_CAP } from "@/lib/f1/ledger";
import { ChipAllowanceFields } from "./chip-allowance-fields";
import { createLeague, joinLeague, type LeagueActionState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none " +
  "focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

const buttonClass =
  "w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60 " +
  "dark:bg-zinc-100 dark:text-zinc-900";

function Error({ state }: { state: LeagueActionState }) {
  if (!state) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {state.error}
    </p>
  );
}

export function LeagueForms() {
  const [createState, createAction, creating] = useActionState<LeagueActionState, FormData>(
    createLeague,
    null,
  );
  const [joinState, joinAction, joining] = useActionState<LeagueActionState, FormData>(
    joinLeague,
    null,
  );

  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Creating a league is the rarer of the two things on this page and the
          longer form by far — name, season, mode, budget and five chip
          allowances. Sitting open beside a single invite-code box, it read as
          the main event and made joining look like the afterthought, which is
          backwards: most people arrive here with a code. So it is one button,
          and the settings live behind it. */}
      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Start a league</h2>
        <p className="text-xs text-zinc-500">
          You set the budget, the mode and how many chips everyone gets. Mode and budget are fixed
          for the season — both change how the whole league scores, so they cannot move once
          anyone has picked a team.
        </p>
        <button onClick={() => dialog.current?.showModal()} className={buttonClass}>
          Create league
        </button>
        {/* The refusal belongs out here as well as in the dialog: a failed
            submit closes nothing, but if the player has dismissed it by then
            the reason would go with it. */}
        <Error state={createState} />
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Join with a code</h2>
        <form action={joinAction} className="space-y-3">
          <input
            name="inviteCode"
            placeholder="ABCD2345"
            required
            maxLength={12}
            className={`${inputClass} font-mono uppercase`}
          />
          <Error state={joinState} />
          <button disabled={joining} className={buttonClass}>
            {joining ? "Joining…" : "Join"}
          </button>
        </form>
      </section>

      <dialog
        ref={dialog}
        // Backdrop click closes it. A modal that can only be dismissed by a
        // button is a trap on a phone, where the button may be below the fold.
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
        // m-auto is explicit because the stylesheet's reset drops the margin a
        // modal dialog centres itself with, which left it against the edge.
        // The height cap and the inner scroll matter more than they look: the
        // form is tall enough on a phone that the create button sat below the
        // fold with nothing to scroll, so the dialog could be filled in but not
        // submitted.
        className="m-auto max-h-[85vh] w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 backdrop:bg-black/40 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <form action={createAction} className="flex max-h-[85vh] flex-col">
          <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">New league</h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="-mr-1 rounded-lg px-2 py-1 text-lg leading-none text-zinc-500"
            >
              ×
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Name</span>
            <input name="name" required maxLength={60} className={inputClass} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Season</span>
            <input
              name="season"
              type="number"
              defaultValue={new Date().getUTCFullYear()}
              className={inputClass}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Mode</span>
            <select name="mode" defaultValue="duel" className={inputClass}>
              <option value="duel">Duel — weekly head-to-head</option>
              <option value="free_for_all">Free-for-all — cumulative points</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-zinc-500">Budget per member</span>
            {/* A minimum, and no maximum. Below the minimum there is no legal
                team to buy and the league would refuse every roster; above it,
                how hard the league is belongs to whoever is running it. */}
            <input
              name="costCap"
              type="number"
              step="5"
              min={MIN_COST_CAP}
              defaultValue={DEFAULT_COST_CAP}
              className={inputClass}
            />
            <span className="block text-[11px] text-zinc-500">
              At least {MIN_COST_CAP}, which is about what the cheapest legal team costs. No upper
              limit — set it high and everyone can afford the quick cars.
            </span>
          </label>

          <ChipAllowanceFields allowance={null} />
          </div>

          {/* Pinned, so it is reachable however long the form gets. */}
          <div className="space-y-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <Error state={createState} />
            <button disabled={creating} className={buttonClass}>
              {creating ? "Creating…" : "Create league"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
