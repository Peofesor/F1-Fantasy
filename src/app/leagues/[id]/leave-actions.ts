"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type LeaveState = { error: string } | null;

/**
 * Leaves a league, taking everything you did in it.
 *
 * Every gameplay table hangs off `league_members` with `on delete cascade`, so
 * this removes rosters, ledger, round scores, bets, chips and duel fixtures for
 * that member. There is no soft delete and no undo — which is why the button
 * that calls this asks first and says so plainly.
 *
 * The owner cannot walk out on a league that still has members in it. The
 * league's `owner_id` points at a profile rather than a membership, so leaving
 * would leave it running with nobody able to reschedule fixtures, and no way
 * back in without an invite code only they could see.
 */
export async function leaveLeague(_previous: LeaveState, formData: FormData): Promise<LeaveState> {
  const leagueId = String(formData.get("leagueId") ?? "");

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const supabase = await createServerSupabase();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, owner_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league) return { error: "That league is gone." };

  const { data: membership } = await supabase
    .from("league_members")
    .select("id")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "You are not in that league." };

  if (league.owner_id === user.id) {
    const { count } = await supabase
      .from("league_members")
      .select("*", { count: "exact", head: true })
      .eq("league_id", leagueId);

    if ((count ?? 0) > 1) {
      return {
        error:
          "You created this league, so you cannot leave while others are still in it. " +
          "Hand it over or wait for everyone else to go first.",
      };
    }
  }

  const { error, count } = await supabase
    .from("league_members")
    .delete({ count: "exact" })
    .eq("id", membership.id);

  if (error) return { error: error.message };
  if (!count) return { error: "Could not leave — nothing was removed." };

  revalidatePath("/leagues");
  redirect("/leagues");
}
