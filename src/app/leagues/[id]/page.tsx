import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { DeadlineCard } from "./deadline-card";
import { LeagueNav } from "./league-nav";
import { currentRound } from "@/lib/f1/round-context";
import { SchedulePanel } from "./schedule-panel";
import { Standings } from "./standings";
import { buildStandings, type LeagueMode } from "@/lib/f1/standings";
import { ledgerBalance } from "@/lib/f1/ledger";

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
    .select("id, name, season, mode, invite_code, starting_cost_cap, owner_id")
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
        duelPoints: Number(row.duel_points),
      })),
    league.mode as LeagueMode,
  );

  // Own ledger only — the read policy keeps another member's spare cap private,
  // since it would reveal their betting capacity.
  const { data: ledgerRows } = selfMemberId
    ? await supabase.from("cost_cap_entries").select("amount").eq("member_id", selfMemberId)
    : { data: [] };

  const capBalance = ledgerBalance(ledgerRows ?? []);

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

      <div className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="text-sm text-zinc-500">Your cost cap</span>
        <span className="tabular-nums text-lg font-semibold">{capBalance.toFixed(1)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/leagues/${league.id}/roster`}
          className="rounded-xl bg-zinc-900 px-3 py-3 text-center text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Roster
        </Link>
        <Link
          href={`/leagues/${league.id}/bets`}
          className="rounded-xl border border-zinc-200 px-3 py-3 text-center text-sm font-medium dark:border-zinc-800"
        >
          Bets
        </Link>
      </div>

      <Standings
        rows={standings}
        names={nameByMemberId}
        mode={league.mode as LeagueMode}
        currentMemberId={selfMemberId}
      />

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Members</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {roster?.map((member) => (
            <li key={member.id} className="flex justify-between">
              <span>{member.name}</span>
              {member.isSelf && <span className="text-xs text-zinc-500">you</span>}
            </li>
          ))}
        </ul>
      </section>

      {league.mode === "duel" && (
        <SchedulePanel
          leagueId={league.id}
          isOwner={league.owner_id === user.id}
          fixtures={fixtures}
        />
      )}

      <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
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
