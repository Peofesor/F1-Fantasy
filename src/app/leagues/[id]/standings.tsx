import Link from "next/link";

import { money } from "@/lib/f1/money";
import type { LeagueMode, StandingRow } from "@/lib/f1/standings";

/**
 * Standings table.
 *
 * The columns differ by mode because the modes rank on different things: a duel
 * league is decided by match record, a free-for-all by cumulative points.
 * Showing both sets of columns everywhere would imply the unused one mattered.
 */
export function Standings({
  leagueId,
  rows,
  names,
  mode,
  cash,
  currentMemberId,
}: {
  leagueId: string;
  rows: StandingRow[];
  names: ReadonlyMap<string, string>;
  mode: LeagueMode;
  /**
   * Where each member's cap is, keyed by member: the squad they hold, the bank
   * left over, the stakes still riding, and the three added up.
   */
  cash: ReadonlyMap<string, { drivers: number; bank: number; bets: number; total: number }>;
  currentMemberId?: string;
}) {
  const scored = rows.some((row) => row.roundsPlayed > 0);

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      <h2 className="text-sm font-semibold">Standings</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        {mode === "duel"
          ? "Ranked on match points — win 1, draw 0.5. Ties split on total points."
          : "Ranked on cumulative fantasy points."}
      </p>
      {/* What the money columns count. Drivers includes the teams held as well
          as the drivers — it is the whole squad — and the sealing is the part
          that would otherwise look like a bug. */}
      <p className="mt-0.5 text-xs text-zinc-500">
        Drivers is the whole squad at today&rsquo;s prices, teams included; bets is what is still
        riding and cannot be got back yet. A rival&rsquo;s next squad and bets are sealed until
        qualifying, so theirs count the last race until then.
      </p>

      {!scored ? (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing scored yet. The table fills in once a race has been run and scored.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="w-8 py-1 font-medium">#</th>
                <th className="py-1 font-medium">Member</th>
                {/* Match points are gone: win 1 and draw 0.5 means the record
                    beside them already says the number, and a column that can
                    be read off the one next to it is a column asking to be
                    checked against it. */}
                {mode === "duel" && (
                  <th className="w-16 py-1 text-right font-medium">W-D-L</th>
                )}
                <th className="w-20 py-1 text-right font-medium">Points</th>
                <th className="w-20 py-1 text-right font-medium">Drivers</th>
                <th className="w-20 py-1 text-right font-medium">Bank</th>
                <th className="w-20 py-1 text-right font-medium">Bets</th>
                <th className="w-24 py-1 text-right font-medium">Total cash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.memberId}
                  className={`border-t border-zinc-100 dark:border-zinc-800 ${
                    row.memberId === currentMemberId ? "font-medium" : ""
                  }`}
                >
                  <td className="py-1.5 tabular-nums text-zinc-500">{row.position}</td>
                  <td className="py-1.5">
                    <Link
                      href={`/leagues/${leagueId}/members/${row.memberId}`}
                      className="block truncate underline-offset-2 hover:underline"
                    >
                      {names.get(row.memberId) ?? "Unknown"}
                    </Link>
                    {row.roundsPlayed === 0 && (
                      <span className="text-xs text-zinc-500">no rounds scored</span>
                    )}
                  </td>
                  {mode === "duel" && (
                    <td className="py-1.5 text-right tabular-nums">
                      {row.wins}-{row.draws}-{row.losses}
                    </td>
                  )}
                  <td className="py-1.5 text-right tabular-nums">{row.points.toFixed(0)}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">
                    {money(cash.get(row.memberId)?.drivers ?? 0)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">
                    {money(cash.get(row.memberId)?.bank ?? 0)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">
                    {money(cash.get(row.memberId)?.bets ?? 0)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {money(cash.get(row.memberId)?.total ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
