"use client";

import { useActionState } from "react";

import { generateSchedule, type ScheduleState } from "./schedule-actions";

interface Fixture {
  round: number;
  home: string;
  away: string;
}

export function SchedulePanel({
  leagueId,
  isOwner,
  fixtures,
}: {
  leagueId: string;
  isOwner: boolean;
  fixtures: Fixture[];
}) {
  const [state, formAction, pending] = useActionState<ScheduleState, FormData>(
    generateSchedule,
    null,
  );

  if (fixtures.length > 0) {
    return (
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Fixtures</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Fixed for the season — generated once, not redrawn each week.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          {fixtures.map((fixture) => (
            <li key={`${fixture.round}-${fixture.home}`} className="flex gap-3">
              <span className="w-8 shrink-0 tabular-nums text-zinc-500">R{fixture.round}</span>
              <span className="min-w-0 flex-1 truncate">
                {fixture.home} <span className="text-zinc-400">v</span> {fixture.away}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <h2 className="text-sm font-semibold">Fixtures</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {isOwner
          ? "Generate the season schedule once everyone has joined. It cannot be regenerated afterwards."
          : "The league owner has not generated the schedule yet."}
      </p>

      {isOwner && (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <button
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Generating…" : "Generate schedule"}
          </button>
        </form>
      )}

      {state && "error" in state && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          Created {state.fixtures} fixtures.
        </p>
      )}
    </section>
  );
}
