import Link from "next/link";
import { redirect } from "next/navigation";

import { ensureProfile, signOut } from "../auth/actions";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { LeagueForms } from "./league-forms";

export const dynamic = "force-dynamic";

interface MembershipRow {
  id: string;
  leagues: { id: string; name: string; season: number; mode: string; invite_code: string } | null;
}

export default async function LeaguesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await ensureProfile();

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("league_members")
    // The FK is named explicitly because duel_fixtures references both
    // leagues and league_members, so PostgREST sees a second relationship
    // between them and refuses an unqualified embed.
    .select("id, leagues!league_members_league_id_fkey(id, name, season, mode, invite_code)")
    .eq("profile_id", user.id);

  const memberships = (data ?? []) as unknown as MembershipRow[];

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 pb-16">
      <header className="flex items-baseline justify-between pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your leagues</h1>
          <p className="text-sm text-zinc-500">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/rules" className="text-sm text-zinc-500 underline underline-offset-4">
            Rules
          </Link>
          <form action={signOut}>
            <button className="text-sm text-zinc-500 underline underline-offset-4">Sign out</button>
          </form>
        </div>
      </header>

      {memberships.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          You are not in a league yet. Create one, or join with a friend&apos;s code.
        </p>
      ) : (
        <ul className="space-y-2">
          {memberships.map((membership) =>
            membership.leagues ? (
              <li key={membership.id}>
                <Link
                  href={`/leagues/${membership.leagues.id}`}
                  className="block rounded-xl border border-zinc-200 p-4 transition hover:border-zinc-400 dark:border-zinc-800"
                >
                  <span className="font-medium">{membership.leagues.name}</span>
                  <span className="mt-0.5 block text-sm text-zinc-500">
                    {membership.leagues.season} ·{" "}
                    {membership.leagues.mode === "duel" ? "Duel" : "Free-for-all"} · code{" "}
                    <code className="font-mono">{membership.leagues.invite_code}</code>
                  </span>
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      )}

      <LeagueForms />
    </main>
  );
}
