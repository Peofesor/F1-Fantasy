import { MARKETS, MARKET_LIST, type BetTiming, type MarketId } from "@/lib/f1/betting";
import { loadMarketHistory } from "@/lib/f1/bet-history";
import { oddsFor } from "@/lib/f1/bet-odds";
import { loadMemberContext } from "../member-context";
import { LeagueNav } from "../league-nav";
import { BetsPanel, type PlacedBet } from "./bets-panel";

export const dynamic = "force-dynamic";

export default async function BetsPage({ params }: PageProps<"/leagues/[id]/bets">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <LeagueNav leagueId={league.id} active="bets" />
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to bet on.
        </p>
      </main>
    );
  }

  const { data: betRows } = await supabase
    .from("bets")
    .select("market_id, selection, stake, timing, outcome, returned")
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

  // Odds are per selection now, so every option carries its own price. Priced
  // once here rather than per option in the client, which cannot see history.
  const history = await loadMarketHistory(supabase, round.season);
  const odds: Record<string, Record<string, number>> = {};
  for (const market of MARKET_LIST) {
    const bySelection = history.get(market.id);
    if (!bySelection) continue;
    odds[market.id] = Object.fromEntries(
      [...bySelection.keys()].map((selection) => [
        selection,
        oddsFor(market.id, bySelection.get(selection)),
      ]),
    );
  }

  const nationalities = [...new Set([...round.driverNationalities.values()])].sort();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      <header className="space-y-2 pt-2">
        <LeagueNav leagueId={league.id} active="bets" />
        <h1 className="text-xl font-semibold tracking-tight">Bets</h1>
        <p className="text-sm text-zinc-500">
          {round.raceName} · round {round.round}
        </p>
      </header>

      <BetsPanel
        leagueId={league.id}
        round={round.round}
        bank={balance}
        bets={placedBets}
        drivers={[...round.driverNames.entries()].map(([driverId, name]) => ({
          id: driverId,
          name,
        }))}
        constructors={[...round.constructorNames.entries()].map(([constructorId, name]) => ({
          id: constructorId,
          name,
        }))}
        nationalities={nationalities}
        locked={Boolean(roster?.locked_at)}
        timing={(timingValue ?? "pre_qualifying") as BetTiming}
        hasRoster={Boolean(hasRoster)}
        odds={odds}
      />
    </main>
  );
}
