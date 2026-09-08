"use server";

import { revalidatePath } from "next/cache";

import { checkStake, MARKETS, type BetTiming, type MarketId } from "@/lib/f1/betting";
import { ledgerBalance } from "@/lib/f1/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type BetState = { error: string } | { ok: true; message: string } | null;

function isMarketId(value: string): value is MarketId {
  return value in MARKETS;
}

/**
 * Places a bet.
 *
 * The stake is charged immediately rather than at settlement: a bet that could
 * be placed without the cap actually leaving the bank would let a member stake
 * the same cost cap on every market at once.
 */
export async function placeBet(_previous: BetState, formData: FormData): Promise<BetState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const leagueId = String(formData.get("leagueId") ?? "");
  const marketId = String(formData.get("marketId") ?? "");
  const selection = String(formData.get("selection") ?? "").trim();
  const stake = Number(formData.get("stake"));
  const round = Number(formData.get("round"));
  // Which odds window this bet falls in is read from the database, never from
  // the form: once betting runs past qualifying, a submitted value could claim
  // the pre-qualifying bonus after seeing the grid.

  if (!isMarketId(marketId)) return { error: "Unknown market." };
  if (!selection) return { error: "Choose a selection." };
  if (!Number.isFinite(round)) return { error: "Missing round." };

  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("league_members")
    // The FK is named explicitly because duel_fixtures references both
    // leagues and league_members, so PostgREST sees a second relationship
    // between them and refuses an unqualified embed.
    .select("id, leagues!league_members_league_id_fkey(season)")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "You are not a member of this league." };
  const league = membership.leagues as unknown as { season: number } | null;
  if (!league) return { error: "League not found." };

  // The bank is the uncommitted balance. Cap tied up in a roster is not
  // available to bet with — a member cannot stake money that is currently a
  // driver (spec §8).
  const { data: timingValue } = await supabase.rpc("current_bet_timing", {
    target_season: league.season,
    target_round: round,
  });
  const timing = (timingValue ?? "pre_qualifying") as BetTiming;

  const { data: ledger } = await supabase
    .from("cost_cap_entries")
    .select("amount")
    .eq("member_id", membership.id);

  const bank = ledgerBalance(ledger ?? []);
  const check = checkStake(stake, bank);
  if (!check.allowed) return { error: check.reason ?? "Stake not allowed." };

  // RLS refuses the insert once the race has started, and refuses a row whose
  // timing disagrees with the clock, so both rules hold against a direct POST.
  const { error } = await supabase.from("bets").insert({
    member_id: membership.id,
    season: league.season,
    round,
    market_id: marketId,
    selection,
    stake,
    timing,
  });

  if (error) {
    if (error.code === "23505") return { error: "You already have a bet on that market." };
    return { error: error.message };
  }

  // Charged with the service role: cost_cap_entries grants no INSERT to
  // authenticated, and the amount is the validated stake, not form input.
  const admin = createAdminClient();
  await admin.from("cost_cap_entries").insert({
    member_id: membership.id,
    season: league.season,
    round,
    amount: -stake,
    reason: "bet_stake",
    note: `${MARKETS[marketId].name} · ${selection}`,
  });

  revalidatePath(`/leagues/${leagueId}/bets`);
  return { ok: true, message: `Bet placed on ${MARKETS[marketId].name}.` };
}

/**
 * Withdraws an open bet and returns the stake.
 *
 * Allowed until the race starts, which is the same "change your mind up to the
 * deadline" the roster already has. A settled bet is history and cannot be
 * touched — the database enforces both, so a direct POST cannot claw back a
 * losing stake after the fact.
 */
export async function cancelBet(
  _previous: BetState,
  formData: FormData,
): Promise<BetState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const marketId = String(formData.get("marketId") ?? "") as MarketId;
  const round = Number(formData.get("round") ?? 0);

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, leagues!league_members_league_id_fkey(season)")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "Not a member of this league." };
  const league = membership.leagues as unknown as { season: number };

  // Read the stake before deleting it: the refund has to match what was taken,
  // and the row is gone immediately afterwards.
  const { data: bet } = await supabase
    .from("bets")
    .select("stake, outcome")
    .eq("member_id", membership.id)
    .eq("season", league.season)
    .eq("round", round)
    .eq("market_id", marketId)
    .maybeSingle();

  if (!bet) return { error: "That bet is no longer there." };
  if (bet.outcome !== null) return { error: "That bet has already been settled." };

  const { error, count } = await supabase
    .from("bets")
    .delete({ count: "exact" })
    .eq("member_id", membership.id)
    .eq("season", league.season)
    .eq("round", round)
    .eq("market_id", marketId);

  if (error) return { error: error.message };
  // RLS returns success with nothing deleted once the race has started.
  if (!count) return { error: "The race has started — that bet is locked in." };

  const admin = createAdminClient();
  await admin.from("cost_cap_entries").insert({
    member_id: membership.id,
    season: league.season,
    round,
    amount: Number(bet.stake),
    reason: "bet_payout",
    note: `Withdrew bet · ${MARKETS[marketId]?.name ?? marketId}`,
  });

  revalidatePath(`/leagues/${leagueId}/bets`);
  return { ok: true, message: `Bet withdrawn, ${Number(bet.stake).toFixed(1)} returned.` };
}
