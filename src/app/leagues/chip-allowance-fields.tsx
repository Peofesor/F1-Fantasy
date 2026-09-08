"use client";

import { CHIP_LIST, DEFAULT_ALLOWANCE_PER_HALF, type ChipAllowance } from "@/lib/f1/chips";

/**
 * How many of each chip a member gets per half-season.
 *
 * Shared by creating a league and editing one, so the two cannot drift on what
 * they offer or on what a blank field means.
 *
 * Blank is deliberately not the same as zero. It means "whatever the default
 * is", so a league created today does not freeze today's number into itself for
 * ever; zero means the host actually wants that chip unavailable.
 */
export function ChipAllowanceFields({ allowance }: { allowance: ChipAllowance | null }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-zinc-500">Free chips per half-season</legend>
      <p className="text-[11px] text-zinc-500">
        Granted before the summer break and again after it, so a season cannot be spent by May.
        Blank uses the default of {DEFAULT_ALLOWANCE_PER_HALF}; 0 removes the chip. Bought chips
        are on top of this and do not expire at the break.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {CHIP_LIST.map((chip) => (
          <label key={chip.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="min-w-0 truncate">{chip.name}</span>
            <input
              name={`chip_${chip.id}`}
              type="number"
              min={0}
              max={10}
              step={1}
              defaultValue={allowance?.[chip.id] ?? ""}
              placeholder={String(DEFAULT_ALLOWANCE_PER_HALF)}
              className="w-14 shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
