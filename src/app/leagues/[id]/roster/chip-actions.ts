"use server";

import { revalidatePath } from "next/cache";

import { canPurchase, chipAvailability, CHIPS, type ChipId, type ChipUsage } from "@/lib/f1/chips";
import { ledgerBalance } from "@/lib/f1/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type ChipState = { error: string } | { ok: true; message: string } | null;

/**
 * Resolves the caller's membership and chip state.
 *
 * Every chip action re-derives this rather than trusting anything submitted:
 * a Server Action is reachable by direct POST, so the chip id, target and
 * member must all be checked server-side.
 */
type ChipContext =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createServerSupabase>>;
      memberId: string;
      season: number;
      usage: ChipUsage[];
      purchases: ChipId[];
      balance: number;
    };

async function loadContext(leagueId: string): Promise<ChipContext> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

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

  if (!membership) return { ok: false, error: "You are not a member of this league." };

  const league = membership.leagues as unknown as { season: number } | null;
  if (!league) return { ok: false, error: "League not found." };

  const [{ data: plays }, { data: purchases }, { data: ledger }] = await Promise.all([
    supabase
      .from("chip_plays")
      .select("chip_id, round")
      .eq("member_id", membership.id)
      .eq("season", league.season),
    supabase.from("chip_purchases").select("chip_id").eq("member_id", membership.id),
    supabase.from("cost_cap_entries").select("amount").eq("member_id", membership.id),
  ]);

  return {
    ok: true,
    supabase,
    memberId: membership.id,
    season: league.season,
    usage: (plays ?? []).map((play) => ({
      chipId: play.chip_id as ChipId,
      round: play.round,
    })) as ChipUsage[],
    purchases: (purchases ?? []).map((row) => row.chip_id as ChipId),
    balance: ledgerBalance(ledger ?? []),
  };
}

function isChipId(value: string): value is ChipId {
  return value in CHIPS;
}

export async function buyChip(_previous: ChipState, formData: FormData): Promise<ChipState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const chipId = String(formData.get("chipId") ?? "");
  if (!isChipId(chipId)) return { error: "Unknown chip." };

  const context = await loadContext(leagueId);
  if (!context.ok) return { error: context.error };

  const owned = context.purchases.filter((id) => id === chipId).length;
  const used = context.usage.filter((entry) => entry.chipId === chipId).length;

  const check = canPurchase(chipId, used, owned, context.balance);
  if (!check.allowed) return { error: check.reason ?? "Cannot buy that." };

  // Purchase and charge are written with the service role: cost_cap_entries
  // grants no INSERT to authenticated, since a member able to write their own
  // ledger could credit themselves.
  const admin = createAdminClient();

  const { error: purchaseError } = await admin
    .from("chip_purchases")
    .insert({ member_id: context.memberId, chip_id: chipId, price_paid: check.price });
  if (purchaseError) return { error: purchaseError.message };

  const { data: firstRound } = await admin
    .from("rounds")
    .select("round")
    .eq("season", context.season)
    .order("round")
    .limit(1)
    .maybeSingle();

  await admin.from("cost_cap_entries").insert({
    member_id: context.memberId,
    season: context.season,
    round: firstRound?.round ?? 1,
    amount: -check.price,
    reason: "chip_purchase",
    note: CHIPS[chipId].name,
  });

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, message: `Bought ${CHIPS[chipId].name}.` };
}

export async function playChip(_previous: ChipState, formData: FormData): Promise<ChipState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const chipId = String(formData.get("chipId") ?? "");
  const round = Number(formData.get("round"));
  const target = String(formData.get("target") ?? "").trim();

  if (!isChipId(chipId)) return { error: "Unknown chip." };
  if (!Number.isFinite(round)) return { error: "Missing round." };

  const context = await loadContext(leagueId);
  if (!context.ok) return { error: context.error };

  const owned = context.purchases.filter((id) => id === chipId).length;
  const state = chipAvailability(chipId, context.usage, owned, round);
  if (!state.available) return { error: state.reason ?? "That chip is not available." };

  const chip = CHIPS[chipId];
  if (chip.target !== "none" && !target) {
    return { error: `Choose which ${chip.target} to boost.` };
  }

  // RLS refuses an insert once the round has locked, so a late play is rejected
  // by the database rather than relying on this check alone.
  const { error } = await context.supabase.from("chip_plays").insert({
    member_id: context.memberId,
    season: context.season,
    round,
    chip_id: chipId,
    target_driver_id: chip.target === "driver" ? target : null,
    target_constructor_id: chip.target === "constructor" ? target : null,
  });

  if (error) {
    if (error.code === "23505") return { error: "That chip is already played this round." };
    return { error: error.message };
  }

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, message: `Played ${chip.name}.` };
}

export async function cancelChip(_previous: ChipState, formData: FormData): Promise<ChipState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const chipId = String(formData.get("chipId") ?? "");
  const round = Number(formData.get("round"));
  if (!isChipId(chipId)) return { error: "Unknown chip." };

  const context = await loadContext(leagueId);
  if (!context.ok) return { error: context.error };

  // Only possible before the round locks; the delete policy enforces that.
  const { error } = await context.supabase
    .from("chip_plays")
    .delete()
    .eq("member_id", context.memberId)
    .eq("season", context.season)
    .eq("round", round)
    .eq("chip_id", chipId);

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, message: `${CHIPS[chipId].name} cancelled.` };
}
