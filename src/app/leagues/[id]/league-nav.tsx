import Link from "next/link";

type Section = "hub" | "roster" | "paddock";

const TABS: { key: Section; label: string; path: string }[] = [
  { key: "hub", label: "League", path: "" },
  { key: "roster", label: "Roster", path: "/roster" },
  { key: "paddock", label: "Paddock", path: "/paddock" },
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
 */
export function LeagueNav({ leagueId, active }: { leagueId: string; active: Section }) {
  return (
    <nav className="flex justify-center gap-1.5">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={`/leagues/${leagueId}${tab.path}`}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${
              isActive
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
