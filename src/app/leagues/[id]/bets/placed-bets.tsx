"use client";

import { useActionState } from "react";

import { PRE_QUALIFYING_BONUS, type BetTiming, type MarketId } from "@/lib/f1/betting";
import { grossMultiplier, payoutAt } from "@/lib/f1/bet-odds";
import { cancelBet, type BetState } from "../paddock/bet-actions";

export interface PlacedBet {
  marketId: MarketId;
  marketName: string;
  selection: string;
  stake: number;
  timing: BetTiming;
  outcome: string | null;
  returned: number | null;
  /** The price agreed when it was placed. Null on bets from before per-selection odds. */
  odds: number | null;
}

/**
 * The slip: every bet placed for this round, and the way to take one back.
 *
 * Its own page rather than a block inside the betting form. The form is for
 * deciding, and this is for checking what you already decided — two different
 * errands that were competing for the same screen, on a page that also sells
 * chips.
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
        {bets.length} bet{bets.length === 1 ? "" : "s"} · {staked.toFixed(1)} staked
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
                {bet.outcome ?? "open"}
              </span>
            </div>

            <p className="mt-0.5 truncate text-sm text-zinc-500">{bet.selection}</p>

            <div className="mt-2 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
              <span className="tabular-nums">
                {bet.odds === null ? (
                  `${bet.stake.toFixed(1)} at listed odds`
                ) : (
                  <>
                    {bet.stake.toFixed(1)} ×{" "}
                    {grossMultiplier(
                      bet.odds,
                      bet.timing === "pre_qualifying" ? PRE_QUALIFYING_BONUS : 1,
                    ).toFixed(2)}{" "}
                    ={" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {payoutAt(
                        bet.stake,
                        bet.odds,
                        bet.timing === "pre_qualifying" ? PRE_QUALIFYING_BONUS : 1,
                      ).toFixed(1)}
                    </span>{" "}
                    if it lands
                  </>
                )}
              </span>
              {bet.returned !== null && bet.returned > 0 && (
                <span className="shrink-0 tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{bet.returned.toFixed(1)}
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
                  Withdraw · {bet.stake.toFixed(1)} back
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
