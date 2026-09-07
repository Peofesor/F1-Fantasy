import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { SchedulePanel } from "./schedule-panel";

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
    <main className="mx-auto max-w-2xl space-y-5 p-4 pb-16">
      <header className="pt-2">
        <Link href="/leagues" className="text-sm text-zinc-500 underline underline-offset-4">
          ← Leagues
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{league.name}</h1>
        <p className="text-sm text-zinc-500">
          {league.season} · {league.mode === "duel" ? "Duel" : "Free-for-all"} · cost cap{" "}
          {Number(league.starting_cost_cap).toFixed(0)}
        </p>
      </header>

      <Link
        href={`/leagues/${league.id}/roster`}
        className="block rounded-xl bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Build your roster
      </Link>

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
