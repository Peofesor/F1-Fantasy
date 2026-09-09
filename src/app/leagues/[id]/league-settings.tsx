"use client";

import { useActionState } from "react";

import type { ChipAllowance } from "@/lib/f1/chips";
import { ChipAllowanceFields } from "../chip-allowance-fields";
import { ThemePicker } from "./theme-picker";
import { updateLeagueSettings, type SettingsState } from "./settings-actions";

/**
 * What the host can change once a league is running.
 *
 * Only shown to the owner, and only things that cannot rewrite a round already
 * played: the name is cosmetic, the stake ceiling narrows what a future bet may
 * risk, and a chip allowance changes what is left to play. Mode, season and the
 * opening budget are absent on purpose — changing any of them mid-season would
 * rescore history.
 */
export function LeagueSettings({
  leagueId,
  name,
  maxStake,
  chipAllowance,
  theme,
}: {
  leagueId: string;
  name: string;
  maxStake: number | null;
  chipAllowance: ChipAllowance | null;
  /** The league's colour scheme id, or null for the default. */
  theme: string | null;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    updateLeagueSettings,
    null,
  );

  const inputClass =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      <h2 className="text-sm font-semibold">League settings</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Yours to change because you created this league.
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="leagueId" value={leagueId} />

        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">Name</span>
          <input name="name" defaultValue={name} required maxLength={60} className={inputClass} />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">Maximum stake per bet</span>
          <input
            name="maxStake"
            type="number"
            step="0.1"
            min="0.1"
            defaultValue={maxStake ?? ""}
            placeholder="No limit"
            className={inputClass}
          />
          <span className="block text-[11px] text-zinc-500">
            Leave blank and the bank is the only limit. Lowering it does not touch bets already
            placed.
          </span>
        </label>

        <ThemePicker current={theme} />

        <ChipAllowanceFields allowance={chipAllowance} />

        {state && "error" in state && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        {state && "ok" in state && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {state.message}
          </p>
        )}

        <button
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </form>
    </section>
  );
}
