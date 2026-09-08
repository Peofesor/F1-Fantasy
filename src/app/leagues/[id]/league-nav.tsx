import Link from "next/link";

type Section = "hub" | "roster" | "chips" | "bets";

const TABS: { key: Section; label: string; path: string }[] = [
  { key: "hub", label: "League", path: "" },
  { key: "roster", label: "Roster", path: "/roster" },
  { key: "chips", label: "Chips", path: "/chips" },
  { key: "bets", label: "Bets", path: "/bets" },
];

/**
 * Tabs across every league page.
 *
 * Chips and bets used to sit at the bottom of the roster page, below seven
 * pickers, where neither was reachable without scrolling past the thing you
 * actually came to do. Giving each its own tab keeps the roster page to one
 * job and puts betting somewhere you can find without hunting.
 */
export function LeagueNav({ leagueId, active }: { leagueId: string; active: Section }) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto">
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
