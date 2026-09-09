import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { RosterHistory, type Pick, type Squad } from "./roster-history";

export const dynamic = "force-dynamic";

/**
 * Another member's teams, race by race.
 *
 * Reachable from any name in the standings or the matchup card, because "what
 * did they field?" is the question a league asks itself all week and the app
 * could not answer. The history matters as much as the current round: a run of
 * picks is how you tell whether a rival is lucky or good.
 *
 * What is visible is decided by the database, not here. A roster stays private
 * until its round locks, so nobody can copy a rival's picks before the
 * deadline; row-level security drops the ones still hidden, and this page shows
 * whatever comes back.
 *
 * Cost cap is deliberately absent. Spare cap is the one figure that reveals a
 * move not yet made, which is exactly what the lock exists to protect.
 */
export default async function MemberPage({
  params,
}: PageProps<"/leagues/[id]/members/[memberId]">) {
  const { id, memberId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createServerSupabase();

  // Row-level security limits this to leagues the caller belongs to, so an
  // empty result is the authorisation answer rather than a separate check.
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, season")
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  const { data: member } = await supabase
    .from("league_members")
    .select("id, profile_id, profiles(display_name)")
    .eq("id", memberId)
    .eq("league_id", id)
    .maybeSingle();

  if (!member) notFound();

  const displayName =
    (member.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown";
  const isSelf = member.profile_id === user.id;

  const [{ data: rosters }, { data: driverRows }, { data: constructorRows }, { data: rounds }] =
    await Promise.all([
      supabase
        .from("rosters")
        .select(
          "round, top_captain_id, mid_captain_id, roster_slots(slot_type, driver_id, constructor_id, price_paid)",
        )
        .eq("member_id", memberId)
        .eq("season", league.season)
        .order("round", { ascending: false }),
      supabase.from("drivers").select("driver_id, family_name, headshot_url, team_colour"),
      supabase.from("constructors").select("constructor_id, name"),
      supabase.from("rounds").select("round, race_name").eq("season", league.season),
    ]);

  const { data: scores } = await supabase
    .from("round_scores")
    .select("round, points")
    .eq("member_id", memberId)
    .eq("season", league.season);

  const drivers = new Map(
    (driverRows ?? []).map((row) => [
      row.driver_id,
      {
        name: row.family_name as string,
        headshotUrl: (row.headshot_url as string | null) ?? undefined,
        colour: (row.team_colour as string | null) ?? undefined,
      },
    ]),
  );
  const constructorName = new Map(
    (constructorRows ?? []).map((row) => [row.constructor_id, row.name as string]),
  );
  const raceName = new Map((rounds ?? []).map((row) => [row.round, row.race_name as string]));
  const pointsByRound = new Map((scores ?? []).map((row) => [row.round, Number(row.points)]));

  // A team has no colour of its own in the reference data; it comes from the
  // drivers it fields, taken from the most recent race so a seat change follows.
  const { data: lineupRows } = await supabase
    .from("race_results")
    .select("constructor_id, driver_id")
    .eq("season", league.season)
    .order("round", { ascending: false })
    .limit(60);

  const teamColour = new Map<string, string>();
  for (const row of lineupRows ?? []) {
    if (teamColour.has(row.constructor_id)) continue;
    const colour = drivers.get(row.driver_id)?.colour;
    if (colour) teamColour.set(row.constructor_id, colour);
  }

  const squads: Squad[] = (rosters ?? []).map((roster) => {
    const captains = [roster.top_captain_id, roster.mid_captain_id].filter(Boolean);
    const slots = (roster.roster_slots ?? []) as unknown as {
      slot_type: string;
      driver_id: string | null;
      constructor_id: string | null;
      price_paid: number | string | null;
    }[];

    const picks: Pick[] = slots.map((slot) => {
      const price = slot.price_paid === null ? null : Number(slot.price_paid);

      if (slot.driver_id) {
        const driver = drivers.get(slot.driver_id);
        return {
          slotType: slot.slot_type,
          name: driver?.name ?? slot.driver_id,
          headshotUrl: driver?.headshotUrl,
          colour: driver?.colour,
          captain: captains.includes(slot.driver_id),
          price,
        };
      }

      return {
        slotType: slot.slot_type,
        name: constructorName.get(slot.constructor_id!) ?? slot.constructor_id!,
        colour: teamColour.get(slot.constructor_id!),
        captain: false,
        price,
      };
    });

    return {
      round: roster.round,
      raceName: raceName.get(roster.round) ?? `Round ${roster.round}`,
      points: pointsByRound.get(roster.round) ?? null,
      picks,
    };
  });

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      <header className="space-y-3 pt-2">
        {/* Back to the league, not out to the list of leagues. Every route into
            this page comes from there — the standings, the members list, the
            matchup card — so the league tabs sent people a step further out
            than they had asked for. */}
        <Link
          href={`/leagues/${league.id}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 underline-offset-4 hover:underline"
        >
          ← {league.name}
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">
          {displayName}
          {isSelf && <span className="ml-2 text-sm font-normal text-zinc-500">you</span>}
        </h1>
      </header>

      <RosterHistory squads={squads} name={displayName} />
    </main>
  );
}
