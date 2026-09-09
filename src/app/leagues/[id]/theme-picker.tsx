"use client";

import { THEMES } from "@/lib/f1/themes";

/**
 * The colour swatches in league settings.
 *
 * Each swatch is painted in the scheme it selects, which is the whole point —
 * a list of names would make the host guess what "Petrol" looks like. The
 * selected one is marked by a ring rather than by colour alone, since the
 * swatches are already colour and one more shade would not read as "chosen".
 */
export function ThemePicker({ current }: { current: string | null }) {
  const selected = THEMES.some((theme) => theme.id === current) ? current : THEMES[0].id;

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-zinc-500">League colour</legend>
      <p className="text-[11px] text-zinc-500">
        Colours the tabs, buttons and badges for everyone in the league. Cosmetic only — it
        changes nothing that has been scored, so it can be changed whenever you like.
      </p>

      <div className="flex flex-wrap gap-2 pt-1">
        {THEMES.map((theme) => (
          <label
            key={theme.id}
            className="cursor-pointer"
            style={{ ["--swatch" as string]: theme.accent }}
          >
            <input
              type="radio"
              name="theme"
              value={theme.id}
              defaultChecked={theme.id === selected}
              className="peer sr-only"
            />
            <span
              className="flex items-center gap-2 rounded-full border border-zinc-300 py-1 pl-1 pr-3 text-xs peer-checked:border-[var(--swatch)] peer-checked:ring-2 peer-checked:ring-[var(--swatch)] peer-focus-visible:ring-2 dark:border-zinc-700"
            >
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-full border border-black/10"
                style={{ backgroundColor: theme.accent }}
              />
              {theme.name}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
