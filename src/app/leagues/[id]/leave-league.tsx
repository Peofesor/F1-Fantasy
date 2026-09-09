"use client";

import { useActionState, useState } from "react";

import { leaveLeague, type LeaveState } from "./leave-actions";

/**
 * Leaving, behind a confirmation that says what goes with you.
 *
 * Every gameplay row hangs off the membership and cascades, so this is not a
 * "you can rejoin later" button: the season's rosters, points, ledger, bets and
 * chips go too. The dialog spells that out rather than asking a bare "are you
 * sure", because the thing people misjudge here is not whether they meant to
 * click, it is what the click costs.
 */
export function LeaveLeague({
  leagueId,
  isOwner,
  memberCount,
  hasHistory,
}: {
  leagueId: string;
  isOwner: boolean;
  memberCount: number;
  hasHistory: boolean;
}) {
  const [state, formAction, pending] = useActionState<LeaveState, FormData>(leaveLeague, null);
  const [asking, setAsking] = useState(false);

  const ownerBlocked = isOwner && memberCount > 1;
  // Leaving as the only member deletes the league: nobody can reach one with
  // no members, so there is nothing left to come back to.
  const isLast = memberCount <= 1;

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      <h2 className="text-sm font-semibold">{isLast ? "Delete this league" : "Leave this league"}</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {ownerBlocked
          ? "You created this league, so you cannot leave while others are still in it."
          : isLast
            ? "You are the last one here, so leaving deletes the league itself — its name, invite code, standings and every round played in it."
            : hasHistory
              ? "Your rosters, points, cost cap, bets and chips for this league are deleted with you. There is no undo."
              : "You have no history here yet, so there is nothing to lose."}
      </p>

      {state && "error" in state && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <button
        type="button"
        disabled={ownerBlocked || pending}
        onClick={() => setAsking(true)}
        className="mt-3 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400"
      >
        {pending ? "Leaving…" : isLast ? "Leave and delete league" : "Leave league"}
      </button>

      {asking && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">
              {isLast ? "Delete this league?" : "Leave for good?"}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {isLast
                ? "You are the last member, so the league goes with you: its name, its invite code, its standings and every round played in it. A league with no members cannot be reached by anyone, so this cannot be undone."
                : hasHistory
                  ? "Everything you have done in this league goes with you — rosters, points, cost cap, bets and chips. Rejoining with the invite code would start you from nothing."
                  : "You can rejoin later with the invite code."}
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Stay
              </button>
              <form action={formAction} className="flex-1">
                <input type="hidden" name="leagueId" value={leagueId} />
                <button className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white">
                  {isLast ? "Delete" : "Leave"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
