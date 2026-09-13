import Link from "next/link";
import { MARKETS, type MarketId } from "@/lib/f1/betting";
import {
  CHIP_LIST,
  chipAvailability,
  toChipRow,
  type ChipId,
  type ChipUsage,
} from "@/lib/f1/chips";
import { money } from "@/lib/f1/money";
import { loadMemberContext } from "../member-context";
import { loadBetForm } from "./bet-form-data";
import { ChipStore } from "./chip-store";
import { BetsPanel, type PlacedBet } from "./bets-panel";

export const dynamic = "force-dynamic";

export default async function BetsPage({ params }: PageProps<"/leagues/[id]/paddock">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance, half } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to bet on.
        </p>
      </main>
    );
  }

  const { data: betRows } = await supabase
    .from("bets")
    .select("market_id, selection, stake, outcome, returned, odds")
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round);

  const placedBets: PlacedBet[] = (betRows ?? []).map((bet) => {
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
      outcome: bet.outcome,
      returned: bet.returned === null ? null : Number(bet.returned),
      odds: bet.odds === null || bet.odds === undefined ? null : Number(bet.odds),
    };
  });

  const form = await loadBetForm(supabase, memberId, round);

  // Chip inventory, so the store can show what is already in hand.
  const [{ data: chipPlays }, { data: chipPurchases }] = await Promise.all([
    supabase
      .from("chip_plays")
      .select("chip_id, round")
      .eq("member_id", memberId)
      .eq("season", round.season),
    supabase.from("chip_purchases").select("chip_id").eq("member_id", memberId),
  ]);

  const usage: ChipUsage[] = (chipPlays ?? []).map((play) => ({
    chipId: play.chip_id as ChipId,
    round: play.round,
  }));

  const chipRows = CHIP_LIST.map((definition) => {
    const owned = (chipPurchases ?? []).filter((row) => row.chip_id === definition.id).length;
    return toChipRow(
      chipAvailability(definition.id, usage, owned, round.round, half),
      (chipPlays ?? []).some(
        (play) => play.chip_id === definition.id && play.round === round.round,
      ),
    );
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      <header className="space-y-3 pt-2">

        {/* The bank leads: everything on this page spends it, and how much is
            left is the number that decides what you do next. */}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Paddock · to spend
              </p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums leading-none">
                {money(balance)}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs text-zinc-500">
              {round.raceName}
              <span className="block">Round {round.round}</span>
            </p>
          </div>
        </div>

        {/* Always offered, not only once a bet exists: this is also where you
            come to check that a bet you thought you placed actually is. */}
        <Link
          href={`/leagues/${league.id}/bets`}
          className="relative flex items-center justify-center rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium dark:border-zinc-700"
        >
          Placed bets
          {placedBets.length > 0 && (
            <span className="absolute right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-[var(--accent-ink)]">
              {placedBets.length}
              <span className="sr-only"> placed</span>
            </span>
          )}
        </Link>
      </header>

      <BetsPanel
        leagueId={league.id}
        round={round.round}
        bank={balance}
        bets={placedBets}
        leagueLimit={league.max_stake}
        {...form}
      />

      <ChipStore leagueId={league.id} chips={chipRows} balance={balance} />
    </main>
  );
}
