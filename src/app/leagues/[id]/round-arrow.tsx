"use client";

/**
 * One step through a season.
 *
 * Triangles rather than words, because whatever sits between a pair of these is
 * the race name, and two words either side of it would be read as the choice
 * itself.
 *
 * Disabled rather than hidden at the ends of the calendar, so the header does
 * not change width when you reach the first race and the arrow you were
 * clicking does not move out from under the cursor.
 *
 * Shared by the hub's event browser and a member's profile: stepping back
 * through the season is the same gesture in both, and it should not be two
 * different controls depending on which page you arrived from.
 */
export function RoundArrow({
  direction,
  label,
  onClick,
}: {
  direction: "left" | "right";
  /** What this step does, or why it cannot — it is the button's whole label. */
  label: string;
  /** Omitted at the end of the calendar, which is what disables the button. */
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-lg px-2.5 text-sm text-zinc-500 transition enabled:hover:bg-zinc-100 disabled:opacity-25 dark:enabled:hover:bg-zinc-900"
    >
      {direction === "left" ? "◀" : "▶"}
    </button>
  );
}
