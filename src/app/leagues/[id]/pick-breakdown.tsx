"use client";

import { useEffect } from "react";

/** One line of a pick's score, with any driver id already resolved to a name. */
export interface BreakdownLine {
  label: string;
  points: number;
}

export interface PickBreakdown {
  lines: BreakdownLine[];
  /** The score before any chip multiplied it. */
  subtotal: number;
  /** Why there are no lines, when there are none. */
  note?: string;
}

/**
 * How one pick's score came together.
 *
 * The round card answers "who scored what" and immediately raises "why": a
 * driver on 98 and one on 0 sit in the same bracket, and the card has no room
 * to say that one took pole and the other never started. Rather than grow the
 * row, the row becomes a question you can ask.
 *
 * A centred sheet rather than a tooltip anchored to the pick. The card is built
 * for a phone, where ten rows two columns wide leave nowhere to put a floating
 * panel that does not cover the thing it describes — and where a tap has no
 * hover to fall back on.
 *
 * Nothing here is fetched. The breakdown travels with the card, so opening one
 * costs no round trip and works as fast on the tenth as on the first.
 */
export function PickBreakdownSheet({
  title,
  subtitle,
  breakdown,
  boost,
  total,
  onClose,
}: {
  title: string;
  /** The slot this pick filled, so the sheet says what it is a breakdown of. */
  subtitle: string;
  breakdown: PickBreakdown;
  /** "2x", "3x", "6x" — or null when no chip touched this pick. */
  boost: string | null;
  /** The score as the card shows it: after the boost, and what the lines lead to. */
  total: number;
  onClose: () => void;
}) {
  // Escape closes it, because a sheet that can only be dismissed by hitting a
  // specific target is a trap on a keyboard.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sign = (points: number) => (points > 0 ? `+${points}` : `${points}`);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      // The backdrop is the dismiss target; the sheet stops the click so a tap
      // inside it never closes what it is trying to read.
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-full max-w-xs overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`How ${title} scored`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{title}</h3>
            <p className="text-[10px] uppercase tracking-wide text-zinc-400">{subtitle}</p>
          </div>
          <span
            className={`shrink-0 text-lg font-semibold tabular-nums ${
              total < 0 ? "text-red-600 dark:text-red-400" : ""
            }`}
          >
            {total}
          </span>
        </div>

        {breakdown.lines.length > 0 && (
          <ul className="mt-3 space-y-1">
            {breakdown.lines.map((line) => (
              <li
                key={line.label}
                className="flex items-baseline justify-between gap-3 text-xs text-zinc-600 dark:text-zinc-400"
              >
                <span className="min-w-0 flex-1">{line.label}</span>
                <span
                  className={`shrink-0 tabular-nums ${
                    line.points < 0 ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {sign(line.points)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* The subtotal only earns its line when a chip moved the number after
            it. Without one it would just repeat the figure in the header. */}
        {boost && breakdown.lines.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <p className="flex items-baseline justify-between gap-3 text-xs text-zinc-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{sign(breakdown.subtotal)}</span>
            </p>
            <p className="flex items-baseline justify-between gap-3 text-xs font-medium">
              <span>Boosted {boost}</span>
              <span className={`tabular-nums ${total < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {sign(total)}
              </span>
            </p>
          </div>
        )}

        {breakdown.note && (
          <p className="mt-3 rounded-lg bg-zinc-100 px-2.5 py-2 text-[11px] leading-snug text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {breakdown.note}
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-zinc-100 py-2 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
