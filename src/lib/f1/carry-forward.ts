import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRoundContext, type RoundContext } from "./round-context";
import type { Tier } from "./tiers";

/**
 * Carrying a roster into the next round.
 *
 * Your team persists. Without this, every round began with an empty grid, which
 * quietly broke the whole transfer design: "2 free changes then a fee" assumes
 * there is something to change, and a member who never opened the app scored
 * zero rather than fielding the team they already had.
 *
 * Carrying forward moves no money. The drivers were bought when they were first
 * picked, and price drift is credited separately by scoring, so re-recording a
 * purchase here would charge for them twice.
 *
 * The carry is DERIVED first and written second. `carriedRoster` answers "what
 * would this member field if they never touched it" from the rounds already
 * stored, and the nightly job is only the thing that makes that answer
 * permanent. Reading it live is what keeps the promise between the two: the
 * round opens the moment qualifying starts, the job runs at six in the morning,
 * and in the hours between them a member who looked at their roster saw an
 * empty grid and a bank of nothing — their team apparently deleted, their cost
 * cap apparently spent. Everything that shows or spends a roster reads through
 * here instead, so the job's schedule is invisible.
 */

export interface CarryForwardReport {
  season: number;
  round: number;
  created: number;
  autoSwapped: { memberId: string; out: string; in: string }[];
  skipped: number;
}

interface SlotRow {
  slot_type: string;
  slot_index: number;
  driver_id: string | null;
  constructor_id: string | null;
}

/** One slot of a carried team, valued at the round it is carried into. */
export interface CarriedSlot extends SlotRow {
  price: number;
}

/**
 * The team a member fields this round without having touched it.
 *
 * Auto-swaps are already applied and the captains already follow them, so this
 * is what the nightly job would write — the same answer whether it has run yet
 * or not.
 */
export interface CarriedRoster {
  /** The round it came from, so a page can say where the team came from. */
  fromRound: number;
  slots: CarriedSlot[];
  topCaptainId: string | null;
  midCaptainId: string | null;
  autoSwapped: { out: string; in: string }[];
}

/**
 * Which bracket a slot demands, or null if the slot is unrestricted.
 *
 * The backmarker slot takes anyone, and the reverse-scored team is judged on
 * placing rather than tier, so neither can ever fall out of its bracket.
 */
function requiredTier(slotType: string): Tier | null {
  switch (slotType) {
    case "driver_top":
    case "constructor_top":
      return "top";
    case "driver_mid":
    case "constructor_mid":
      return "mid";
    default:
      return null;
  }
}

/**
 * Replaces a competitor who no longer belongs in their slot's bracket.
 *
 * This is the auto-swap rule (spec §4): a member never has to fix a roster that
 * became illegal through someone else's results. The replacement is the
 * cheapest eligible pick not already on the roster — cheapest rather than
 * best, because the swap is involuntary and should not silently spend cap the
 * member has not got.
 */
function findReplacement(
  wanted: Tier,
  taken: Set<string>,
  tiers: ReadonlyMap<string, Tier>,
  prices: ReadonlyMap<string, number>,
): string | null {
  const candidates = [...tiers.entries()]
    .filter(([id, tier]) => tier === wanted && !taken.has(id))
    .map(([id]) => id)
    .sort((a, b) => (prices.get(a) ?? 0) - (prices.get(b) ?? 0));

  return candidates[0] ?? null;
}

/**
 * What a member carries into the round `context` describes, or null if there is
 * nothing to carry.
 *
 * Null covers two cases that look the same from here and are the same to the
 * caller: a member who has never picked a team, and one who already has a
 * roster for this round — the second is not carried because it has already
 * arrived. Callers that need to tell them apart read the roster themselves
 * first, which they do anyway.
 */
