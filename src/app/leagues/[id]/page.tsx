import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { buildLeagueStats } from "@/lib/f1/league-stats";
import { DeadlineCard } from "./deadline-card";
import type { ChipAllowance } from "@/lib/f1/chips";
import { LeagueSettings } from "./league-settings";
import { LeaveLeague } from "./leave-league";
import { StatsCard } from "./stats-card";
import { LeagueNav } from "./league-nav";
import { MatchupCard, type MatchupPick, type Side } from "./matchup-card";
import { MembersPanel } from "./members-panel";
import { currentRound } from "@/lib/f1/round-context";
import { SchedulePanel } from "./schedule-panel";
import { Standings } from "./standings";
import { buildStandings, type LeagueMode } from "@/lib/f1/standings";

export const dynamic = "force-dynamic";

export default async function LeaguePage({ params }: PageProps<"/leagues/[id]">) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createServerSupabase();

  // Row-level security means a non-member simply gets nothing back, so the
  // absence of a row is the authorisation check.
  const { data: league } = await supabase
    .from("leagues")
    .select(
      "id, name, season, mode, invite_code, starting_cost_cap, owner_id, max_stake, chip_allowance, theme",
    )
    .eq("id", id)
    .maybeSingle();

  if (!league) notFound();

  const { data: members } = await supabase
    .from("league_members")
    .select("id, profile_id, profiles(display_name)")
    .eq("league_id", id);

  const roster = members?.map((member) => ({
    id: member.id,
    isSelf: member.profile_id === user.id,
    name:
      (member.profiles as unknown as { display_name: string } | null)?.display_name ??
      "Unknown",
  }));

  const nameByMemberId = new Map((roster ?? []).map((member) => [member.id, member.name]));
  const memberIds = (roster ?? []).map((member) => member.id);
  const selfMemberId = roster?.find((member) => member.isSelf)?.id;

  const { data: scoreRows } = await supabase
    .from("round_scores")
    .select("member_id, round, points, duel_points")
    .eq("season", league.season);

  const standings = buildStandings(
    memberIds,
    (scoreRows ?? [])
      .filter((row) => memberIds.includes(row.member_id))
      .map((row) => ({
        memberId: row.member_id,
        round: row.round,
        points: Number(row.points),
        // Number(null) is 0, which is exactly the collapse this column was made
        // nullable to avoid — a round with no fixture would arrive as a defeat.
        duelPoints: row.duel_points === null ? null : Number(row.duel_points),
      })),
    league.mode as LeagueMode,
  );



  // Every member's ledger, for the cost cap panel. Balances are visible to the
  // league only in aggregate over time here — the figure that stays private is
  // a rival's spare cap right now, which is what would reveal their next move,
  // and by the time a round is scored the money has already been spent.
  const { data: allLedger } = await supabase
    .from("cost_cap_entries")
    .select("member_id, round, amount")
    .in("member_id", memberIds);

  const stats = buildLeagueStats(
    (roster ?? []).map((member) => ({ id: member.id, name: member.name })),
    (scoreRows ?? [])
      .filter((row) => memberIds.includes(row.member_id))
      .map((row) => ({ memberId: row.member_id, round: row.round, points: Number(row.points) })),
    (allLedger ?? []).map((row) => ({
      memberId: row.member_id,
      round: row.round,
      amount: Number(row.amount),
    })),
  );

  // The next round a member can still act on, with the two deadlines that
  // apply to it: qualifying closes the roster, the race start closes betting.
  const next = await currentRound(supabase, league.season);

  const { data: nextRound } = next
    ? await supabase
        .from("rounds")
        .select("race_name, qualifying_at, race_date, race_time")
        .eq("season", next.season)
        .eq("round", next.round)
        .maybeSingle()
    : { data: null };

  const { data: savedRoster } = next && selfMemberId
    ? await supabase
        .from("rosters")
        .select("id")
        .eq("member_id", selfMemberId)
        .eq("season", next.season)
        .eq("round", next.round)
        .maybeSingle()
    : { data: null };

  // race_time is nullable on rounds the calendar has not fully published.
  const raceAt = nextRound?.race_date
    ? new Date(`${nextRound.race_date}T${nextRound.race_time ?? "00:00:00"}Z`).toISOString()
    : null;

  const { data: fixtureRows } =
    league.mode === "duel"
      ? await supabase
          .from("duel_fixtures")
          .select("round, home_member_id, away_member_id")
          .eq("league_id", id)
          .order("round")
      : { data: [] };

  const fixtures = (fixtureRows ?? []).map((fixture) => ({
    round: fixture.round,
    home: nameByMemberId.get(fixture.home_member_id) ?? "Unknown",
    away: nameByMemberId.get(fixture.away_member_id) ?? "Unknown",
  }));

  // This round's fixture, and both squads in it. Names come from the reference
  // tables rather than the ids stored on the slots, so the card reads as a team
  // sheet instead of a list of database keys.
  const nextFixture =
    next && selfMemberId
      ? (fixtureRows ?? []).find(
          (fixture) =>
            fixture.round === next.round &&
            (fixture.home_member_id === selfMemberId || fixture.away_member_id === selfMemberId),
        )
      : undefined;

  const opponentId = nextFixture
    ? nextFixture.home_member_id === selfMemberId
      ? nextFixture.away_member_id
      : nextFixture.home_member_id
    : null;

  const sideIds = [selfMemberId, opponentId].filter((value): value is string => Boolean(value));

  const { data: matchupRosters } =
    next && sideIds.length === 2
      ? await supabase
          .from("rosters")
          .select(
            "member_id, top_captain_id, mid_captain_id, roster_slots(slot_type, driver_id, constructor_id)",
          )
          .in("member_id", sideIds)
          .eq("season", next.season)
          .eq("round", next.round)
      : { data: null };

  // A team has no colour of its own in the reference data — it is taken from
  // the drivers it fields, which is where the media actually lives. The lineup
  // comes from the most recent race, so a mid-season seat change follows.
  const [{ data: driverRows }, { data: constructorRows }, { data: lineupRows }] =
    await Promise.all([
      supabase.from("drivers").select("driver_id, family_name, headshot_url, team_colour"),
      supabase.from("constructors").select("constructor_id, name"),
      supabase
        .from("race_results")
        .select("constructor_id, driver_id")
        .eq("season", league.season)
        .order("round", { ascending: false })
        .limit(60),
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

  const constructors = new Map(
    (constructorRows ?? []).map((row) => [
      row.constructor_id,
      {
        name: row.name as string,
        colour: teamColour.get(row.constructor_id),
        lineup: teamLineup.get(row.constructor_id),
      },
    ]),
  );

  /**
   * One side of the matchup, grouped the way the roster is picked.
   *
   * Teams sit in the bracket their slot names: a constructor slot is a
   * top-or-mid pick like the drivers beside it, and the reverse team belongs at
   * the back with the backmarker. Splitting drivers from teams instead would
   * break the row-by-row comparison the card exists for.
   */
  const sideFor = (memberId: string): Side => {
    const row = (matchupRosters ?? []).find((entry) => entry.member_id === memberId);
    const slots = (row?.roster_slots ?? []) as unknown as {
      slot_type: string;
      driver_id: string | null;
      constructor_id: string | null;
    }[];
    const captains = [row?.top_captain_id, row?.mid_captain_id].filter(Boolean);

    const pick = (slot: (typeof slots)[number]): MatchupPick => {
      if (slot.driver_id) {
        const driver = drivers.get(slot.driver_id);
        return {
          name: driver?.name ?? slot.driver_id,
          headshotUrl: driver?.headshotUrl,
          colour: driver?.colour,
          captain: captains.includes(slot.driver_id),
        };
      }
      const team = constructors.get(slot.constructor_id!);
      return {
        name: team?.name ?? slot.constructor_id!,
        colour: team?.colour,
        lineup: team?.lineup,
        captain: false,
      };
    };

    const inBracket = (...types: string[]) =>
      slots.filter((slot) => types.includes(slot.slot_type)).map(pick);

    return {
      memberId,
      name: nameByMemberId.get(memberId) ?? "Unknown",
      top: inBracket("driver_top", "constructor_top"),
      mid: inBracket("driver_mid", "constructor_mid"),
      back: inBracket("driver_backmarker", "constructor_reverse"),
    };
  };

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-16">
      <header className="space-y-2 pt-2">
        <LeagueNav leagueId={league.id} active="hub" />
        <h1 className="text-2xl font-semibold tracking-tight">{league.name}</h1>
        <p className="text-sm text-zinc-500">
          {league.season} · {league.mode === "duel" ? "Duel" : "Free-for-all"} · cost cap{" "}
          {Number(league.starting_cost_cap).toFixed(0)}
        </p>
      </header>

      {next && nextRound && (
        <DeadlineCard
          leagueId={league.id}
          raceName={nextRound.race_name}
          round={next.round}
          qualifyingAt={nextRound.qualifying_at}
          raceAt={raceAt}
          rosterSaved={Boolean(savedRoster)}
        />
      )}

      {league.mode === "duel" && next && nextRound && selfMemberId && (
        <MatchupCard
          leagueId={league.id}
          round={next.round}
          raceName={nextRound.race_name}
          you={sideFor(selfMemberId)}
          opponent={opponentId ? sideFor(opponentId) : null}
          drawn={(fixtureRows ?? []).some((fixture) => fixture.round === next.round)}
        />
      )}

      <StatsCard series={stats} />

      <Standings
        leagueId={league.id}
        rows={standings}
        names={nameByMemberId}
        mode={league.mode as LeagueMode}
        currentMemberId={selfMemberId}
      />

      <MembersPanel
        leagueId={league.id}
        members={roster ?? []}
        isOwner={league.owner_id === user.id}
      />

      {league.mode === "duel" && (
        <SchedulePanel
          leagueId={league.id}
          isOwner={league.owner_id === user.id}
          fixtures={fixtures}
        />
      )}

      {league.owner_id === user.id && (
        <LeagueSettings
          leagueId={league.id}
          name={league.name}
          maxStake={league.max_stake === null ? null : Number(league.max_stake)}
          chipAllowance={league.chip_allowance as ChipAllowance | null}
          theme={(league.theme as string | null) ?? null}
        />
      )}

      <LeaveLeague
        leagueId={league.id}
        isOwner={league.owner_id === user.id}
        memberCount={roster?.length ?? 0}
        hasHistory={(scoreRows ?? []).some((row) => row.member_id === selfMemberId)}
      />

      <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
        <h2 className="text-sm font-semibold">Invite</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Share this code so friends can join:{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono dark:bg-zinc-800">
            {league.invite_code}
          </code>
        </p>
      </section>
    </main>
  );
}
