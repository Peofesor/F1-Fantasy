"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { loadRoundContext } from "@/lib/f1/round-context";
import { validateRoster, type RosterSelection } from "@/lib/f1/roster";

export type SaveState = { error: string } | { ok: true; savedAt: string } | null;

interface SlotRow {
  roster_id: string;
  slot_type: string;
  slot_index: number;
  driver_id: string | null;
  constructor_id: string | null;
  price_paid: number;
}

function parseSelection(formData: FormData): RosterSelection {
  const list = (key: string) =>
    String(formData.get(key) ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  const single = (key: string) => {
    const value = String(formData.get(key) ?? "").trim();
    return value === "" ? null : value;
  };

  return {
    top: list("top"),
    mid: list("mid"),
    backmarker: single("backmarker"),
    constructors: list("constructors"),
    reverseConstructor: single("reverseConstructor"),
  };
}

/**
 * Saves a roster for the current round.
 *
 * The selection is re-validated here against server-side tiers and prices. The
 * builder validates as you pick, but a Server Action is reachable by direct
 * POST, so client-side checks are a convenience and never a guarantee — prices
 * in particular must come from the database, not from the submitted form, or a
 * crafted request could buy a 28-point driver for nothing.
 */
export async function saveRoster(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) return { error: "Missing league." };

  const supabase = await createServerSupabase();

  // RLS restricts this to leagues the caller belongs to, so a membership row
  // coming back is itself the authorisation check.
  const { data: membership } = await supabase
    .from("league_members")
    .select("id, leagues(id, season, starting_cost_cap)")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "You are not a member of this league." };

  const league = membership.leagues as unknown as {
    season: number;
    starting_cost_cap: number;
  } | null;
  if (!league) return { error: "League not found." };

  const context = await loadRoundContext(supabase, league.season);
  if (!context) return { error: "No round available to pick for yet." };

  const selection = parseSelection(formData);
  const validation = validateRoster(selection, {
    tiers: context.tiers,
    driverPrices: context.driverPrices,
    constructorPrices: context.constructorPrices,
    costCap: Number(league.starting_cost_cap),
  });

  if (!validation.valid) return { error: validation.errors.join(" ") };

  const { data: roster, error: rosterError } = await supabase
    .from("rosters")
    .upsert(
      { member_id: membership.id, season: context.season, round: context.round },
      { onConflict: "member_id,season,round" },
    )
    .select("id, locked_at")
    .single();

  if (rosterError) return { error: rosterError.message };
  if (roster.locked_at) return { error: "This round has locked; the roster can no longer change." };

  const slots: SlotRow[] = [
    ...selection.top.map((driverId, index) => ({
      roster_id: roster.id,
      slot_type: "driver_top",
      slot_index: index + 1,
      driver_id: driverId,
      constructor_id: null,
      price_paid: context.driverPrices.get(driverId) ?? 0,
    })),
    ...selection.mid.map((driverId, index) => ({
      roster_id: roster.id,
      slot_type: "driver_mid",
      slot_index: index + 1,
      driver_id: driverId,
      constructor_id: null,
      price_paid: context.driverPrices.get(driverId) ?? 0,
    })),
    {
      roster_id: roster.id,
      slot_type: "driver_backmarker",
      slot_index: 1,
      driver_id: selection.backmarker,
      constructor_id: null,
      price_paid: context.driverPrices.get(selection.backmarker!) ?? 0,
    },
    ...selection.constructors.map((constructorId, index) => ({
      roster_id: roster.id,
      slot_type: "constructor",
      slot_index: index + 1,
      driver_id: null,
      constructor_id: constructorId,
      price_paid: context.constructorPrices.get(constructorId) ?? 0,
    })),
    {
      roster_id: roster.id,
      slot_type: "constructor_reverse",
      slot_index: 1,
      driver_id: null,
      constructor_id: selection.reverseConstructor,
      price_paid: context.constructorPrices.get(selection.reverseConstructor!) ?? 0,
    },
  ];

  // Replaced wholesale: slot identity is positional, so editing in place would
  // need a diff for no benefit. Deleting first also avoids tripping the
  // one-driver-per-roster unique index while a swap is half-applied.
  const { error: clearError } = await supabase
    .from("roster_slots")
    .delete()
    .eq("roster_id", roster.id);
  if (clearError) return { error: clearError.message };

  const { error: insertError } = await supabase.from("roster_slots").insert(slots);
  if (insertError) return { error: insertError.message };

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, savedAt: new Date().toISOString() };
}
