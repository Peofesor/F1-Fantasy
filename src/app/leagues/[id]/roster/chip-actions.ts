"use server";

import { revalidatePath } from "next/cache";

import { canPurchase, chipAvailability, CHIPS, type ChipId, type ChipUsage } from "@/lib/f1/chips";
import { ledgerBalance } from "@/lib/f1/ledger";
import { money } from "@/lib/f1/money";
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

  // Bought in batches now, so the quantity is validated here rather than
  // trusted: it decides the charge.
  const quantity = Number(formData.get("quantity") ?? 1);

  const context = await loadContext(leagueId);
  if (!context.ok) return { error: context.error };

  const owned = context.purchases.filter((id) => id === chipId).length;
  const used = context.usage.filter((entry) => entry.chipId === chipId).length;

  const check = canPurchase(chipId, used, owned, context.balance, quantity);
  if (!check.allowed) return { error: check.reason ?? "Cannot buy that." };

  // Purchase and charge are written with the service role: cost_cap_entries
  // grants no INSERT to authenticated, since a member able to write their own
  // ledger could credit themselves.
  const admin = createAdminClient();

  // One row per chip, not one row with a count: a chip is spent individually
  // and the ledger already prices them one at a time, so a quantity column
  // would need unpacking everywhere it is read.
  const { error: purchaseError } = await admin.from("chip_purchases").insert(
    Array.from({ length: quantity }, () => ({
      member_id: context.memberId,
      chip_id: chipId,
      price_paid: check.price,
    })),
  );
  if (purchaseError) return { error: purchaseError.message };

  const { data: firstRound } = await admin
    .from("rounds")
    .select("round")
    .eq("season", context.season)
    .order("round")
    .limit(1)
    .maybeSingle();

  const { error: chargeError } = await admin.from("cost_cap_entries").insert({
    member_id: context.memberId,
    season: context.season,
    round: firstRound?.round ?? 1,
    amount: -check.total,
    reason: "chip_purchase",
    note: quantity > 1 ? `${CHIPS[chipId].name} ×${quantity}` : CHIPS[chipId].name,
  });

  // The chip is already in hand, so an ignored failure here hands it over
  // free. Handing it back is the consistent outcome, and the purchase row is
  // the only thing that has to be undone.
  if (chargeError) {
    await admin
      .from("chip_purchases")
      .delete()
      .in(
        "id",
        (
          await admin
            .from("chip_purchases")
            .select("id")
            .eq("member_id", context.memberId)
            .eq("chip_id", chipId)
            .order("id", { ascending: false })
            .limit(quantity)
        ).data?.map((row) => row.id) ?? [],
      );

    return { error: "Could not take the price from your cap, so the chip was not bought." };
  }

  revalidatePath(`/leagues/${leagueId}/roster`);
  return {
    ok: true,
    message:
      quantity > 1
        ? `Bought ${quantity} × ${CHIPS[chipId].name} for ${money(check.total)}.`
        : `Bought ${CHIPS[chipId].name}.`,
  };
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

  // The 3x landing on the driver who already has the 2x wastes the armband on a
  // slot that is boosted anyway. The player is asked where it should go
  // instead, and the move is written here rather than left to the next roster
  // save — the chip is played now, so the pair must be consistent now.
  //
  // Re-derived from the stored roster rather than trusted: which driver wears
  // which armband and which bracket a driver sits in are both facts the client
  // could lie about, and the pair decides the round's score.
  let armband: { rosterId: string; column: "top_captain_id" | "mid_captain_id"; heir: string } | null =
    null;

  if (chipId === "super_driver") {
    const { data: roster } = await context.supabase
      .from("rosters")
      .select("id, top_captain_id, mid_captain_id, roster_slots(slot_type, driver_id)")
      .eq("member_id", context.memberId)
      .eq("season", context.season)
      .eq("round", round)
      .maybeSingle();

    const bracket =
      roster?.top_captain_id === target ? "top" : roster?.mid_captain_id === target ? "mid" : null;

    if (roster && bracket) {
      const slotType = bracket === "top" ? "driver_top" : "driver_mid";
      const slots = (roster.roster_slots ?? []) as unknown as {
        slot_type: string;
        driver_id: string | null;
      }[];
      const eligible = slots
        .filter((slot) => slot.slot_type === slotType && slot.driver_id)
        .map((slot) => slot.driver_id as string);

      const heir = String(formData.get("captain") ?? "").trim();
      if (!heir || heir === target || !eligible.includes(heir)) {
        return {
          error: `${chip.name} is going on the driver who already has the 2x. Choose which other ${
            bracket === "top" ? "top" : "midfield"
          } driver takes it.`,
        };
      }

      armband = {
        rosterId: roster.id as string,
        column: bracket === "top" ? "top_captain_id" : "mid_captain_id",
        heir,
      };
    }
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
    // Recorded so taking the chip back can offer the armband back to whoever
    // lost it. Null on a play that displaced nothing, which is most of them.
    displaced_captain_id: armband ? target : null,
  });

  if (error) {
    if (error.code === "23505") return { error: "That chip is already played this round." };
    return { error: error.message };
  }

  // After the play, not before: a chip that turns out to be already played this
  // round should not have moved an armband on its way to being refused.
  if (armband) {
    const { data: moved, error: captainError } = await context.supabase
      .from("rosters")
      .update({ [armband.column]: armband.heir })
      .eq("id", armband.rosterId)
      .select("id");

    if (captainError || !moved || moved.length === 0) {
      return {
        error: `${chip.name} is played, but the 2x could not be moved${
          captainError ? `: ${captainError.message}` : " — move it in the picker."
        }`,
      };
    }
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

  // A SuperDriver play that moved an armband has to say where the 2x goes now.
  // The chip is about to stop existing, and leaving the armband on the driver
  // the chip chose would outlive the reason it was moved.
  const { data: play } = await context.supabase
    .from("chip_plays")
    .select("displaced_captain_id")
    .eq("member_id", context.memberId)
    .eq("season", context.season)
    .eq("round", round)
    .eq("chip_id", chipId)
    .maybeSingle();

  const displaced = play?.displaced_captain_id ?? null;
  let armband: { rosterId: string; column: "top_captain_id" | "mid_captain_id"; to: string } | null =
    null;

  if (displaced) {
    const { data: roster } = await context.supabase
      .from("rosters")
      .select("id, roster_slots(slot_type, driver_id)")
      .eq("member_id", context.memberId)
      .eq("season", context.season)
      .eq("round", round)
      .maybeSingle();

    if (!roster) return { error: "No roster for this round, so the 2x has nowhere to go." };

    const slots = (roster.roster_slots ?? []) as unknown as {
      slot_type: string;
      driver_id: string | null;
    }[];
    // The bracket is the one the displaced driver sits in, which is the only
    // bracket their armband was ever allowed to be in.
    const slotType = slots.find((slot) => slot.driver_id === displaced)?.slot_type;
    if (slotType !== "driver_top" && slotType !== "driver_mid") {
      return { error: "That driver is no longer on your roster, so pick the 2x in the picker." };
    }

    const eligible = slots
      .filter((slot) => slot.slot_type === slotType && slot.driver_id)
      .map((slot) => slot.driver_id as string);

    const chosen = String(formData.get("captain") ?? "").trim();
    if (!chosen || !eligible.includes(chosen)) {
      return { error: "Choose which driver takes the 2x back." };
    }

    armband = {
      rosterId: roster.id as string,
      column: slotType === "driver_top" ? "top_captain_id" : "mid_captain_id",
      to: chosen,
    };
  }

  // Only possible before the round locks; the delete policy enforces that —
  // and a delete the policy refuses is not an error, it is a delete that
  // removes nothing. Without asking for the removed rows back, a refusal was
  // indistinguishable from success and the chip appeared to come back while
  // the play stayed on the round.
  const { data: removed, error } = await context.supabase
    .from("chip_plays")
    .delete()
    .eq("member_id", context.memberId)
    .eq("season", context.season)
    .eq("round", round)
    .eq("chip_id", chipId)
    .select("id");

  if (error) return { error: error.message };
  if (!removed || removed.length === 0) {
    return { error: `${CHIPS[chipId].name} could not be taken back — the round may have locked.` };
  }

  // After the delete, so a refused take-back cannot move an armband on its way
  // to being refused.
  if (armband) {
    const { data: moved, error: captainError } = await context.supabase
      .from("rosters")
      .update({ [armband.column]: armband.to })
      .eq("id", armband.rosterId)
      .select("id");

    if (captainError || !moved || moved.length === 0) {
      return {
        error: `${CHIPS[chipId].name} was taken back, but the 2x could not be moved — set it in the picker.`,
      };
    }
  }

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, message: `${CHIPS[chipId].name} cancelled.` };
}
