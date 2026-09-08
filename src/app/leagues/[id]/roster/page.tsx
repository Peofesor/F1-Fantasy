import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { loadRoundContext } from "@/lib/f1/round-context";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { EMPTY_SELECTION, type RosterSelection } from "@/lib/f1/roster";
import { FREE_CHANGES_PER_ROUND, ledgerBalance, spendableCap } from "@/lib/f1/ledger";
import { RosterBuilder, type PickOption } from "./roster-builder";
import { ChipsPanel } from "./chips-panel";
import { BetsPanel, type PlacedBet } from "./bets-panel";
import { MARKETS, type MarketId, type BetTiming } from "@/lib/f1/betting";
import {
  CHIP_LIST,
  chipAvailability,
  toChipRow,
  type ChipId,
  type ChipUsage,
} from "@/lib/f1/chips";

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
    // The FK is named explicitly because duel_fixtures references both
    // leagues and league_members, so PostgREST sees a second relationship
    // between them and refuses an unqualified embed.
    .select("id, leagues!league_members_league_id_fkey(id, name, season, starting_cost_cap)")
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
    .select(
      "id, locked_at, transfers_used, roster_slots(slot_type, slot_index, driver_id, constructor_id)",
    )
    .eq("member_id", membership.id)
    .eq("season", context.season)
    .eq("round", context.round)
    .maybeSingle();

  // Spendable cap is the ledger balance, not the league's opening figure —
  // price drift, payouts and fees have all moved it since.
  const { data: ledgerRows } = await supabase
    .from("cost_cap_entries")
    .select("amount")
    .eq("member_id", membership.id);

  const slots = (existingRoster?.roster_slots ?? []) as unknown as SlotRow[];

  // Spending power is the bank plus what is already held: the current roster
  // is an asset that gets sold back when a slot is swapped.
  const heldValue = (slots as SlotRow[]).reduce((total, slot) => {
    if (slot.driver_id) return total + (context.driverPrices.get(slot.driver_id) ?? 0);
    if (slot.constructor_id) return total + (context.constructorPrices.get(slot.constructor_id) ?? 0);
    return total;
  }, 0);

  const costCap = spendableCap(ledgerBalance(ledgerRows ?? []), heldValue);

  const drivers: PickOption[] = [...context.driverPrices.entries()]
    .map(([driverId, price]) => ({
      id: driverId,
      name: context.driverNames.get(driverId) ?? driverId,
      subtitle: context.driverTeams.get(driverId) ?? "",
      price,
      tier: context.tiers.get(driverId) ?? "mid",
      headshotUrl: context.driverHeadshots.get(driverId),
      colour: context.driverColours.get(driverId),
      form: context.driverForm.get(driverId) ?? 0,
    }))
    .sort((a, b) => b.price - a.price);

  const constructors: PickOption[] = [...context.constructorPrices.entries()]
    .map(([constructorId, price]) => ({
      id: constructorId,
      name: context.constructorNames.get(constructorId) ?? constructorId,
      subtitle: "",
      price,
      tier: "mid" as const,
      form: context.constructorForm.get(constructorId) ?? 0,
    }))
    .sort((a, b) => b.price - a.price);

  // Chip state for this season, so availability reflects the whole season
  // rather than just this round.
  const [{ data: chipPlays }, { data: chipPurchases }] = await Promise.all([
    supabase
      .from("chip_plays")
      .select("chip_id, round, target_driver_id, target_constructor_id")
      .eq("member_id", membership.id)
      .eq("season", context.season),
    supabase.from("chip_purchases").select("chip_id").eq("member_id", membership.id),
  ]);

  const usage: ChipUsage[] = (chipPlays ?? []).map((play) => ({
    chipId: play.chip_id as ChipId,
    round: play.round,
  }));

  const chipRows = CHIP_LIST.map((definition) => {
    const owned = (chipPurchases ?? []).filter((row) => row.chip_id === definition.id).length;
    const state = chipAvailability(definition.id, usage, owned, context.round);
    const played = (chipPlays ?? []).find(
      (play) => play.chip_id === definition.id && play.round === context.round,
    );
    const targetId = played?.target_driver_id ?? played?.target_constructor_id ?? undefined;
    const targetName = targetId
      ? (context.driverNames.get(targetId) ?? context.constructorNames.get(targetId) ?? targetId)
      : undefined;
    return toChipRow(state, Boolean(played), targetName);
  });

  const { data: betRows } = await supabase
    .from("bets")
    .select("market_id, selection, stake, timing, outcome, returned")
    .eq("member_id", membership.id)
    .eq("season", context.season)
    .eq("round", context.round);

  const placedBets: PlacedBet[] = (betRows ?? []).map((bet) => {
    const marketId = bet.market_id as MarketId;
    const selectionId = bet.selection;
    return {
      marketId,
      marketName: MARKETS[marketId]?.name ?? marketId,
      // Show a readable name where the selection is an id.
      selection:
        context.driverNames.get(selectionId) ??
        context.constructorNames.get(selectionId) ??
        selectionId,
      stake: Number(bet.stake),
      timing: bet.timing as BetTiming,
      outcome: bet.outcome,
      returned: bet.returned === null ? null : Number(bet.returned),
    };
  });

  const nationalities = [...new Set([...context.driverNationalities.values()])].sort();

  const selection = slots.length ? selectionFromSlots(slots) : EMPTY_SELECTION;
  const rosterDriverIds = [...selection.top, ...selection.mid];
  const rosterConstructorIds = [...selection.constructors];

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
        <Link href="/rules" className="mt-1 inline-block text-xs text-zinc-500 underline underline-offset-4">
          How scoring works
        </Link>
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
      />

      <ChipsPanel
        leagueId={league.id}
        round={context.round}
        chips={chipRows}
        balance={ledgerBalance(ledgerRows ?? [])}
        driverOptions={rosterDriverIds.map((driverId) => ({
          id: driverId,
          name: context.driverNames.get(driverId) ?? driverId,
        }))}
        constructorOptions={rosterConstructorIds.map((constructorId) => ({
          id: constructorId,
          name: context.constructorNames.get(constructorId) ?? constructorId,
        }))}
        locked={Boolean(existingRoster?.locked_at)}
      />

      <BetsPanel
        leagueId={league.id}
        round={context.round}
        bank={ledgerBalance(ledgerRows ?? [])}
        bets={placedBets}
        drivers={[...context.driverNames.entries()].map(([id, name]) => ({ id, name }))}
        constructors={[...context.constructorNames.entries()].map(([id, name]) => ({ id, name }))}
        nationalities={nationalities}
        locked={Boolean(existingRoster?.locked_at)}
      />
    </main>
  );
}
