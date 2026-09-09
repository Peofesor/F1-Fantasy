import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { MARKETS, type MarketId } from "@/lib/f1/betting";
import { RosterHistory, type Bet, type Pick, type Squad } from "./roster-history";

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

  const [{ data: scores }, { data: betRows }] = await Promise.all([
    supabase
      .from("round_scores")
      .select("round, points")
      .eq("member_id", memberId)
      .eq("season", league.season),
    // Visible to the whole league now, so this is another member's slip as
    // readily as your own — row-level security decides, not this query.
    supabase
      .from("bets")
      .select("round, market_id, selection, stake, odds, outcome, returned")
      .eq("member_id", memberId)
      .eq("season", league.season),
  ]);

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

  // Which drivers a team fields, from the most recent race so a mid-season seat
  // change follows. Two seats is what the badge draws.
  const teamLineup = new Map<string, { name: string; headshotUrl?: string }[]>();
  for (const row of lineupRows ?? []) {
    const seats = teamLineup.get(row.constructor_id) ?? [];
    if (seats.length >= 2 || seats.some((seat) => seat.name === drivers.get(row.driver_id)?.name)) {
      continue;
    }
    const driver = drivers.get(row.driver_id);
    if (driver) seats.push({ name: driver.name, headshotUrl: driver.headshotUrl });
    teamLineup.set(row.constructor_id, seats);
  }

  const betsByRound = new Map<number, Bet[]>();
  for (const bet of betRows ?? []) {
    const marketId = bet.market_id as MarketId;
    const list = betsByRound.get(bet.round) ?? [];
    list.push({
      market: MARKETS[marketId]?.name ?? marketId,
      // Selections are stored as ids; the reference names are already loaded
      // for the squad above, so a driver or team reads as itself.
      selection:
        drivers.get(bet.selection)?.name ??
        constructorName.get(bet.selection) ??
        bet.selection,
      stake: Number(bet.stake),
      odds: bet.odds === null || bet.odds === undefined ? null : Number(bet.odds),
      outcome: bet.outcome,
      returned: bet.returned === null ? null : Number(bet.returned),
    });
    betsByRound.set(bet.round, list);
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
        lineup: teamLineup.get(slot.constructor_id!),
        captain: false,
        price,
      };
    });

    return {
      round: roster.round,
      raceName: raceName.get(roster.round) ?? `Round ${roster.round}`,
      points: pointsByRound.get(roster.round) ?? null,
      picks,
      bets: betsByRound.get(roster.round) ?? [],
    };
  });

  // A round can have bets and no visible roster — the roster is hidden until
  // its round locks, and betting is open for that same window. Dropping those
  // rounds would hide a slip that is public.
  for (const [round, bets] of betsByRound) {
    if (squads.some((squad) => squad.round === round)) continue;
    squads.push({
      round,
      raceName: raceName.get(round) ?? `Round ${round}`,
      points: pointsByRound.get(round) ?? null,
      picks: [],
      bets,
    });
  }

  squads.sort((a, b) => b.round - a.round);

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
