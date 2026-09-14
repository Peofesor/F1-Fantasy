"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { label: string; path: string }[] = [
  { label: "League", path: "" },
  { label: "Roster", path: "/roster" },
  { label: "Bets", path: "/paddock" },
];

/**
 * Tabs across every league page.
 *
 * The paddock — where chips are bought and bets are placed — used to sit at
 * the bottom of the roster page, below seven pickers, where it was not
 * reachable without scrolling past the thing you came to do.
 *
 * Chips are deliberately not a tab. They act on the roster you are looking at —
 * doubling a driver, changing a slot after qualifying — so they open as a sheet
 * over the picker instead of sending you to another page to reason about a team
 * you can no longer see.
 *
 * It lives in the layout and reads its own active tab from the path, which is
 * what makes a tap feel like a tap. Rendered per page and told which tab was
 * active, the whole bar was part of the page being replaced: pressing Paddock
 * left every tab looking exactly as it had until the server came back with the
 * new page, a second or two later, and the one thing the app could have said
 * immediately — "yes, that one" — was the thing it waited longest to say.
 */
export function LeagueNav({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const base = `/leagues/${leagueId}`;

  // A member's profile and the bets page sit under the league but are not tabs
  // of it. Bets was one until it proved to be a place you go *from* somewhere —
  // the Bets button over the roster picker, or what is riding on the race on the
  // league page — rather than one of the three screens the game is played on.
  // Both have their own way back, and a bar with nothing lit would suggest the
  // app had lost track of where you were.
  if (pathname.startsWith(`${base}/members/`) || pathname.startsWith(`${base}/bets`))
    return null;

  return (
    <nav className="flex items-center gap-1.5">
      {/* Out of this league entirely. The tabs beside it only move within one,
          so without this the app had no way back to the list. */}
      <Link
        href="/leagues"
        aria-label="All leagues"
        className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1.5 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
      >
        ←
      </Link>
      <span className="flex flex-1 justify-center gap-1.5">
        {TABS.map((tab) => {
          const href = `${base}${tab.path}`;
          // Exact rather than a prefix: "" is a prefix of every other tab, so
          // League would light up on all of them.
          const isActive = pathname === href || pathname === `${href}/`;
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
                isActive
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </span>
    </nav>
  );
}
