import { MARKETS, type MarketId } from "@/lib/f1/betting";
import { loadCurrentEvent } from "@/lib/f1/event-status";
import { money } from "@/lib/f1/money";
import { loadMemberContext } from "../member-context";
import { loadBetForm } from "./bet-form-data";
import { BetsPanel, type PlacedBet } from "./bets-panel";
import { BetsBrowser, type BrowsableRound, type LeagueBet } from "./bets-browser";

export const dynamic = "force-dynamic";

/**
 * Betting: the card that places one, and the record of every bet in the league.
 *
 * The record used to be a page of its own, reached by a button above the form.
 * The split was meant to keep deciding apart from checking, but the two are one
 * errand — you check what is already on before you decide what to add — and the
 * count on the button was never quite enough to save the trip. Both halves now
 * sit on the tab named after them: the form first, because it is the thing
 * being done, and the record under it, because it is the thing being consulted.
 *
 * The record covers the whole league and the whole season. Two questions were
 * unanswerable while it showed only your own slip on the open round: what did
 * the others back, and what is riding on the race being run right now — because
 * the open round moves on the instant qualifying starts.
 *
 * What is readable is the database's decision. A bet stays private until its
 * round locks, so nobody can copy a rival's call before the deadline; the
 * counts come back even then, which is what lets the page distinguish a league
 * that has not bet from one whose bets it cannot see.
 */
export default async function BetsPage({ params }: PageProps<"/leagues/[id]/paddock">) {
  const { id } = await params;
  const { supabase, memberId, memberName, league, round, balance } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to bet on.
        </p>
      </main>
    );
  }

  // The form's own loader answers the lock too — betting closes when qualifying
  // starts, on the same clock as the roster — so the card and the record under
  // it cannot disagree about whether a stake can still be taken back.
  const [{ data: memberRows }, { data: calendar }, event, form] = await Promise.all([
    supabase
      .from("league_members")
      .select("id, profile_id, profiles(display_name)")
      .eq("league_id", id),
    supabase.from("rounds").select("round, race_name").eq("season", league.season),
    loadCurrentEvent(supabase, league.season),
    loadBetForm(supabase, memberId, round),
  ]);

  const members = (memberRows ?? []).map((member) => ({
    id: member.id as string,
    name:
      (member.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
  }));
  const nameByMemberId = new Map(members.map((member) => [member.id, member.name]));

  // The whole season in one read. A few members times a few markets is a couple
  // of hundred rows at most, which is cheaper to fetch once than to re-query
  // every time the reader changes round.
  const [{ data: betRows }, placed] = await Promise.all([
    supabase
      .from("bets")
      .select("member_id, round, market_id, selection, stake, outcome, returned, odds")
      .in(
        "member_id",
        members.map((member) => member.id),
      )
      .eq("season", round.season),
    // How many bets each member has on the open round, which is readable even
    // while the bets themselves are not.
    Promise.all(
      members.map(async (member) => {
        const { data } = await supabase.rpc("bets_placed", {
          target_member: member.id,
          target_season: round.season,
          target_round: round.round,
        });
        return { member: member.id, count: Number(data ?? 0) };
      }),
    ),
  ]);

  const bets: LeagueBet[] = (betRows ?? []).map((bet) => {
    const marketId = bet.market_id as MarketId;
    const marketName = MARKETS[marketId]?.name ?? marketId;
    // Selections are stored as ids; the reference tables give them names.
    const selection =
      round.driverNames.get(bet.selection) ??
      round.constructorNames.get(bet.selection) ??
      bet.selection;
    const stake = Number(bet.stake);
    const odds = bet.odds === null || bet.odds === undefined ? null : Number(bet.odds);
    const returned = bet.returned === null ? null : Number(bet.returned);
    const isSelf = bet.member_id === memberId;

    return {
      round: bet.round,
      memberId: bet.member_id,
      memberName: nameByMemberId.get(bet.member_id) ?? "Unknown",
      isSelf,
      market: marketName,
      selection,
      stake,
      odds,
      outcome: bet.outcome,
      returned,
      own: isSelf
        ? {
            marketId,
            marketName,
            selection,
            stake,
            outcome: bet.outcome,
            returned,
            odds,
          }
        : null,
    };
  });

  const raceName = new Map(
    (calendar ?? []).map((entry) => [entry.round, entry.race_name as string]),
  );

  // Rounds worth offering: any with a bet on it, plus the one still open and
  // the one being run. Listing the whole season instead would be two dozen
  // entries of which most are empty.
  const offered = new Set<number>(bets.map((bet) => bet.round));
  offered.add(round.round);
  if (event) offered.add(event.round);

  const rounds: BrowsableRound[] = [...offered]
    .sort((a, b) => b - a)
    .map((entry) => ({
      round: entry,
      raceName: raceName.get(entry) ?? `Round ${entry}`,
      live: Boolean(event && event.round === entry && event.status.live),
    }));

  // Open on the race being run when there is something on it, then on the most
  // recent round with a bet, and only then on the round still open — which is
  // usually empty, because nobody has bet on it yet.
  const withBets = new Set(bets.map((bet) => bet.round));
  const opening =
    event && withBets.has(event.round)
      ? event.round
      : withBets.size > 0
        ? Math.max(...withBets)
        : round.round;

  // Your own open slip, in the shape the form wants: it greys out a market you
  // have already bet on, which is the one thing the form cannot work out alone.
  const mine: PlacedBet[] = bets
    .filter((bet) => bet.round === round.round)
    .map((bet) => bet.own)
    .filter((own): own is PlacedBet => own !== null);

  const sealed = placed
    .map((entry) => ({
      name: nameByMemberId.get(entry.member) ?? "Unknown",
      count:
        entry.count -
        bets.filter((bet) => bet.round === round.round && bet.memberId === entry.member).length,
    }))
    .filter((entry) => entry.count > 0);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
      {/* The bank leads: everything on this page spends it, and how much is
          left is the number that decides what you do next. */}
      <div className="mt-2 rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-4 dark:border-zinc-800 dark:from-zinc-900 dark:to-zinc-950">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              To spend
            </p>
            <p className="mt-0.5 text-3xl font-semibold tabular-nums leading-none">
              {money(balance)}
            </p>
          </div>
          {/* Whose bank this is, above the race it is being spent on. In a
              league of four the balance alone does not say who is looking at
              it, and this is the one page where the number is the whole point.
              The round matters more now that the record below winds back to
              any other: this names the one the card takes bets on. */}
          <p className="shrink-0 text-right text-xs text-zinc-500">
            <span className="block font-semibold text-zinc-900 dark:text-zinc-100">
              {memberName}
            </span>
            {round.raceName}
            <span className="block">Round {round.round}</span>
          </p>
        </div>
      </div>

      <BetsPanel
        leagueId={league.id}
        round={round.round}
        bank={balance}
        bets={mine}
        leagueLimit={league.max_stake}
        {...form}
      />

      {/* The record, under the card that writes to it. */}
      <BetsBrowser
        leagueId={league.id}
        rounds={rounds}
        bets={bets}
        openRound={round.round}
        opening={opening}
        locked={form.locked}
        sealed={sealed}
      />
    </main>
  );
}