export async function carriedRoster(
  supabase: SupabaseClient,
  memberId: string,
  context: RoundContext,
): Promise<CarriedRoster | null> {
  // The most recent roster before this round is what carries over.
  const { data: previous } = await supabase
    .from("rosters")
    .select(
      "id, round, top_captain_id, mid_captain_id, roster_slots(slot_type, slot_index, driver_id, constructor_id)",
    )
    .eq("member_id", memberId)
    .eq("season", context.season)
    .lt("round", context.round)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  const slots = (previous?.roster_slots ?? []) as unknown as SlotRow[];
  if (!previous || slots.length === 0) return null;

  const autoSwapped: { out: string; in: string }[] = [];
  const taken = new Set(
    slots.map((slot) => slot.driver_id ?? slot.constructor_id ?? "").filter(Boolean),
  );

  const carried: CarriedSlot[] = slots.map((slot) => {
    let driverId = slot.driver_id;
    let constructorId = slot.constructor_id;

    // Drivers and teams are both bracketed now, so either can fall out of a
    // slot it used to be eligible for.
    const wanted = requiredTier(slot.slot_type);
    const held = driverId ?? constructorId;
    const tiers = driverId ? context.tiers : context.constructorTiers;
    const prices = driverId ? context.driverPrices : context.constructorPrices;

    if (wanted && held && tiers.get(held) !== wanted) {
      const replacement = findReplacement(wanted, taken, tiers, prices);
      if (replacement) {
        autoSwapped.push({ out: held, in: replacement });
        taken.delete(held);
        taken.add(replacement);
        if (driverId) driverId = replacement;
        else constructorId = replacement;
      }
    }

    return {
      slot_type: slot.slot_type,
      slot_index: slot.slot_index,
      driver_id: driverId,
      constructor_id: constructorId,
      // Valued at this round's price, since that is what the slot is worth now;
      // the ledger values sales at the current price too.
      price: driverId
        ? (context.driverPrices.get(driverId) ?? 0)
        : (context.constructorPrices.get(constructorId ?? "") ?? 0),
    };
  });

  // Captains carry over too, following an auto-swapped driver onto their
  // replacement. A member who never opens the app keeps the captains they chose
  // rather than fielding a team with no multiplier at all.
  const swapped = new Map(autoSwapped.map((swap) => [swap.out, swap.in]));
  const stillHeld = new Set(
    carried.map((slot) => slot.driver_id ?? slot.constructor_id).filter(Boolean),
  );
  const follow = (nominated: string | null): string | null => {
    if (!nominated) return null;
    const replacement = swapped.get(nominated) ?? nominated;
    return stillHeld.has(replacement) ? replacement : null;
  };

  return {
    fromRound: previous.round as number,
    slots: carried,
    topCaptainId: follow((previous.top_captain_id as string | null) ?? null),
    midCaptainId: follow((previous.mid_captain_id as string | null) ?? null),
    autoSwapped,
  };
}

export async function carryForwardRosters(
  supabase: SupabaseClient,
  season: number,
): Promise<CarryForwardReport> {
  const context = await loadRoundContext(supabase, season);
  if (!context) {
    return { season, round: 0, created: 0, autoSwapped: [], skipped: 0 };
  }

  const { round } = context;
  const report: CarryForwardReport = {
    season,
    round,
    created: 0,
    autoSwapped: [],
    skipped: 0,
  };

  // Members of any league running this season.
  const { data: members } = await supabase
    .from("league_members")
    .select("id, leagues!league_members_league_id_fkey(season)");

  const relevant = (members ?? []).filter(
    (row) => (row.leagues as unknown as { season: number } | null)?.season === season,
  );

  for (const member of relevant) {
    const { data: existing } = await supabase
      .from("rosters")
      .select("id")
      .eq("member_id", member.id)
      .eq("season", season)
      .eq("round", round)
      .maybeSingle();

    if (existing) {
      report.skipped++;
      continue;
    }

    const carry = await carriedRoster(supabase, member.id, context);
    if (!carry) {
      // Nothing to carry: a member who has never picked still starts empty.
      report.skipped++;
      continue;
    }

    const { data: created, error } = await supabase
      .from("rosters")
      .insert({ member_id: member.id, season, round })
      .select("id")
      .single();

    if (error || !created) continue;

    const { error: slotError } = await supabase.from("roster_slots").insert(
      carry.slots.map((slot) => ({
        roster_id: created.id,
        slot_type: slot.slot_type,
        slot_index: slot.slot_index,
        driver_id: slot.driver_id,
        constructor_id: slot.constructor_id,
        price_paid: slot.price,
      })),
    );

    await supabase
      .from("rosters")
      .update({
        top_captain_id: carry.topCaptainId,
        mid_captain_id: carry.midCaptainId,
      })
      .eq("id", created.id);

    for (const swap of carry.autoSwapped) {
      report.autoSwapped.push({ memberId: member.id, ...swap });
    }

    if (!slotError) report.created++;
  }

  return report;
}
