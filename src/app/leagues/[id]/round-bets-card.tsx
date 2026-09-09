import Link from "next/link";

export interface RoundBet {
  memberId: string;
  memberName: string;
  isSelf: boolean;
  market: string;
  selection: string;
  stake: number;
  odds: number | null;
  outcome: string | null;
}

/**
 * What the league has staked on the coming race.
 *
 * Bets became visible to everyone, and this is the view that makes that worth
 * having: a slip you can only reach through someone's profile is a slip nobody
 * reads. Under the race card it is the first thing you see after the deadline —
 * which is exactly when there is still time to argue about it.
 *
 * Grouped by member rather than by market. The interesting unit is a person's
 * position on the weekend, not every opinion on the race winner side by side.
 */
export function RoundBetsCard({
  leagueId,
  raceName,
  bets,
}: {
  leagueId: string;
  raceName: string;
  bets: RoundBet[];
}) {
  if (bets.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Bets on {raceName}</h2>
        <p className="mt-1 text-sm text-zinc-500">Nobody has bet on this race yet.</p>
      </section>
    );
  }

  const byMember = new Map<string, RoundBet[]>();
  for (const bet of bets) {
    byMember.set(bet.memberId, [...(byMember.get(bet.memberId) ?? []), bet]);
  }

  const staked = bets.reduce((total, bet) => total + bet.stake, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Bets on {raceName}</h2>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {bets.length} bet{bets.length === 1 ? "" : "s"} · {staked.toFixed(1)} staked
        </span>
      </div>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {[...byMember.entries()].map(([memberId, memberBets]) => (
          <li key={memberId} className="px-4 py-2.5">
            <Link
              href={`/leagues/${leagueId}/members/${memberId}`}
              className="text-xs font-semibold underline-offset-2 hover:underline"
            >
              {memberBets[0].memberName}
              {memberBets[0].isSelf && (
                <span className="ml-1 font-normal text-zinc-500">you</span>
              )}
            </Link>

            <ul className="mt-1 space-y-0.5">
              {memberBets.map((bet) => (
                <li
                  key={`${bet.market}-${bet.selection}`}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {bet.market} — <span className="text-zinc-500">{bet.selection}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {bet.stake.toFixed(1)}
                    {bet.odds !== null && ` at ${bet.odds.toFixed(2)}x`}
                  </span>
                  <span
                    className={`w-10 shrink-0 text-right ${
                      bet.outcome === "won"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : bet.outcome === "lost"
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-500"
                    }`}
                  >
                    {bet.outcome ?? "open"}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
