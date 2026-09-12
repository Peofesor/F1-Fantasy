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
  /** What came back once it settled, so a winning slip shows its winnings. */
  returned?: number | null;
}

/**
 * Everyone's bets on one race, grouped by member.
 *
 * Grouped by member rather than by market: the interesting unit is a person's
 * position on the weekend, not every opinion on the race winner side by side.
 *
 * Shared by the card under the next race and the card on the event that is
 * running, because the two want the identical thing and the list is the half of
 * it worth getting right — the stake, what it pays, and whose it is.
 */
export function BetSlipList({ leagueId, bets }: { leagueId: string; bets: RoundBet[] }) {
  const byMember = new Map<string, RoundBet[]>();
  for (const bet of bets) {
    byMember.set(bet.memberId, [...(byMember.get(bet.memberId) ?? []), bet]);
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {[...byMember.entries()].map(([memberId, memberBets]) => (
        <li key={memberId} className="px-4 py-2.5">
          <Link
            href={`/leagues/${leagueId}/members/${memberId}`}
            className="text-xs font-semibold underline-offset-2 hover:underline"
          >
            {memberBets[0].memberName}
            {memberBets[0].isSelf && <span className="ml-1 font-normal text-zinc-500">you</span>}
          </Link>

          <ul className="mt-1 space-y-0.5">
            {memberBets.map((bet) => {
              const bonus = bet.preQualifying ? PRE_QUALIFYING_BONUS : 1;
              return (
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
                        × {grossMultiplier(bet.odds, bonus).toFixed(2)} ={" "}
                        <span className="text-zinc-900 dark:text-zinc-100">
                          {payoutAt(bet.stake, bet.odds, bonus).toFixed(1)}
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
                    {/* A settled winner shows what it actually paid rather than
                        the word "won", which is the figure being looked for. */}
                    {bet.outcome === "won" && bet.returned
                      ? `+${bet.returned.toFixed(1)}`
                      : (bet.outcome ?? "open")}
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
