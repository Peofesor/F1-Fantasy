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
   *
   * True for every member, not only the reader: the page reads these past the
   * seals on a rival's roster and ledger, so the four figures balance on every
   * row and two rows can be compared.
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
          as the drivers — it is the whole squad — and the last sentence is the
          part a reader would otherwise have to guess at. */}
      <p className="mt-0.5 text-xs text-zinc-500">
        Drivers is the whole squad at today&rsquo;s prices, teams included; bets is what is still
        riding and cannot be got back yet; total cash is all three. Everyone&rsquo;s figures are
        current, this weekend&rsquo;s spending included &mdash; what stays sealed until qualifying
        is which drivers they bought, not what they paid.
      </p>

      {!scored ? (
        <p className="mt-3 text-sm text-zinc-500">
          Nothing scored yet. The table fills in once a race has been run and scored.
        </p>
      ) : (
        <div className="-mx-4 mt-3 overflow-x-auto px-4">
          {/* On a phone this is eight columns in about twenty ems, and `w-full`
              had the browser solve that by squeezing rather than scrolling:
              headers wrapped onto two lines and the money columns ran together
              into one wall of digits. `min-w-max` lets the table take the width
              it actually needs and hands the overflow to the scroller, so every
              column is its widest figure plus a gutter — and the duel league's
              extra column widens the table instead of taking room from the ones
              beside it. The negative margin puts the scroll edge at the edge of
              the card, so a row that runs off does not appear to stop short. */}
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-1 pr-3 font-medium">#</th>
                <th className="py-1 pr-4 font-medium">Member</th>
                {/* Match points are gone: win 1 and draw 0.5 means the record
                    beside them already says the number, and a column that can
                    be read off the one next to it is a column asking to be
                    checked against it. */}
                {mode === "duel" && (
                  <th className="py-1 pl-5 text-right font-medium whitespace-nowrap">W-D-L</th>
                )}
                <th className="py-1 pl-5 text-right font-medium">Points</th>
                <th className="py-1 pl-5 text-right font-medium">Drivers</th>
                <th className="py-1 pl-5 text-right font-medium">Bank</th>
                <th className="py-1 pl-5 text-right font-medium">Bets</th>
                <th className="py-1 pl-5 text-right font-medium whitespace-nowrap">Total cash</th>
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
                  <td className="py-2.5 pr-3 tabular-nums text-zinc-500">{row.position}</td>
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/leagues/${leagueId}/members/${row.memberId}`}
                      className="block max-w-40 truncate underline-offset-2 hover:underline"
                    >
                      {names.get(row.memberId) ?? "Unknown"}
                    </Link>
                    {row.roundsPlayed === 0 && (
                      <span className="text-xs text-zinc-500">no rounds scored</span>
                    )}
                  </td>
                  {mode === "duel" && (
                    <td className="py-2.5 pl-5 text-right tabular-nums">
                      {row.wins}-{row.draws}-{row.losses}
                    </td>
                  )}
                  <td className="py-2.5 pl-5 text-right tabular-nums">{row.points.toFixed(0)}</td>
                  <td className="py-2.5 pl-5 text-right tabular-nums text-zinc-500">
                    {money(cash.get(row.memberId)?.drivers ?? 0)}
                  </td>
                  <td className="py-2.5 pl-5 text-right tabular-nums text-zinc-500">
                    {money(cash.get(row.memberId)?.bank ?? 0)}
                  </td>
                  <td className="py-2.5 pl-5 text-right tabular-nums text-zinc-500">
                    {money(cash.get(row.memberId)?.bets ?? 0)}
                  </td>
                  <td className="py-2.5 pl-5 text-right tabular-nums">
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
