import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { loadRoundContext } from "@/lib/f1/round-context";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { EMPTY_SELECTION, type RosterSelection } from "@/lib/f1/roster";
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
  const pick = (type: string) =>
    ordered.filter((slot) => slot.slot_type === type).map((slot) => slot.driver_id ?? "");

  return {
    top: pick("driver_top").filter(Boolean),
    mid: pick("driver_mid").filter(Boolean),
    backmarker: ordered.find((s) => s.slot_type === "driver_backmarker")?.driver_id ?? null,
    constructors: ordered
      .filter((slot) => slot.slot_type === "constructor")
      .map((slot) => slot.constructor_id ?? "")
      .filter(Boolean),
    reverseConstructor:
      ordered.find((s) => s.slot_type === "constructor_reverse")?.constructor_id ?? null,
  };
}

export default async function RosterPage({ params }: PageProps<"/leagues/[id]/roster">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, leagues(id, name, season, starting_cost_cap)")
    .eq("league_id", id)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  const league = membership.leagues as unknown as {
    id: string;
    name: string;
    season: number;
    starting_cost_cap: number;
  };

  const context = await loadRoundContext(supabase, league.season);
  if (!context) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">{league.name}</h1>
        <p className="mt-4 text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to pick for.
        </p>
      </main>
    );
  }

  const { data: existingRoster } = await supabase
    .from("rosters")
    .select("id, locked_at, roster_slots(slot_type, slot_index, driver_id, constructor_id)")
    .eq("member_id", membership.id)
    .eq("season", context.season)
    .eq("round", context.round)
    .maybeSingle();

  const slots = (existingRoster?.roster_slots ?? []) as unknown as SlotRow[];

  const drivers: PickOption[] = [...context.driverPrices.entries()]
    .map(([driverId, price]) => ({
      id: driverId,
      name: context.driverNames.get(driverId) ?? driverId,
      subtitle: context.driverTeams.get(driverId) ?? "",
      price,
      tier: context.tiers.get(driverId) ?? "mid",
    }))
    .sort((a, b) => b.price - a.price);

  const constructors: PickOption[] = [...context.constructorPrices.entries()]
    .map(([constructorId, price]) => ({
      id: constructorId,
      name: context.constructorNames.get(constructorId) ?? constructorId,
      subtitle: "",
      price,
      tier: "mid" as const,
    }))
    .sort((a, b) => b.price - a.price);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <header className="pt-2">
        <Link href="/leagues" className="text-sm text-zinc-500 underline underline-offset-4">
          ← Leagues
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{league.name}</h1>
        <p className="text-sm text-zinc-500">
          Picking for {context.raceName} · {context.season} round {context.round}
        </p>
      </header>

      <RosterBuilder
        leagueId={league.id}
        costCap={Number(league.starting_cost_cap)}
        drivers={drivers}
        constructors={constructors}
        initialSelection={slots.length ? selectionFromSlots(slots) : EMPTY_SELECTION}
        locked={Boolean(existingRoster?.locked_at)}
      />
    </main>
  );
}
