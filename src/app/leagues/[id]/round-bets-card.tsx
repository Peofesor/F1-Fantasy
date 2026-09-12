import Link from "next/link";

import { BetSlipList, type RoundBet } from "./bet-slip-list";

export type { RoundBet };

/**
 * What the league has staked on the coming race.
 *
 * Bets became visible to everyone, and this is the view that makes that worth
 * having: a slip you can only reach through someone's profile is a slip nobody
 * reads. Under the race card it is the first thing you see after the deadline —
 * which is exactly when there is still time to argue about it.
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
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Bets on {raceName}</h2>
          <Link
            href={`/leagues/${leagueId}/bets`}
            className="shrink-0 text-xs text-zinc-500 underline-offset-2 hover:underline"
          >
            Every round
          </Link>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Nobody has bet on this race yet.</p>
      </section>
    );
  }

  const staked = bets.reduce((total, bet) => total + bet.stake, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="min-w-0 truncate text-sm font-semibold">Bets on {raceName}</h2>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {bets.length} bet{bets.length === 1 ? "" : "s"} · {staked.toFixed(1)} staked
        </span>
      </div>

      <BetSlipList leagueId={leagueId} bets={bets} />

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

      <div className="border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <Link
          href={`/leagues/${leagueId}/bets`}
          className="text-xs text-zinc-500 underline-offset-2 hover:underline"
        >
          Every round, every member →
        </Link>
      </div>
    </section>
  );
}
