import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { buildLeagueStats } from "@/lib/f1/league-stats";
import { DeadlineCard } from "./deadline-card";
import type { ChipAllowance } from "@/lib/f1/chips";
import { LeagueSettings } from "./league-settings";
import { LeaveLeague } from "./leave-league";
import { StatsCard } from "./stats-card";
import { LeagueNav } from "./league-nav";
import { MatchupCard } from "./matchup-card";
import { type MatchupPick, type Side } from "./matchup-grid";
import { MembersPanel } from "./members-panel";
import { RoundBetsCard } from "./round-bets-card";
import { type RoundBet } from "./bet-slip-list";
import { EventBrowser, type BrowsableEvent } from "./event-browser";
import { loadCurrentEvent } from "@/lib/f1/event-status";
import { MARKETS, type MarketId } from "@/lib/f1/betting";
import { currentRound } from "@/lib/f1/round-context";
import { SchedulePanel } from "./schedule-panel";
import { Standings } from "./standings";
import { buildStandings, type LeagueMode } from "@/lib/f1/standings";

export const dynamic = "force-dynamic";

/** The race start as an instant. race_time is null on rounds not yet published. */
function raceInstant(round: { race_date: string | null; race_time: string | null }): string | null {
  return round.race_date
    ? new Date(`${round.race_date}T${round.race_time ?? "00:00:00"}Z`).toISOString()
    : null;
}

