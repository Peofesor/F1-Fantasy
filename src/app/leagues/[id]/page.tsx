import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { buildLeagueStats } from "@/lib/f1/league-stats";
import type { ChipAllowance } from "@/lib/f1/chips";
import { money } from "@/lib/f1/money";
import { LeagueSettings } from "./league-settings";
import { LeaveLeague } from "./leave-league";
import { StatsCard } from "./stats-card";
import { type Matchup, type MatchupPick, type Side } from "./matchup-card";
import { LINEUP_ROWS } from "./lineup-rows";
import { MembersPanel } from "./members-panel";
import { type RoundBet } from "./bet-slip-list";
import { EventBrowser, type BrowsableEvent } from "./event-browser";
import { loadCurrentEvent, openingRound } from "@/lib/f1/event-status";
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
    isOwner: member.profile_id === league.owner_id,
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
    { data: chipPlayRows },
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
        "member_id, round, top_captain_id, mid_captain_id, roster_slots(slot_type, driver_id, constructor_id, points, breakdown)",
      )
      .in("member_id", memberIds)
      .eq("season", league.season),
    supabase
      .from("bets")
      .select("member_id, round, market_id, selection, stake, odds, outcome, returned")
      .in("member_id", memberIds)
      .eq("season", league.season),
    // Only SuperDriver is read here: it is the one chip that lands on a named
    // driver, so it is the one the squad cards can show. A rival's play stays
    // withheld until their round locks, the same as their roster.
    supabase
      .from("chip_plays")
      .select("member_id, round, chip_id, target_driver_id")
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
            supabase.rpc("fields_complete_roster", {
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

  // Prices for the round being picked for, so a held roster can be valued at
  // what it is worth now rather than what it cost. Asked here rather than in
  // the wave above because the round is only known once `currentRound` returns.
  const [{ data: driverPriceRows }, { data: constructorPriceRows }, { data: totalRows }] = next
    ? await Promise.all([
        supabase
          .from("driver_prices")
          .select("driver_id, price")
          .eq("season", next.season)
          .eq("round", next.round),
        supabase
          .from("constructor_prices")
          .select("constructor_id, price")
          .eq("season", next.season)
          .eq("round", next.round),
        // Every member's cap, split four ways, past both seals and valued at the
        // same round the prices above are for. The whole money half of the
        // standings comes from this one read, so the four figures cannot
        // disagree about which round they describe.
        supabase.rpc("cap_totals", {
          target_league: id,
          target_season: next.season,
          price_round: next.round,
        }),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  type CapRow = {
    member: string;
    squad: number | string;
    bank: number | string;
    staked: number | string;
    total: number | string;
  };

  const capTotal = new Map(
    ((totalRows ?? []) as CapRow[]).map((row) => [
      row.member,
      {
        squad: Number(row.squad),
        bank: Number(row.bank),
        staked: Number(row.staked),
        total: Number(row.total),
      },
    ]),
  );

  const driverPrice = new Map(
    (driverPriceRows ?? []).map((row) => [row.driver_id, Number(row.price)]),
  );
  const constructorPrice = new Map(
    (constructorPriceRows ?? []).map((row) => [row.constructor_id, Number(row.price)]),
  );

  /**
   * Where each member's cap currently is, split three ways.
   *
   * One number for "committed" hid the thing worth comparing: two members on
   * the same total are in completely different positions if one of it is a team
   * and the other's is riding on a bet. Drivers is the squad valued at today's
   * prices, bank is what is left uncommitted, bets is what cannot be got back
   * until the race settles — and the three add up to everything they have.
   *
   * All four come from `cap_totals`, which reads past the two seals the rows
   * here sit behind — a rival's roster is hidden until qualifying and their
   * ledger until the round locks. Read from the rows instead, a member who
   * joined on the open round showed an empty squad and a bank still holding the
   * grant they had already spent. The amounts are league-wide; which drivers
   * they picked is not, and stays sealed.
   */
  const cash = new Map<string, { drivers: number; bank: number; bets: number; total: number }>();
  for (const memberId of memberIds) {
    const latest = (rosterRows ?? [])
      .filter((entry) => entry.member_id === memberId)
      .sort((a, b) => b.round - a.round)[0];

    const slots = (latest?.roster_slots ?? []) as unknown as {
      driver_id: string | null;
      constructor_id: string | null;
    }[];

    const drivers = slots.reduce((total, slot) => {
      if (slot.driver_id) return total + (driverPrice.get(slot.driver_id) ?? 0);
      if (slot.constructor_id) return total + (constructorPrice.get(slot.constructor_id) ?? 0);
      return total;
    }, 0);

    const bank = (allLedger ?? [])
      .filter((entry) => entry.member_id === memberId)
      .reduce((total, entry) => total + Number(entry.amount), 0);

    const round1 = (value: number) => Math.round(value * 10) / 10;

    // All four figures come from the function, which reads past the seals. The
    // rows above are the fallback for a database that has not had the migration
    // yet: they are right for your own member and stale for everyone else,
    // which is the behaviour this replaced rather than a second opinion worth
    // having.
    const truth = capTotal.get(memberId);

    cash.set(memberId, {
      drivers: round1(truth?.squad ?? drivers),
      bank: round1(truth?.bank ?? bank),
      bets: round1(truth?.staked ?? 0),
      total: round1(truth?.total ?? drivers + bank),
    });
  }

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

  // More than a name: the schedule draws both sides as members now — a
  // monogram, a link to the profile behind it, and the record and league
  // position that say whether the fixture is one to worry about.
  const party = (memberId: string) => {
    const standing = standings.find((entry) => entry.memberId === memberId);
    return {
      memberId,
      name: nameByMemberId.get(memberId) ?? "Unknown",
      record: standing
        ? { wins: standing.wins, draws: standing.draws, losses: standing.losses }
        : null,
      position: standing?.position ?? null,
    };
  };

  const fixtures = (fixtureRows ?? []).map((fixture) => ({
    round: fixture.round,
    home: party(fixture.home_member_id),
    away: party(fixture.away_member_id),
  }));

  const nextRound = (calendar ?? []).find((entry) => entry.round === next?.round);

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
      /** Null until the round is scored; numeric comes back as a string. */
      points: number | string | null;
      /** Scoring lines as the score job wrote them; null before it ran. */
      breakdown: {
        lines: { label: string; driverId?: string; points: number }[];
        subtotal: number;
        note?: string;
      } | null;
    }[];
    const captains = [row?.top_captain_id, row?.mid_captain_id].filter(Boolean);

    const superDriverId =
      (chipPlayRows ?? []).find(
        (play) =>
          play.member_id === memberId &&
          play.round === round &&
          play.chip_id === "super_driver",
      )?.target_driver_id ?? null;

    /** The factor on a driver's score, as the badge should label it. */
    const boostOn = (driverId: string): string | null => {
      const doubled = captains.includes(driverId);
      const tripled = driverId === superDriverId;
      // Both is only reachable on a roster from before SuperDriver started
      // moving the armband off its target, but 6x is what it scores.
      if (doubled && tripled) return "6x";
      if (tripled) return "3x";
      return doubled ? "2x" : null;
    };

    // What the pick scored, once the round has been. Null and zero are
    // different answers — nothing scored yet, against scored nothing — so the
    // absent case is preserved rather than collapsed to 0.
    const scoredPoints = (slot: (typeof slots)[number]): number | null =>
      slot.points === null || slot.points === undefined ? null : Number(slot.points);

    // Scoring works in driver ids because names are not its business. A team's
    // breakdown is its two cars, so those ids become names here, where the
    // reference data already is.
    const breakdownFor = (slot: (typeof slots)[number]) => {
      if (!slot.breakdown) return null;
      return {
        ...slot.breakdown,
        lines: slot.breakdown.lines.map((line) => ({
          label: line.driverId ? (drivers.get(line.driverId)?.name ?? line.driverId) : line.label,
          points: line.points,
        })),
      };
    };

    const pick = (slot: (typeof slots)[number]): MatchupPick => {
      if (slot.driver_id) {
        const driver = drivers.get(slot.driver_id);
        return {
          name: driver?.name ?? slot.driver_id,
          headshotUrl: driver?.headshotUrl,
          colour: driver?.colour,
          boost: boostOn(slot.driver_id),
          isTeam: false,
          points: scoredPoints(slot),
          // The backmarker is paid in cost cap, not points, so a 0 next to it
          // is not a bad pick — it is the wrong currency. The row says so
          // rather than letting the zero be read as a failure.
          scoresPoints: slot.slot_type !== "driver_backmarker",
          isBackmarker: slot.slot_type === "driver_backmarker",
          breakdown: breakdownFor(slot),
        };
      }
      const team = constructors.get(slot.constructor_id!);
      return {
        name: team?.name ?? slot.constructor_id!,
        colour: team?.colour,
        lineup: team?.lineup,
        boost: null,
        isTeam: true,
        points: scoredPoints(slot),
        scoresPoints: true,
        breakdown: breakdownFor(slot),
      };
    };

    const ofType = (type: string) =>
      slots.filter((slot) => slot.slot_type === type).map(pick);

    // The boosted driver leads its bracket — the armband, or SuperDriver where
    // it has been played. It is the slot that decides the most and the one both
    // players chose most deliberately, so it reads first rather than wherever
    // the database happened to store it. Sort is stable, so the rest keep the
    // order they came in.
    const boostedFirst = (picks: MatchupPick[]) =>
      [...picks].sort((a, b) => Number(Boolean(b.boost)) - Number(Boolean(a.boost)));

    /** Held open with nulls so both sides of a row are the same slot. */
    const pad = (picks: MatchupPick[], count: number) =>
      Array.from({ length: count }, (_, index) => picks[index] ?? null);

    const lineup = [
      ...pad(boostedFirst(ofType("driver_top")), 3),
      ofType("constructor_top")[0] ?? null,
      ...pad(boostedFirst(ofType("driver_mid")), 3),
      ofType("constructor_mid")[0] ?? null,
      ofType("driver_backmarker")[0] ?? null,
      ofType("constructor_reverse")[0] ?? null,
    ];

    if (lineup.length !== LINEUP_ROWS.length) {
      // Not reachable from the code above, but the card lines the two sides up
      // by index alone: a row added to one and not the other would silently
      // compare a top driver against a backmarker.
      throw new Error(`Lineup is ${lineup.length} slots, card expects ${LINEUP_ROWS.length}`);
    }

    const standing = standings.find((entry) => entry.memberId === memberId);
    const counted = sideStatus.find((entry) => entry.member === memberId);
    const score = (scoreRows ?? []).find(
      (entry) => entry.member_id === memberId && entry.round === round,
    );

    return {
      memberId,
      name: nameByMemberId.get(memberId) ?? "Unknown",
      slots: lineup,
      record: standing
        ? { wins: standing.wins, draws: standing.draws, losses: standing.losses }
        : null,
      seasonPoints: standing?.points ?? 0,
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
   * Every fixture of one round, yours first.
   *
   * The hub used to build your own duel and stop there, which answered half of
   * what a league asks on a Sunday: whether you are winning, but not whether the
   * result matters. The rest of the round was reachable only by opening each
   * rival's profile in turn.
   *
   * On the round still open the rows come back empty for everyone but you —
   * row-level security withholds them until the lock — so those cards say the
   * team is hidden rather than showing it. That is the same information the
   * single card gave before, now given about the whole round.
   */
  const matchupsFor = (round: number, open: boolean): Matchup[] => {
    const drawn = (fixtureRows ?? []).filter((fixture) => fixture.round === round);

    const cards: Matchup[] = drawn.map((fixture) => {
      const isSelf =
        fixture.home_member_id === selfMemberId || fixture.away_member_id === selfMemberId;
      // Your own side leads its card, so the left column is yours wherever you
      // appear — the draw decides who is at home, and the reader should not have
      // to find themselves before they can read a score.
      const [left, right] =
        fixture.away_member_id === selfMemberId
          ? [fixture.away_member_id, fixture.home_member_id]
          : [fixture.home_member_id, fixture.away_member_id];

      return {
        id: `${left}-${right}`,
        sides: [sideFor(left, round, open), sideFor(right, round, open)],
        isSelf,
      };
    });

    // A bye leaves you off the fixture list, and your squad is still the one you
    // came to look at. Other members' byes are left out: a lone side with
    // nothing to compare it to is not a matchup, and four of them would bury the
    // ones that are. A league with no fixtures at all — free-for-all, or before
    // the schedule is drawn — lands here too, which is how it keeps its card.
    const paired = new Set(drawn.flatMap((f) => [f.home_member_id, f.away_member_id]));
    if (selfMemberId && !paired.has(selfMemberId)) {
      const mine = sideFor(selfMemberId, round, open);
      if (mine.hasTeam || mine.points !== null) {
        cards.unshift({ id: selfMemberId, sides: [mine], isSelf: true });
      }
    }

    return cards.sort((a, b) => Number(b.isSelf) - Number(a.isSelf));
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
            matchups: matchupsFor(entry.round, false),
            drawn: (fixtureRows ?? []).some((fixture) => fixture.round === entry.round),
            bets: betsOn(entry.round),
          };
        })
        // A round from before you joined has no squad, no duel and no bets, and
        // an arrow that lands on one is an arrow that wasted a click. The round
        // being run always stays, even when it is empty: it is the one the card
        // exists to announce.
        // Kept on the same test as before, asked of your own card rather than
        // of the round: the other fixtures are worth showing on a round you
        // played, and worth nothing on one you were not there for.
        .filter(
          (entry) =>
            entry.round === event.round ||
            entry.matchups.some((matchup) => matchup.isSelf) ||
            entry.bets.length > 0,
        );

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

  // The round being prepared for, as one more step to the right of the weekend
  // on track. It is the same round the deadline counts down to, so it carries
  // the fixture, the squads as far as the lock allows, and what the league has
  // staked — the three things that used to be a card each, all naming the same
  // grand prix.
  const upcomingEvent: BrowsableEvent | null =
    next && nextRound
      ? (() => {
          return {
            round: next.round,
            raceName: nextRound.race_name,
            qualifyingAt: nextRound.qualifying_at,
            raceAt: raceInstant(nextRound),
            scored: false,
            status: null,
            upcoming: true,
            matchups: matchupsFor(next.round, true),
            drawn: (fixtureRows ?? []).some((fixture) => fixture.round === next.round),
            bets: roundBets,
            hiddenBets,
          };
        })()
      : null;

  const browsable = upcomingEvent ? [...events, upcomingEvent] : events;

  // Opens on whichever of the two rounds is nearer to now. For the days around
  // a grand prix that is the weekend on track; once it is a week behind, the
  // round being prepared for is closer than the one already raced and the card
  // belongs to it. Either way the other is one arrow away.
  const openOn =
    openingRound({ current: event, upcoming: upcomingEvent }) ??
    browsable[browsable.length - 1]?.round;

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-16">
      <header className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold tracking-tight">{league.name}</h1>
        <p className="text-sm text-zinc-500">
          {league.season} · {league.mode === "duel" ? "Duel" : "Free-for-all"} · cost cap{" "}
          {money(Number(league.starting_cost_cap), 0)}
        </p>
      </header>

      {/* The weekend on track, above the one being prepared for, and the season
          behind it one arrow at a time. */}
      {browsable.length > 0 && openOn !== undefined && (
        <EventBrowser
          leagueId={league.id}
          events={browsable}
          initialRound={openOn}
          duel={league.mode === "duel"}
        />
      )}

      {/* The table before the chart: the standings answer who is winning, which
          is the question the page is opened with. The season panels explain how
          it got that way, which is the question asked second. */}
      <Standings
        leagueId={league.id}
        rows={standings}
        names={nameByMemberId}
        mode={league.mode as LeagueMode}
        cash={cash}
        currentMemberId={selfMemberId}
      />

      <StatsCard series={stats} />

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
          currentRound={openOn}
          currentMemberId={selfMemberId}
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
