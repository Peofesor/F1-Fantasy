import type { SupabaseClient } from "@supabase/supabase-js";

import { loadMarketHistory } from "@/lib/f1/bet-history";
import { oddsFor } from "@/lib/f1/bet-odds";
import { marketsForRound, type MarketId } from "@/lib/f1/betting";
import type { RoundContext } from "@/lib/f1/round-context";

/**
 * Everything the bet form needs that the member context does not already hold.
 *
 * Two pages now carry the form — the paddock, where a bet is one errand beside
 * the chip store, and the bets page, where the slip you are reading is the
 * reason you want to place another. Loading it in one place is what stops the
 * two from quoting different prices or offering a sprint market on different
 * weekends.
 */
export interface BetForm {
  drivers: { id: string; name: string }[];
  constructors: { id: string; name: string }[];
  nationalities: string[];
  /** Price per market per selection. Null means the house will not take it. */
  odds: Record<string, Record<string, number | null>>;
  markets: MarketId[];
  /** Whether a full roster is saved for the round. Betting waits on it. */
  hasRoster: boolean;
  /** Qualifying has started, or the round was frozen by hand. */
  locked: boolean;
}

export async function loadBetForm(
  supabase: SupabaseClient,
  memberId: string,
  round: RoundContext,
): Promise<BetForm> {
  // Betting closes when qualifying starts, on the same clock as the roster —
  // one deadline for the whole round. Asked of the database rather than derived
  // here, so the form shuts on the same answer the insert policy will give.
  // `locked_at` stays beside it as the manual freeze it has always been.
  const [{ data: roster }, { data: qualifyingStarted }, { data: hasRoster }, history] =
    await Promise.all([
      supabase
        .from("rosters")
        .select("locked_at")
        .eq("member_id", memberId)
        .eq("season", round.season)
        .eq("round", round.round)
        .maybeSingle(),
      supabase.rpc("is_round_locked", {
        target_season: round.season,
        target_round: round.round,
      }),
      // Betting is gated on having a team, since both come out of the same cap.
      supabase.rpc("fields_complete_roster", {
        target_member: memberId,
        target_season: round.season,
        target_round: round.round,
      }),
      loadMarketHistory(supabase, round.season),
    ]);

  // Sprint markets exist only on a sprint weekend. Settlement already voids
  // them elsewhere, but a voided bet is discovered on Sunday night — by which
  // point the player has spent a weekend holding a slip that was never going to
  // pay. Not offering it is the same rule applied at the only useful moment.
  const marketsThisRound = marketsForRound(round.hasSprint);

  // Odds are per selection, so every option carries its own price. Priced once
  // here rather than per option in the client, which cannot see history.
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
  return {
    drivers: [...round.driverPrices.keys()].map((driverId) => ({
      id: driverId,
      name: round.driverNames.get(driverId) ?? driverId,
    })),
    constructors: [...round.constructorPrices.keys()].map((constructorId) => ({
      id: constructorId,
      name: round.constructorNames.get(constructorId) ?? constructorId,
    })),
    nationalities: [...new Set([...round.driverNationalities.values()])].sort(),
    odds,
    markets: marketsThisRound.map((market) => market.id),
    hasRoster: Boolean(hasRoster),
    locked: Boolean(roster?.locked_at) || Boolean(qualifyingStarted),
  };
}
