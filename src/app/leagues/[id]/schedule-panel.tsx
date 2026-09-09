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

  const drawn = fixtures.length > 0;

  /**
   * The draw control, shown to the owner whether or not fixtures exist.
   *
   * It used to disappear once the schedule had been drawn, which quietly
   * excluded everyone who joined afterwards: they had no opponent for the rest
   * of the season and no way for the owner to give them one.
   */
  const control = isOwner && (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <form action={formAction}>
        <input type="hidden" name="leagueId" value={leagueId} />
        <button
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-60"
        >
          {pending ? "Drawing…" : drawn ? "Redraw remaining rounds" : "Draw the schedule"}
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">
        {drawn
          ? "Run this after someone joins or leaves. Rounds already raced keep their pairings; everything from the next race onward is drawn again."
          : "Draw it once the first few people have joined — you can redraw later when more arrive."}
      </p>

      {state && "error" in state && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          {state.fixtures} fixtures drawn.
        </p>
      )}
    </div>
  );

  if (!drawn) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Fixtures</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {isOwner
            ? "No schedule yet, so nobody has an opponent."
            : "The league owner has not drawn the schedule yet."}
        </p>
        {control}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">Fixtures</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        One opponent a race. Rounds already raced are settled and never change.
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
      {control}
    </section>
  );
}
