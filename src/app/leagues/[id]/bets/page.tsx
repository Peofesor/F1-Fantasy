import Link from "next/link";

import { MARKETS, type BetTiming, type MarketId } from "@/lib/f1/betting";
import { loadMemberContext } from "../member-context";
import { LeagueNav } from "../league-nav";
import { PlacedBets, type PlacedBet } from "./placed-bets";

export const dynamic = "force-dynamic";

/**
 * Your slip for the current round.
 *
 * Split out of the paddock, which had grown into three errands on one screen:
 * buying chips, choosing a bet, and checking what you had already staked. The
 * third is the one you come back to, and it was the one buried at the bottom.
 */
export default async function BetsPage({ params }: PageProps<"/leagues/[id]/bets">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <LeagueNav leagueId={league.id} active="paddock" />
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to bet on.
        </p>
      </main>
    );
  }

  const { data: betRows } = await supabase
    .from("bets")
    .select("market_id, selection, stake, timing, outcome, returned, odds")
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round);

  const bets: PlacedBet[] = (betRows ?? []).map((bet) => {
    const marketId = bet.market_id as MarketId;
    const selectionId = bet.selection;
    return {
      marketId,
      marketName: MARKETS[marketId]?.name ?? marketId,
      // Show a readable name where the selection is an id.
      selection:
        round.driverNames.get(selectionId) ??
        round.constructorNames.get(selectionId) ??
        selectionId,
      stake: Number(bet.stake),
      timing: bet.timing as BetTiming,
      outcome: bet.outcome,
      returned: bet.returned === null ? null : Number(bet.returned),
      odds: bet.odds === null || bet.odds === undefined ? null : Number(bet.odds),
    };
  });

  // Betting closes on the same clock as the roster, so a withdrawal is only
  // offered while the weekend has not started.
  const { data: roster } = await supabase
    .from("rosters")
    .select("locked_at")
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      <header className="space-y-3 pt-2">
        <LeagueNav leagueId={league.id} active="paddock" />

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Your bets
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">
              {round.raceName}
            </h1>
          </div>
          <p className="shrink-0 text-right text-xs text-zinc-500">
            bank
            <span className="block text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {balance.toFixed(1)}
            </span>
          </p>
        </div>
      </header>

      <PlacedBets
        leagueId={league.id}
        round={round.round}
        bets={bets}
        locked={Boolean(roster?.locked_at)}
      />

      <Link
        href={`/leagues/${league.id}/paddock`}
        className="block rounded-lg bg-zinc-900 px-4 py-2.5 text-center text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Place another bet
      </Link>
    </main>
  );
}
