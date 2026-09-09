import Link from "next/link";

import { grossMultiplier, payoutAt } from "@/lib/f1/bet-odds";
import { PRE_QUALIFYING_BONUS } from "@/lib/f1/betting";

export interface RoundBet {
  memberId: string;
  memberName: string;
  isSelf: boolean;
  market: string;
  selection: string;
  stake: number;
  odds: number | null;
  /** Which window it was placed in — the bonus rides on the profit. */
  preQualifying: boolean;
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
  hidden,
}: {
  leagueId: string;
  raceName: string;
  bets: RoundBet[];
  /**
   * Bets that exist but cannot be read yet, counted per member. Without this
   * the card says nobody has bet when what it means is that nobody's bets are
   * readable — opposite claims, and the wrong one invites a shrug.
   */
  hidden: { name: string; count: number }[];
}) {
  const hiddenTotal = hidden.reduce((total, entry) => total + entry.count, 0);

  if (bets.length === 0 && hiddenTotal === 0) {
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
                  {/* Stake, multiplier and what a win returns. The multiplier
                      alone left everyone doing the arithmetic, and the stored
                      figure is profit per unit — shown raw it read as getting
                      less back than you staked. */}
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {bet.stake.toFixed(1)}
                    {bet.odds !== null && (
                      <>
                        {" "}
                        × {grossMultiplier(bet.odds, bet.preQualifying ? PRE_QUALIFYING_BONUS : 1).toFixed(2)} ={" "}
                        <span className="text-zinc-900 dark:text-zinc-100">
                          {payoutAt(bet.stake, bet.odds, bet.preQualifying ? PRE_QUALIFYING_BONUS : 1).toFixed(1)}
                        </span>
                      </>
                    )}
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

      {hiddenTotal > 0 && (
        <div className="border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Sealed until qualifying
          </p>
          <ul className="mt-1 space-y-0.5">
            {hidden.map((entry) => (
              <li key={entry.name} className="flex items-baseline gap-2 text-xs text-zinc-500">
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="shrink-0 tabular-nums">
                  {entry.count} bet{entry.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
