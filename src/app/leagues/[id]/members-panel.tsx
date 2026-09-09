"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { removeMember, type RemoveState } from "./leave-actions";

interface Member {
  id: string;
  name: string;
  isSelf: boolean;
}

/**
 * Who is in the league, and — for the owner — the way to take someone out.
 *
 * Removing is behind a confirmation that names the person and what goes with
 * them, because it cannot be undone: every gameplay table hangs off the
 * membership with a cascade, so a season of rosters, bets and scores goes at
 * the same moment. A one-click × beside a name would be a season lost to a
 * mistap.
 *
 * The owner has no control beside their own name. Leaving carries rules this
 * path does not — an owner cannot abandon a league that still has members, and
 * the last one out deletes it — so removing yourself belongs there.
 */
export function MembersPanel({
  leagueId,
  members,
  isOwner,
}: {
  leagueId: string;
  members: Member[];
  isOwner: boolean;
}) {
  const [state, formAction, pending] = useActionState<RemoveState, FormData>(removeMember, null);
  const [confirming, setConfirming] = useState<Member | null>(null);
  const removalForm = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">Members</h2>

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

      <ul className="mt-2 space-y-1 text-sm">
        {members.map((member) => (
          <li key={member.id} className="flex items-baseline justify-between gap-3">
            <Link
              href={`/leagues/${leagueId}/members/${member.id}`}
              className="min-w-0 truncate underline-offset-2 hover:underline"
            >
              {member.name}
            </Link>

            {member.isSelf ? (
              <span className="shrink-0 text-xs text-zinc-500">you</span>
            ) : (
              isOwner && (
                <button
                  type="button"
                  onClick={() => setConfirming(member)}
                  className="shrink-0 text-xs text-zinc-500 underline underline-offset-2 hover:text-red-600 dark:hover:text-red-400"
                >
                  Remove
                </button>
              )
            )}
          </li>
        ))}
      </ul>

      {/* Kept out of the dialog so it survives the dialog closing. */}
      <form action={formAction} ref={removalForm} className="hidden">
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="memberId" value={confirming?.id ?? ""} />
      </form>

      {confirming && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">Remove {confirming.name}?</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Their teams, bets, chips, cost cap and every round they have scored go with them.
              This cannot be undone, and they would have to rejoin with the invite code to start
              again from nothing.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              Redraw the fixtures afterwards, or the remaining rounds still have them in the
              schedule.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  // Submitted before the dialog closes, not after. The hidden
                  // field's value is derived from `confirming`, so clearing it
                  // first would only work for as long as React had not
                  // re-rendered — correct today by timing rather than by
                  // design, which is the kind of thing that breaks silently.
                  removalForm.current?.requestSubmit();
                  setConfirming(null);
                }}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {pending ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
