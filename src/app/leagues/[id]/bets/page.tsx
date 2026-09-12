import Link from "next/link";

import { MARKETS, type MarketId } from "@/lib/f1/betting";
import { loadCurrentEvent } from "@/lib/f1/event-status";
import { loadMemberContext } from "../member-context";
import { LeagueNav } from "../league-nav";
import { BetsBrowser, type BrowsableRound, type LeagueBet } from "./bets-browser";

export const dynamic = "force-dynamic";

/**
 * Every bet in the league, by round.
 *
 * Split out of the paddock, which had grown into three errands on one screen:
 * buying chips, choosing a bet, and checking what had been staked. The third is
 * the one you come back to, and it was the one buried at the bottom.
 *
 * It now covers the whole league and the whole season rather than your own slip
 * on the open round. Two questions were unanswerable before: what did the
 * others back, and what is riding on the race being run right now — because the
 * page followed the round you could still bet on, which moves on the instant
 * qualifying starts.
 *
 * What is readable is the database's decision. A bet stays private until its
 * round locks, so nobody can copy a rival's call before the deadline; the
 * counts come back even then, which is what lets the page distinguish a league
 * that has not bet from one whose bets it cannot see.
 */
export default async function BetsPage({ params }: PageProps<"/leagues/[id]/bets">) {
  const { id } = await params;
  const { supabase, memberId, league, round, balance } = await loadMemberContext(id);

  if (!round) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <LeagueNav leagueId={league.id} active="bets" />
        <p className="text-sm text-zinc-500">
          No rounds ingested for {league.season} yet, so there is nothing to bet on.
        </p>
      </main>
    );
  }

  const [
    { data: memberRows },
    { data: calendar },
    { data: roster },
    event,
    { data: qualifyingStarted },
  ] = await Promise.all([
    supabase.from("league_members").select("id, profile_id, profiles(display_name)").eq("league_id", id),
    supabase.from("rounds").select("round, race_name").eq("season", league.season),
    // The manual freeze, which nothing sets today but which still overrides the
    // clock when it is.
    supabase
      .from("rosters")
      .select("locked_at")
      .eq("member_id", memberId)
      .eq("season", round.season)
      .eq("round", round.round)
      .maybeSingle(),
    loadCurrentEvent(supabase, league.season),
    // Betting closes when qualifying starts, on the same clock as the roster,
    // so a withdrawal is only offered while the weekend has not started.
    supabase.rpc("is_round_locked", {
      target_season: round.season,
      target_round: round.round,
    }),
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

  const raceName = new Map((calendar ?? []).map((entry) => [entry.round, entry.race_name as string]));

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
      <header className="space-y-3 pt-2">
        <LeagueNav leagueId={league.id} active="bets" />

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {league.name}
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight">Bets</h1>
          </div>
          <p className="shrink-0 text-right text-xs text-zinc-500">
            your bank
            <span className="block text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {balance.toFixed(1)}
            </span>
          </p>
        </div>
      </header>

      <BetsBrowser
        leagueId={league.id}
        rounds={rounds}
        bets={bets}
        openRound={round.round}
        opening={opening}
        locked={Boolean(roster?.locked_at) || Boolean(qualifyingStarted)}
        sealed={sealed}
      />

      <Link
        href={`/leagues/${league.id}/paddock`}
        className="block rounded-lg bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-medium text-[var(--accent-ink)]"
      >
        Place a bet on {round.raceName}
      </Link>
    </main>
  );
}
