import type { LeagueMode, StandingRow } from "@/lib/f1/standings";

/**
 * Standings table.
 *
 * The columns differ by mode because the modes rank on different things: a duel
 * league is decided by match record, a free-for-all by cumulative points.
 * Showing both sets of columns everywhere would imply the unused one mattered.
 */
export function Standings({
  rows,
  names,
  mode,
  currentMemberId,
}: {
  rows: StandingRow[];
  names: ReadonlyMap<string, string>;
  mode: LeagueMode;
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
                {mode === "duel" && (
                  <>
                    <th className="w-14 py-1 text-right font-medium">Pts</th>
                    <th className="w-16 py-1 text-right font-medium">W-D-L</th>
                  </>
                )}
                <th className="w-16 py-1 text-right font-medium">Total</th>
                <th className="w-14 py-1 text-right font-medium">Best</th>
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
                    <span className="block truncate">{names.get(row.memberId) ?? "Unknown"}</span>
                    {row.roundsPlayed === 0 && (
                      <span className="text-xs text-zinc-500">no rounds scored</span>
                    )}
                  </td>
                  {mode === "duel" && (
                    <>
                      <td className="py-1.5 text-right tabular-nums">{row.duelPoints}</td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-500">
                        {row.wins}-{row.draws}-{row.losses}
                      </td>
                    </>
                  )}
                  <td className="py-1.5 text-right tabular-nums">{row.points.toFixed(1)}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">
                    {row.bestRound.toFixed(0)}
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
