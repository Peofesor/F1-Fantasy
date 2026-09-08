"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * When the next round shuts, and what shuts at each point.
 *
 * Two deadlines matter and they are not the same moment: the roster and its
 * captains lock when qualifying begins, while betting runs on to the race
 * start. Showing one number would leave a member thinking they had missed
 * something they still had days for, or the reverse.
 *
 * The countdown is a client component because a server-rendered "in 3 days"
 * would be wrong by however long the page has been open, and this is exactly
 * the figure someone leaves on screen while deciding.
 *
 * Nothing time-dependent renders until after mount. Both the countdown and the
 * formatted date are the viewer's local time, which the server cannot know:
 * rendering either one server-side produced a hydration mismatch that took the
 * whole page's interactivity down with it, not just this card.
 */
export interface DeadlineCardProps {
  leagueId: string;
  raceName: string;
  round: number;
  /** ISO timestamps; null when the calendar has no time for that session. */
  qualifyingAt: string | null;
  raceAt: string | null;
  rosterSaved: boolean;
}

function countdown(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "closed";

  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatWhen(target: Date): string {
  return target.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DeadlineCard({
  leagueId,
  raceName,
  round,
  qualifyingAt,
  raceAt,
  rosterSaved,
}: DeadlineCardProps) {
  // Starts null so the server and the first client render agree; the real
  // clock arrives on the tick straight after mount.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The clock is the external source this subscribes to. The first reading is
    // scheduled rather than taken inline, so the effect body never sets state
    // synchronously and the server's HTML is not contradicted mid-hydration.
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const quali = qualifyingAt ? new Date(qualifyingAt) : null;
  const race = raceAt ? new Date(raceAt) : null;
  const rosterOpen = quali === null || now === null || quali > now;

  const rows: { label: string; at: Date | null; href: string; urgent: boolean }[] = [
    {
      label: "Roster & captains",
      at: quali,
      href: `/leagues/${leagueId}/roster`,
      // Under a day to go and nothing saved is the case worth shouting about.
      urgent:
        rosterOpen &&
        !rosterSaved &&
        quali !== null &&
        now !== null &&
        quali.getTime() - now.getTime() < 86_400_000,
    },
    { label: "Bets close", at: race, href: `/leagues/${leagueId}/paddock`, urgent: false },
  ];

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{raceName}</h2>
        <span className="shrink-0 text-xs text-zinc-500">Round {round}</span>
      </div>

      <ul className="mt-3 space-y-2">
        {rows.map((row) => {
          const left = row.at && now ? countdown(row.at, now) : null;
          const closed = left === "closed";
          return (
            <li key={row.label} className="flex items-center justify-between gap-3">
              <Link href={row.href} className="min-w-0">
                <span className="block text-sm">{row.label}</span>
                <span className="block text-xs text-zinc-500">
                  {row.at === null
                    ? "Not scheduled yet"
                    : now === null
                      ? " "
                      : formatWhen(row.at)}
                </span>
              </Link>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                  closed
                    ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-900"
                    : row.urgent
                      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                }`}
              >
                {left === null ? "—" : closed ? "closed" : left}
              </span>
            </li>
          );
        })}
      </ul>

      {!rosterSaved && rosterOpen && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">
          You have not saved a roster for this round yet.
        </p>
      )}
    </section>
  );
}
