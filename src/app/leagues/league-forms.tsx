"use client";

import { useActionState } from "react";

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

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Create a league</h2>
        <form action={createAction} className="space-y-3">
          <input name="name" placeholder="League name" required maxLength={60} className={inputClass} />
          <input
            name="season"
            type="number"
            defaultValue={new Date().getUTCFullYear()}
            className={inputClass}
          />
          <select name="mode" defaultValue="duel" className={inputClass}>
            <option value="duel">Duel — weekly head-to-head</option>
            <option value="free_for_all">Free-for-all — cumulative points</option>
          </select>
          <Error state={createState} />
          <button disabled={creating} className={buttonClass}>
            {creating ? "Creating…" : "Create"}
          </button>
        </form>
        <p className="text-xs text-zinc-500">
          Mode is locked for the season — the two score differently.
        </p>
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
    </div>
  );
}
