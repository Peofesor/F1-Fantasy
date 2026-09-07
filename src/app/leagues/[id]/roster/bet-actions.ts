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
  const timing = String(formData.get("timing") ?? "pre_race") as BetTiming;

  if (!isMarketId(marketId)) return { error: "Unknown market." };
  if (!selection) return { error: "Choose a selection." };
  if (!Number.isFinite(round)) return { error: "Missing round." };
  if (timing !== "pre_qualifying" && timing !== "pre_race") return { error: "Bad timing." };

  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, leagues(season)")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "You are not a member of this league." };
  const league = membership.leagues as unknown as { season: number } | null;
  if (!league) return { error: "League not found." };

  // The bank is the uncommitted balance. Cap tied up in a roster is not
  // available to bet with — a member cannot stake money that is currently a
  // driver (spec §8).
  const { data: ledger } = await supabase
    .from("cost_cap_entries")
    .select("amount")
    .eq("member_id", membership.id);

  const bank = ledgerBalance(ledger ?? []);
  const check = checkStake(stake, bank);
  if (!check.allowed) return { error: check.reason ?? "Stake not allowed." };

  // RLS refuses the insert once the round has locked, so a late bet at
  // pre-qualifying odds is rejected by the database, not just here.
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

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, message: `Bet placed on ${MARKETS[marketId].name}.` };
}
