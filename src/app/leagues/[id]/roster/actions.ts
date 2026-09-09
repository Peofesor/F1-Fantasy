"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { loadRoundContext } from "@/lib/f1/round-context";
import { validateRoster, type RosterSelection } from "@/lib/f1/roster";
import { rosterSlotRows } from "@/lib/f1/roster-slots";
import { EXTRA_CHANGE_FEE, ledgerBalance, rosterChangeEntries, spendableCap, summariseTransfers } from "@/lib/f1/ledger";
import { createAdminClient } from "@/lib/supabase/admin";

export type SaveState = { error: string } | { ok: true; savedAt: string } | null;

/**
 * Writes the ledger entries for a roster change.
 *
 * Uses the service-role client deliberately. `cost_cap_entries` grants no
 * INSERT to `authenticated` — a member able to write their own ledger could
 * credit themselves any balance. Every value here is computed server-side from
 * database prices and the roster diff, never from the submitted form, so
 * nothing the caller controls reaches the amounts.
 */
async function recordRosterLedger(input: {
  memberId: string;
  season: number;
  round: number;
  previousDrivers: string[];
  previousConstructors: string[];
  nextDrivers: string[];
  nextConstructors: string[];
  driverPrices: ReadonlyMap<string, number>;
  constructorPrices: ReadonlyMap<string, number>;
  chargeableChanges: number;
}): Promise<void> {
  const entries = [
    ...rosterChangeEntries(
      input.memberId,
      input.season,
      input.round,
      input.previousDrivers,
      input.nextDrivers,
      input.driverPrices,
      "driver",
    ),
    ...rosterChangeEntries(
      input.memberId,
      input.season,
      input.round,
      input.previousConstructors,
      input.nextConstructors,
      input.constructorPrices,
      "constructor",
    ),
  ];

  // The chargeable count is worked out by the caller, which knows how many
  // transfers this round has already used. Recomputing it here from the diff
  // alone would reset the free allowance on every save.
  if (input.chargeableChanges > 0) {
    entries.push({
      memberId: input.memberId,
      season: input.season,
      round: input.round,
      amount: -Math.round(input.chargeableChanges * EXTRA_CHANGE_FEE * 10) / 10,
      reason: "transfer_fee",
      note: `${input.chargeableChanges} change(s) beyond the free allowance`,
    });
  }

  if (entries.length === 0) return;

  const admin = createAdminClient();
  const { error } = await admin.from("cost_cap_entries").insert(
    entries.map((entry) => ({
      member_id: entry.memberId,
      season: entry.season,
      round: entry.round,
      amount: entry.amount,
      reason: entry.reason,
      note: entry.note ?? null,
    })),
  );

  // Raised, not ignored. This is the only thing that charges for a roster, and
  // the slots are already written by the time it runs — so a swallowed failure
  // hands out a free team and says nothing. It did exactly that: a member
  // joined, saved eleven picks, and kept their full opening budget, which the
  // roster page then added to the value of the squad they had not paid for and
  // showed as double the league's cap.
  //
  // Letting it throw is the lesser evil. The save reports an error the member
  // can act on, and the roster is recoverable; a silent one is not detectable
  // from inside the game at all.
  if (error) {
    throw new Error(`Could not record the cost of this roster: ${error.message}`);
  }
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
    topCaptainId: single("topCaptainId"),
    midCaptainId: single("midCaptainId"),
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
    // The FK is named explicitly because duel_fixtures references both
    // leagues and league_members, so PostgREST sees a second relationship
    // between them and refuses an unqualified embed.
    .select("id, leagues!league_members_league_id_fkey(id, season, starting_cost_cap)")
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

  // The spendable cap is the ledger balance, not the league's opening figure.
  // Validating against the opening cap would ignore every movement since —
  // price drift, backmarker payouts, fees — which is the whole point of the
  // ledger.
  const { data: ledgerRows } = await supabase
    .from("cost_cap_entries")
    .select("amount")
    .eq("member_id", membership.id);

  const balance = ledgerBalance(ledgerRows ?? []);

  // Three chips change what is permitted rather than how anything scores, so
  // they have to be read here rather than at scoring time.
  const { data: chipsInPlay } = await supabase
    .from("chip_plays")
    .select("chip_id")
    .eq("member_id", membership.id)
    .eq("season", context.season)
    .eq("round", context.round);

  const played = new Set((chipsInPlay ?? []).map((row) => row.chip_id));
  const wildcardPlayed = played.has("wildcard");
  const unlimitedCapPlayed = played.has("unlimited_cap");
  const finalFixPlayed = played.has("final_fix");

  // The existing roster is read before anything is written, because its value
  // is part of what the member can spend and its slots are what the ledger
  // diffs against.
  const { data: existingRoster } = await supabase
    .from("rosters")
    .select("id, locked_at, transfers_used, final_fix_used")
    .eq("member_id", membership.id)
    .eq("season", context.season)
    .eq("round", context.round)
    .maybeSingle();

  // Whether the round has locked, from the same clock the database uses.
  const { data: roundLocked } = await supabase.rpc("is_round_locked", {
    target_season: context.season,
    target_round: context.round,
  });

  const locked = Boolean(existingRoster?.locked_at) || roundLocked === true;

  if (locked && !finalFixPlayed) {
    return { error: "This round has locked; the roster can no longer change." };
  }
  if (locked && existingRoster?.final_fix_used) {
    return { error: "Final Fix has already been used on this roster." };
  }

  const { data: previousSlots } = existingRoster
    ? await supabase
        .from("roster_slots")
        .select("driver_id, constructor_id")
        .eq("roster_id", existingRoster.id)
    : { data: [] };

  const previousDrivers = (previousSlots ?? [])
    .map((slot) => slot.driver_id)
    .filter((id): id is string => Boolean(id));
  const previousConstructors = (previousSlots ?? [])
    .map((slot) => slot.constructor_id)
    .filter((id): id is string => Boolean(id));

  // Spending power is the bank plus the value of what is held: swapping a slot
  // sells the outgoing pick back at its current price. Validating against the
  // bank alone would double-count the original purchase and make every held
  // roster look unaffordable the moment it was bought.
  const heldValue =
    previousDrivers.reduce((total, id) => total + (context.driverPrices.get(id) ?? 0), 0) +
    previousConstructors.reduce(
      (total, id) => total + (context.constructorPrices.get(id) ?? 0),
      0,
    );

  // Unlimited Cost Cap removes the spending limit for the round. Tier rules
  // still apply — it buys budget, not a free hand.
  const costCap = unlimitedCapPlayed
    ? Number.MAX_SAFE_INTEGER
    : spendableCap(balance, heldValue);

  const selection = parseSelection(formData);
  const validation = validateRoster(selection, {
    tiers: context.tiers,
    constructorTiers: context.constructorTiers,
    driverPrices: context.driverPrices,
    constructorPrices: context.constructorPrices,
    costCap,
  });

  if (!validation.valid) return { error: validation.errors.join(" ") };

  const { data: roster, error: rosterError } = await supabase
    .from("rosters")
    .upsert(
      { member_id: membership.id, season: context.season, round: context.round },
      { onConflict: "member_id,season,round" },
    )
    .select("id, locked_at, transfers_used")
    .single();

  if (rosterError) return { error: rosterError.message };

  const nextDrivers = [...selection.top, ...selection.mid, selection.backmarker!];
  const nextConstructors = [...selection.constructors, selection.reverseConstructor!];

  const transfers = summariseTransfers(
    previousDrivers,
    previousConstructors,
    nextDrivers,
    nextConstructors,
    roster.transfers_used,
  );

  if (locked && transfers.changes !== 1) {
    return {
      error:
        transfers.changes === 0
          ? "Nothing changed. Final Fix swaps one slot after qualifying."
          : "Final Fix allows one change only — you have changed " +
            `${transfers.changes}.`,
    };
  }

  // Wildcard makes every change free for the round, which is the whole chip.
  const chargeableChanges = wildcardPlayed ? 0 : transfers.chargeable;

  // The fee comes out of the same cap the roster is bought from, so a roster
  // that fits exactly but leaves nothing for the fee is not affordable.
  const fee = wildcardPlayed ? 0 : transfers.fee;
  if (validation.cost + fee > costCap) {
    return {
      error:
        `That needs ${(validation.cost + fee).toFixed(1)} including a ` +
        `${fee.toFixed(1)} transfer fee, but your cap is ${costCap.toFixed(1)}.`,
    };
  }

  const slots = rosterSlotRows(
    roster.id,
    selection,
    context.driverPrices,
    context.constructorPrices,
  );

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

  await recordRosterLedger({
    memberId: membership.id,
    season: context.season,
    round: context.round,
    previousDrivers,
    previousConstructors,
    nextDrivers,
    nextConstructors,
    chargeableChanges,
    driverPrices: context.driverPrices,
    constructorPrices: context.constructorPrices,
  });

  // Captains sit on the roster row, so they are written on every save;
  // consumed transfer allowance persists, so a second save this round does not
  // reset it.
  await supabase
    .from("rosters")
    .update({
      top_captain_id: selection.topCaptainId,
      mid_captain_id: selection.midCaptainId,
      ...(transfers.changes > 0
        ? { transfers_used: roster.transfers_used + transfers.changes }
        : {}),
      ...(locked ? { final_fix_used: true } : {}),
    })
    .eq("id", roster.id);

  revalidatePath(`/leagues/${leagueId}/roster`);
  return { ok: true, savedAt: new Date().toISOString() };
}
