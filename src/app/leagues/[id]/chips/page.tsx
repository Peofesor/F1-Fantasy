import Link from "next/link";

import {
  CHIP_LIST,
  chipAvailability,
  toChipRow,
  type ChipId,
  type ChipUsage,
} from "@/lib/f1/chips";
import { loadMemberContext } from "../member-context";
import { LeagueNav } from "../league-nav";
import { ChipsPanel } from "./chips-panel";

export const dynamic = "force-dynamic";

interface SlotRow {
  driver_id: string | null;
  constructor_id: string | null;
}

export default async function ChipsPage({ params }: PageProps<"/leagues/[id]/chips">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 p-4">
        <LeagueNav leagueId={league.id} active="chips" />
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to play a chip on.
        </p>
      </main>
    );
  }

  // Chips target the roster, so the picker only ever offers drivers and teams
  // the member actually fields this round.
  const { data: roster } = await supabase
    .from("rosters")
    .select("locked_at, roster_slots(driver_id, constructor_id)")
    .eq("member_id", memberId)
    .eq("season", round.season)
    .eq("round", round.round)
    .maybeSingle();

  const slots = (roster?.roster_slots ?? []) as unknown as SlotRow[];

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

  const driverOptions = slots
    .filter((slot) => slot.driver_id)
    .map((slot) => ({
      id: slot.driver_id!,
      name: round.driverNames.get(slot.driver_id!) ?? slot.driver_id!,
    }));

  const constructorOptions = slots
    .filter((slot) => slot.constructor_id)
    .map((slot) => ({
      id: slot.constructor_id!,
      name: round.constructorNames.get(slot.constructor_id!) ?? slot.constructor_id!,
    }));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
      <header className="space-y-2 pt-2">
        <LeagueNav leagueId={league.id} active="chips" />
        <h1 className="text-xl font-semibold tracking-tight">Chips</h1>
        <p className="text-sm text-zinc-500">
          {round.raceName} · round {round.round}
        </p>
      </header>

      {slots.length === 0 && (
        <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
          Chips apply to your roster, so{" "}
          <Link href={`/leagues/${league.id}/roster`} className="underline underline-offset-4">
            pick one first
          </Link>
          . Chips without a target can still be played.
        </p>
      )}

      <ChipsPanel
        leagueId={league.id}
        round={round.round}
        chips={chipRows}
        balance={balance}
        driverOptions={driverOptions}
        constructorOptions={constructorOptions}
        locked={Boolean(roster?.locked_at)}
      />
    </main>
  );
}
