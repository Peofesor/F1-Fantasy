"use client";

import { useActionState } from "react";

import { betOutcomeLabel, type MarketId } from "@/lib/f1/betting";
import { grossMultiplier, payoutAt, profitAt } from "@/lib/f1/bet-odds";
import { money } from "@/lib/f1/money";
import { cancelBet, type BetState } from "./bet-actions";

export interface PlacedBet {
  marketId: MarketId;
  marketName: string;
  selection: string;
  stake: number;
  outcome: string | null;
  returned: number | null;
  /** The price agreed when it was placed. Null on bets from before per-selection odds. */
  odds: number | null;
}

/**
 * The slip: every bet placed for this round, and the way to take one back.
 *
 * Below the betting card rather than behind a link to a page of its own. The
 * form is for deciding and this is for checking what you already decided, but
 * they are two halves of one errand: a count you have to navigate to in order
 * to believe is a count you check twice, and a withdrawal made here frees a
 * market in the picker directly above it.
 *
 * The same cards on every round, not only the one still open. `locked` takes
 * the withdrawal away and leaves everything else standing, which is the whole
 * difference between a slip you can still change and a slip you are reading
 * back.
 */
export function PlacedBets({
  leagueId,
  round,
  bets,
  locked,
}: {
  leagueId: string;
  round: number;
  bets: PlacedBet[];
  /**
   * No stake can come back: qualifying has started, or the round being read is
   * not the one still open. It hides the withdraw buttons and turns an
   * unsettled bet from "open" into "locked".
   */
  locked: boolean;
}) {
  const [state, cancelAction] = useActionState<BetState, FormData>(cancelBet, null);

  if (bets.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
        <p className="text-sm text-zinc-500">No bets on this round yet.</p>
      </section>
    );
  }

  const open = bets.filter((bet) => bet.outcome === null).length;
  const staked = bets.reduce((total, bet) => total + bet.stake, 0);

  return (
    <section className="space-y-3">
      <p className="text-xs text-zinc-500">
        {bets.length} bet{bets.length === 1 ? "" : "s"} · {money(staked)} staked
        {open > 0 && ` · ${open} still open`}
      </p>

      {/* Why the withdraw links are gone. Without it the buttons simply vanish
          between one visit and the next, which reads as a bug rather than a
          deadline. */}
      {locked && open > 0 && (
        <p className="text-xs text-zinc-500">
          Qualifying has started, so these are locked in — a bet can only be withdrawn before the
          session.
        </p>
      )}

      {state && "error" in state && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}

      <ul className="space-y-2">
        {bets.map((bet) => (
          <li
            key={bet.marketId}
            className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm font-medium">{bet.marketName}</span>
              <span
                className={`shrink-0 text-xs font-medium ${
                  bet.outcome === "won"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : bet.outcome === "lost"
                      ? "text-red-600 dark:text-red-400"
                      : "text-zinc-500"
                }`}
              >
                {/* The amount rather than the word: a lost 1.5 and a lost 50
                    read identically when both just say "lost". */}
                {betOutcomeLabel(bet.outcome, !locked, bet.stake, bet.returned)}
              </span>
            </div>

            <p className="mt-0.5 truncate text-sm text-zinc-500">{bet.selection}</p>

            <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
              <span className="tabular-nums">
                {bet.odds === null ? (
                  `${money(bet.stake)} at listed odds`
                ) : (
                  <>
                    {money(bet.stake)} × {grossMultiplier(bet.odds).toFixed(2)} ={" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {money(payoutAt(bet.stake, bet.odds))}
                    </span>{" "}
                    if it lands,{" "}
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {money(profitAt(bet.stake, bet.odds))}
                    </span>{" "}
                    of it profit
                  </>
                )}
              </span>
              {/* Only the void says anything here now. Won and lost carry their
                  amount in the header, and printing it twice on one card read
                  as two separate movements of the same money. A void has no
                  amount to put there, so this is where it says the stake came
                  home — in grey, because nothing was gained. */}
              {bet.outcome === "void" && (
                <span className="shrink-0 tabular-nums text-zinc-500">
                  {money(bet.stake)} back
                </span>
              )}
            </div>

            {/* An open bet can be taken back until qualifying starts; the stake
                comes straight back to the bank. */}
            {bet.outcome === null && !locked && (
              <form action={cancelAction} className="mt-2">
                <input type="hidden" name="leagueId" value={leagueId} />
                <input type="hidden" name="marketId" value={bet.marketId} />
                <input type="hidden" name="round" value={round} />
                <button className="text-xs text-zinc-500 underline underline-offset-2">
                  Withdraw · {money(bet.stake)} back
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
