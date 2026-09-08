import Link from "next/link";

import { EMPTY_SELECTION, type RosterSelection } from "@/lib/f1/roster";
import { FREE_CHANGES_PER_ROUND, spendableCap } from "@/lib/f1/ledger";
import {
  CHIP_LIST,
  chipAvailability,
  toChipRow,
  type ChipId,
  type ChipUsage,
} from "@/lib/f1/chips";
import { loadMemberContext } from "../member-context";
import { LeagueNav } from "../league-nav";
import { RosterBuilder, type PickOption } from "./roster-builder";

export const dynamic = "force-dynamic";

interface SlotRow {
  slot_type: string;
  slot_index: number;
  driver_id: string | null;
  constructor_id: string | null;
}

/** Rebuilds a selection from stored slots so an existing roster reopens as picked. */
function selectionFromSlots(
  slots: SlotRow[],
  captains: { top_captain_id: string | null; mid_captain_id: string | null } | null,
): RosterSelection {
  const ordered = [...slots].sort((a, b) => a.slot_index - b.slot_index);
  const drivers = (type: string) =>
    ordered.filter((slot) => slot.slot_type === type).map((slot) => slot.driver_id ?? "");
  const constructor = (type: string) =>
    ordered.find((slot) => slot.slot_type === type)?.constructor_id ?? null;

  // Constructor order carries meaning — index 0 is the top-bracket slot — so
  // the two are read by name rather than by however they came back.
  const constructors = [constructor("constructor_top"), constructor("constructor_mid")];

  return {
    top: drivers("driver_top").filter(Boolean),
    mid: drivers("driver_mid").filter(Boolean),
    backmarker: ordered.find((s) => s.slot_type === "driver_backmarker")?.driver_id ?? null,
    constructors: constructors.filter((value): value is string => Boolean(value)),
    reverseConstructor: constructor("constructor_reverse"),
    topCaptainId: captains?.top_captain_id ?? null,
    midCaptainId: captains?.mid_captain_id ?? null,
  };
}

export default async function RosterPage({ params }: PageProps<"/leagues/[id]/roster">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <LeagueNav leagueId={league.id} active="roster" />
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to pick for.
        </p>
      </main>
    );
  }

  const { data: existingRoster } = await supabase
    .from("rosters")
    .select(
      "id, locked_at, transfers_used, top_captain_id, mid_captain_id, roster_slots(slot_type, slot_index, driver_id, constructor_id)",
    )
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round)
    .maybeSingle();

  const slots = (existingRoster?.roster_slots ?? []) as unknown as SlotRow[];

  // Spending power is the bank plus what is already held: the current roster
  // is an asset that gets sold back when a slot is swapped.
  const heldValue = slots.reduce((total, slot) => {
    if (slot.driver_id) return total + (round.driverPrices.get(slot.driver_id) ?? 0);
    if (slot.constructor_id) return total + (round.constructorPrices.get(slot.constructor_id) ?? 0);
    return total;
  }, 0);

  const costCap = spendableCap(balance, heldValue);

  // Open bets for this round, so the Bets button can say there is something
  // waiting rather than making you go and look.
  const { count: betsPlaced } = await supabase
    .from("bets")
    .select("*", { count: "exact", head: true })
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round);

  // Chip state for the whole season, so "already played this round" and how
  // many uses are left are both answerable without a second page.
  const [{ data: chipPlays }, { data: chipPurchases }] = await Promise.all([
    supabase
      .from("chip_plays")
      .select("chip_id, round, target_driver_id, target_constructor_id")
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
    const state = chipAvailability(definition.id, usage, owned, round.round);
    const played = (chipPlays ?? []).find(
      (play) => play.chip_id === definition.id && play.round === round.round,
    );
    const targetId = played?.target_driver_id ?? played?.target_constructor_id ?? undefined;
    const targetName = targetId
      ? (round.driverNames.get(targetId) ?? round.constructorNames.get(targetId) ?? targetId)
      : undefined;
    return toChipRow(state, Boolean(played), targetName);
  });

  // Chips target the roster, so the picker only offers what is actually fielded.
  const selection = slots.length
    ? selectionFromSlots(slots, existingRoster ?? null)
    : EMPTY_SELECTION;
  const chipDriverOptions = [...selection.top, ...selection.mid].map((driverId) => ({
    id: driverId,
    name: round.driverNames.get(driverId) ?? driverId,
  }));
  const chipConstructorOptions = selection.constructors.map((constructorId) => ({
    id: constructorId,
    name: round.constructorNames.get(constructorId) ?? constructorId,
  }));

  const drivers: PickOption[] = [...round.driverPrices.entries()]
    .map(([driverId, price]) => ({
      id: driverId,
      name: round.driverNames.get(driverId) ?? driverId,
      // Surname only on the card; "Andrea Kimi Antonelli" does not fit one.
      shortName: (round.driverNames.get(driverId) ?? driverId).split(" ").slice(-1)[0],
      subtitle: (() => {
        const constructorId = round.driverTeams.get(driverId);
        return constructorId
          ? (round.constructorNames.get(constructorId) ?? constructorId)
          : "";
      })(),
      price,
      tier: round.tiers.get(driverId) ?? "mid",
      headshotUrl: round.driverHeadshots.get(driverId),
      colour: round.driverColours.get(driverId),
      form: round.driverForm.get(driverId) ?? 0,
    }))
    .sort((a, b) => b.price - a.price);

  const constructors: PickOption[] = [...round.constructorPrices.entries()]
    .map(([constructorId, price]) => {
      const lineup = round.constructorDriverIds.get(constructorId) ?? [];
      return {
        id: constructorId,
        name: round.constructorNames.get(constructorId) ?? constructorId,
        shortName: round.constructorNames.get(constructorId) ?? constructorId,
        // A team has no portrait of its own, so it is shown as its line-up.
        subtitle: lineup
          .map((driverId) => round.driverNames.get(driverId)?.split(" ").slice(-1)[0] ?? driverId)
          .join(" / "),
        price,
        tier: round.constructorTiers.get(constructorId) ?? "mid",
        colour: round.constructorColours.get(constructorId),
        lineup: lineup.map((driverId) => ({
          name: round.driverNames.get(driverId) ?? driverId,
          headshotUrl: round.driverHeadshots.get(driverId),
        })),
        form: round.constructorForm.get(constructorId) ?? 0,
      };
    })
    .sort((a, b) => b.price - a.price);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <header className="space-y-2 pt-2">
        <LeagueNav leagueId={league.id} active="roster" />
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{round.raceName}</h1>
          <Link
            href="/rules"
            className="shrink-0 text-xs text-zinc-500 underline underline-offset-4"
          >
            Scoring
          </Link>
        </div>
      </header>

      <RosterBuilder
        leagueId={league.id}
        costCap={costCap}
        transfersUsed={existingRoster?.transfers_used ?? 0}
        freeTransfers={FREE_CHANGES_PER_ROUND}
        drivers={drivers}
        constructors={constructors}
        initialSelection={selection}
        locked={Boolean(existingRoster?.locked_at)}
        round={round.round}
        balance={balance}
        chips={chipRows}
        chipDriverOptions={chipDriverOptions}
        chipConstructorOptions={chipConstructorOptions}
        betsPlaced={betsPlaced ?? 0}
      />
    </main>
  );
}
