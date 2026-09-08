import { MARKETS, MARKET_LIST, type BetTiming, type MarketId } from "@/lib/f1/betting";
import { loadMarketHistory } from "@/lib/f1/bet-history";
import { oddsFor } from "@/lib/f1/bet-odds";
import {
  CHIP_LIST,
  chipAvailability,
  toChipRow,
  type ChipId,
  type ChipUsage,
} from "@/lib/f1/chips";
import { loadMemberContext } from "../member-context";
import { ChipStore } from "./chip-store";
import { LeagueNav } from "../league-nav";
import { BetsPanel, type PlacedBet } from "./bets-panel";

export const dynamic = "force-dynamic";

export default async function BetsPage({ params }: PageProps<"/leagues/[id]/paddock">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance, half } = await loadMemberContext(id);

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
      timing: bet.timing as BetTiming,
      outcome: bet.outcome,
      returned: bet.returned === null ? null : Number(bet.returned),
      odds: bet.odds === null || bet.odds === undefined ? null : Number(bet.odds),
    };
  });

  // Betting closes on the same clock as the roster, so a bet can never be
  // placed once any part of the weekend has run.
  const { data: roster } = await supabase
    .from("rosters")
    .select("locked_at")
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round)
    .maybeSingle();

  // Which odds window a bet placed now falls in — decided by the database from
  // the qualifying time, and decided again when the bet is actually submitted.
  const { data: timingValue } = await supabase.rpc("current_bet_timing", {
    target_season: round.season,
    target_round: round.round,
  });

  // Betting is gated on having a team, since both come out of the same cap.
  const { data: hasRoster } = await supabase.rpc("has_complete_roster", {
    target_member: memberId,
    target_season: round.season,
    target_round: round.round,
  });

  // Sprint markets exist only on a sprint weekend. Settlement already voids
  // them elsewhere, but a voided bet is discovered on Sunday night — by which
  // point the player has spent a weekend holding a slip that was never going to
  // pay. Not offering it is the same rule applied at the only useful moment.
  const marketsThisRound = MARKET_LIST.filter(
    (market) => !market.sprintOnly || round.hasSprint === true,
  );

  // Odds are per selection now, so every option carries its own price. Priced
  // once here rather than per option in the client, which cannot see history.
  const history = await loadMarketHistory(supabase, round.season);
  const odds: Record<string, Record<string, number | null>> = {};
  for (const market of marketsThisRound) {
    const bySelection = history.get(market.id);
    if (!bySelection) continue;
    // Null is carried through rather than dropped: a selection the house will
    // not take is not the same as one nobody has raced yet, and the client
    // falls back to the listed price for the second. Dropping the first would
    // quote a withdrawn near-certainty at its listed odds — the widest hole of
    // the lot.
    odds[market.id] = Object.fromEntries(
      [...bySelection.keys()].map((selection) => [
        selection,
        oddsFor(market.id, bySelection.get(selection)),
      ]),
    );
  }

  // Priced competitors only. driverNames holds every driver the reference data
  // has ever seen, which was offering bets on Magnussen and Sargeant in a 2026
  // race; the price list is built from this season's results.
  const bettableDrivers = [...round.driverPrices.keys()].map((driverId) => ({
    id: driverId,
    name: round.driverNames.get(driverId) ?? driverId,
  }));

  const bettableConstructors = [...round.constructorPrices.keys()].map((constructorId) => ({
    id: constructorId,
    name: round.constructorNames.get(constructorId) ?? constructorId,
  }));

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

  const nationalities = [...new Set([...round.driverNationalities.values()])].sort();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      <header className="space-y-3 pt-2">
        <LeagueNav leagueId={league.id} active="paddock" />

        {/* The bank leads: everything on this page spends it, and how much is
            left is the number that decides what you do next. */}
        <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Paddock · to spend
              </p>
              <p className="mt-0.5 text-3xl font-semibold tabular-nums leading-none">
                {balance.toFixed(1)}
              </p>
            </div>
            <p className="shrink-0 text-right text-xs text-zinc-500">
              {round.raceName}
              <span className="block">Round {round.round}</span>
            </p>
          </div>
        </div>
      </header>

      <ChipStore leagueId={league.id} chips={chipRows} balance={balance} />

      <BetsPanel
        leagueId={league.id}
        round={round.round}
        bank={balance}
        bets={placedBets}
        drivers={bettableDrivers}
        constructors={bettableConstructors}
        nationalities={nationalities}
        locked={Boolean(roster?.locked_at)}
        timing={(timingValue ?? "pre_qualifying") as BetTiming}
        hasRoster={Boolean(hasRoster)}
        odds={odds}
        markets={marketsThisRound.map((market) => market.id)}
        leagueLimit={league.max_stake}
      />
    </main>
  );
}
