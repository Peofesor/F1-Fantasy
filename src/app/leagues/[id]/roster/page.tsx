import Link from "next/link";

import { EMPTY_SELECTION, type RosterSelection } from "@/lib/f1/roster";
import { FREE_CHANGES_PER_ROUND, spendableCap } from "@/lib/f1/ledger";
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
function selectionFromSlots(slots: SlotRow[]): RosterSelection {
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
      "id, locked_at, transfers_used, roster_slots(slot_type, slot_index, driver_id, constructor_id)",
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

  const drivers: PickOption[] = [...round.driverPrices.entries()]
    .map(([driverId, price]) => ({
      id: driverId,
      name: round.driverNames.get(driverId) ?? driverId,
      subtitle: round.driverTeams.get(driverId) ?? "",
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
        initialSelection={slots.length ? selectionFromSlots(slots) : EMPTY_SELECTION}
        locked={Boolean(existingRoster?.locked_at)}
      />
    </main>
  );
}