export default async function LeaguePage({ params }: PageProps<"/leagues/[id]">) {
  const { id } = await params;

  const supabase = await createServerSupabase();

  // Issued in waves rather than one after another. Every query is a round trip
  // of about 90ms, and this page needs a dozen of them; run in sequence that is
  // a second of waiting before anything renders. Grouped by what each actually
  // depends on, the same work takes three round trips.
  //
  // Row-level security means a non-member simply gets nothing back, so the
  // absence of a league row is the authorisation check.
  const [user, { data: league }, { data: members }] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("leagues")
      .select(
        "id, name, season, mode, invite_code, starting_cost_cap, owner_id, max_stake, chip_allowance, theme",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("league_members")
      .select("id, profile_id, profiles(display_name)")
      .eq("league_id", id),
  ]);

  if (!user) redirect("/login");
  if (!league) notFound();

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

  const [
    { data: scoreRows },
    { data: allLedger },
    next,
    event,
    { data: calendar },
    { data: fixtureRows },
    { data: rosterRows },
    { data: betRows },
    { data: driverRows },
    { data: constructorRows },
    { data: lineupRows },
  ] = await Promise.all([
    supabase
      .from("round_scores")
      .select("member_id, round, points, duel_points")
      .eq("season", league.season),
    // Every member's ledger, for the cost cap panel. Balances are visible to
    // the league only in aggregate over time here — the figure that stays
    // private is a rival's spare cap right now, which is what would reveal
    // their next move, and by the time a round is scored the money has already
    // been spent.
    supabase
      .from("cost_cap_entries")
      .select("member_id, round, amount")
      .in("member_id", memberIds),
    // The next round a member can still act on.
    currentRound(supabase, league.season),
    // And the one already being run, which is the round `currentRound` has
    // just stopped returning. Null before the season's first qualifying.
    loadCurrentEvent(supabase, league.season),
    // The whole calendar rather than the one round being counted down to: the
    // event browser names every race that has been run, and two dozen rows is
    // cheaper than a second query.
    supabase
      .from("rounds")
      .select("round, race_name, qualifying_at, race_date, race_time")
      .eq("season", league.season)
      .order("round"),
    league.mode === "duel"
      ? supabase
          .from("duel_fixtures")
          .select("round, home_member_id, away_member_id")
          .eq("league_id", id)
          .order("round")
      : Promise.resolve({ data: [] as { round: number; home_member_id: string; away_member_id: string }[] }),
    // Every member's season in one read — forty small rosters — because the
    // browser steps back through the races and re-querying on each arrow would
    // turn an instant move into a round trip. Row-level security still decides
    // what comes back: the round being picked for arrives as nothing but your
    // own.
    supabase
      .from("rosters")
      .select(
        "member_id, round, top_captain_id, mid_captain_id, roster_slots(slot_type, driver_id, constructor_id)",
      )
      .in("member_id", memberIds)
      .eq("season", league.season),
    supabase
      .from("bets")
      .select("member_id, round, market_id, selection, stake, odds, outcome, timing, returned")
      .in("member_id", memberIds)
      .eq("season", league.season),
    supabase.from("drivers").select("driver_id, family_name, headshot_url, team_colour"),
    supabase.from("constructors").select("constructor_id, name"),
    // A team has no colour of its own in the reference data — it is taken from
    // the drivers it fields. The line-up comes from the most recent race, so a
    // mid-season seat change follows.
    supabase
      .from("race_results")
      .select("constructor_id, driver_id")
      .eq("season", league.season)
      .order("round", { ascending: false })
      .limit(60),
  ]);

  // The last wave: what could not be asked until the next round was known. Each
  // pair reports whether a hidden team and hidden bets exist, so an empty side
  // of the matchup can say which kind of empty it is.
  const sideStatus = next
    ? await Promise.all(
        memberIds.map(async (member) => {
          const [team, count] = await Promise.all([
            supabase.rpc("has_complete_roster", {
              target_member: member,
              target_season: next.season,
              target_round: next.round,
            }),
            supabase.rpc("bets_placed", {
              target_member: member,
              target_season: next.season,
              target_round: next.round,
            }),
          ]);
          return { member, hasTeam: Boolean(team.data), bets: Number(count.data ?? 0) };
        }),
      )
    : [];

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

  const fixtures = (fixtureRows ?? []).map((fixture) => ({
    round: fixture.round,
    home: nameByMemberId.get(fixture.home_member_id) ?? "Unknown",
    away: nameByMemberId.get(fixture.away_member_id) ?? "Unknown",
  }));

  const nextRound = (calendar ?? []).find((entry) => entry.round === next?.round);
  const savedRoster = (rosterRows ?? []).some(
    (row) => row.member_id === selfMemberId && row.round === next?.round,
  );

  /** Who you are drawn against in one round, or null on a bye. */
  const opponentIn = (round: number): string | null => {
    const fixture = (fixtureRows ?? []).find(
      (entry) =>
        entry.round === round &&
        (entry.home_member_id === selfMemberId || entry.away_member_id === selfMemberId),
    );
    if (!fixture) return null;
    return fixture.home_member_id === selfMemberId
      ? fixture.away_member_id
      : fixture.home_member_id;
  };

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

  const allBets = (betRows ?? []).map((bet) => {
    const marketId = bet.market_id as MarketId;
    return {
      round: bet.round as number,
      memberId: bet.member_id,
      memberName: nameByMemberId.get(bet.member_id) ?? "Unknown",
      isSelf: bet.member_id === selfMemberId,
      market: MARKETS[marketId]?.name ?? marketId,
      // Selections are stored as ids; the reference names are already loaded
      // for the squads.
      selection:
        drivers.get(bet.selection)?.name ??
        constructors.get(bet.selection)?.name ??
        bet.selection,
      stake: Number(bet.stake),
      odds: bet.odds === null || bet.odds === undefined ? null : Number(bet.odds),
      preQualifying: bet.timing === "pre_qualifying",
      outcome: bet.outcome,
      returned: bet.returned === null ? null : Number(bet.returned),
    };
  });

  const betsOn = (round: number): RoundBet[] => allBets.filter((bet) => bet.round === round);

  /**
   * One side of a matchup, grouped the way the roster is picked.
   *
   * Teams sit in the bracket their slot names: a constructor slot is a
   * top-or-mid pick like the drivers beside it, and the reverse team belongs at
   * the back with the backmarker. Splitting drivers from teams instead would
   * break the row-by-row comparison the card exists for.
   *
   * On the round still open, whether a rival has a team and how many bets they
   * hold comes from the two counting functions rather than from the rows, which
   * row-level security withholds until the lock. On a round already run there
   * is nothing to withhold, so the rows answer both.
   */
  const sideFor = (memberId: string, round: number, open: boolean): Side => {
    const row = (rosterRows ?? []).find(
      (entry) => entry.member_id === memberId && entry.round === round,
    );
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
          isTeam: false,
        };
      }
      const team = constructors.get(slot.constructor_id!);
      return {
        name: team?.name ?? slot.constructor_id!,
        colour: team?.colour,
        lineup: team?.lineup,
        captain: false,
        isTeam: true,
      };
    };

    const inBracket = (...types: string[]) =>
      slots.filter((slot) => types.includes(slot.slot_type)).map(pick);

    const counted = sideStatus.find((entry) => entry.member === memberId);
    const score = (scoreRows ?? []).find(
      (entry) => entry.member_id === memberId && entry.round === round,
    );

    return {
      memberId,
      name: nameByMemberId.get(memberId) ?? "Unknown",
      top: inBracket("driver_top", "constructor_top"),
      mid: inBracket("driver_mid", "constructor_mid"),
      back: inBracket("driver_backmarker", "constructor_reverse"),
      hasTeam: open ? (counted?.hasTeam ?? false) : Boolean(row),
      bets: open
        ? (counted?.bets ?? 0)
        : allBets.filter((bet) => bet.round === round && bet.memberId === memberId).length,
      points: score ? Number(score.points) : null,
      duelPoints:
        score?.duel_points === null || score?.duel_points === undefined
          ? null
          : Number(score.duel_points),
    };
  };

  /**
   * Every round that has started, oldest first.
   *
   * The newest started round is the current event by definition, so everything
   * up to and including it has run or is running — which means it has locked,
   * and nothing here needs hiding.
   */
  const events: BrowsableEvent[] = !event
    ? []
    : (calendar ?? [])
        .filter((entry) => entry.round <= event.round)
        .map((entry) => {
          const scored = (scoreRows ?? []).some(
            (score) => score.round === entry.round && memberIds.includes(score.member_id),
          );
          const opponentId = opponentIn(entry.round);
          const mine = selfMemberId ? sideFor(selfMemberId, entry.round, false) : null;
          const theirs = opponentId ? sideFor(opponentId, entry.round, false) : null;

          return {
            round: entry.round,
            raceName: entry.race_name,
            qualifyingAt: entry.qualifying_at,
            raceAt: raceInstant(entry),
            scored,
            // Only the newest round can be in a session; anything earlier has
            // finished, whatever the results job has got round to.
            status: scored
              ? null
              : entry.round === event.round
                ? event.status
                : ({ phase: "settling", live: false } as const),
            // Both squads when there was a duel, and your own alone when there
            // was not — a bye, a round before the schedule was drawn, or a
            // league that does not play head to head. Dropping it in those
            // cases threw away the one squad there was to look at.
            sides:
              mine && theirs
                ? [mine, theirs]
                : mine && (mine.hasTeam || mine.points !== null)
                  ? [mine]
                  : [],
            drawn: (fixtureRows ?? []).some((fixture) => fixture.round === entry.round),
            bets: betsOn(entry.round),
          };
        })
        // A round from before you joined has no squad, no duel and no bets, and
        // an arrow that lands on one is an arrow that wasted a click. The round
        // being run always stays, even when it is empty: it is the one the card
        // exists to announce.
        .filter(
          (entry) =>
            entry.round === event.round || entry.sides.length > 0 || entry.bets.length > 0,
        );

  const nextOpponentId = next ? opponentIn(next.round) : null;
  const roundBets = next ? betsOn(next.round) : [];

  // A member whose bets are counted but not returned has them sealed. Derived
  // by difference rather than from the clock, so it stays true whatever the
  // read policy decides.
  const readableByMember = new Map<string, number>();
  for (const bet of roundBets) {
    readableByMember.set(bet.memberId, (readableByMember.get(bet.memberId) ?? 0) + 1);
  }

  const hiddenBets = sideStatus
    .map((entry) => ({
      name: nameByMemberId.get(entry.member) ?? "Unknown",
      count: entry.bets - (readableByMember.get(entry.member) ?? 0),
    }))
    .filter((entry) => entry.count > 0);

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

      {/* The weekend on track, above the one being prepared for, and the season
          behind it one arrow at a time. */}
      {events.length > 0 && (
        <EventBrowser
          leagueId={league.id}
          events={events}
          initialRound={events[events.length - 1].round}
          duel={league.mode === "duel"}
        />
      )}

      {next && nextRound && (
        <DeadlineCard
          leagueId={league.id}
          raceName={nextRound.race_name}
          round={next.round}
          qualifyingAt={nextRound.qualifying_at}
          raceAt={raceInstant(nextRound)}
          rosterSaved={savedRoster}
        />
      )}

      {next && nextRound && (
        <RoundBetsCard
          leagueId={league.id}
          raceName={nextRound.race_name}
          bets={roundBets}
          hidden={hiddenBets}
        />
      )}

      {league.mode === "duel" && next && nextRound && selfMemberId && (
        <MatchupCard
          leagueId={league.id}
          round={next.round}
          raceName={nextRound.race_name}
          you={sideFor(selfMemberId, next.round, true)}
          opponent={nextOpponentId ? sideFor(nextOpponentId, next.round, true) : null}
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
