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
 * The last person out takes the league with them: an emptied league is
 * unreachable by anybody, since the read policy needs membership or ownership,
 * so leaving it behind only accumulates rows nobody can see or remove.
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

  // Counted before leaving: afterwards the row is gone and so is the answer.
  const { count: before } = await supabase
    .from("league_members")
    .select("*", { count: "exact", head: true })
    .eq("league_id", leagueId);

  const { error, count } = await supabase
    .from("league_members")
    .delete({ count: "exact" })
    .eq("id", membership.id);

  if (error) return { error: error.message };
  if (!count) return { error: "Could not leave — nothing was removed." };

  if ((before ?? 0) <= 1) {
    // Nobody is left to see it. A failure here is not worth blocking the exit
    // over — the member is already out, and an orphaned league harms nothing
    // beyond being untidy.
    await supabase.from("leagues").delete().eq("id", leagueId);
  }

  revalidatePath("/leagues");
  redirect("/leagues");
}

export type RemoveState = { error: string } | { ok: true; message: string } | null;

/**
 * Removes another member from the league.
 *
 * Owner-only, and enforced twice: the delete policy admits the owner for any
 * membership but their own, and this refuses before reaching the database so
 * the answer is a sentence rather than zero rows changed.
 *
 * The same cascade as leaving applies — rosters, ledger, scores, bets, chips
 * and fixtures all go with the member, and there is no undo. The owner cannot
 * remove themselves here: leaving carries rules this path does not, and an
 * owner who vanished would leave a league nobody can reschedule.
 */
export async function removeMember(
  _previous: RemoveState,
  formData: FormData,
): Promise<RemoveState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const supabase = await createServerSupabase();

  const { data: league } = await supabase
    .from("leagues")
    .select("owner_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league) return { error: "That league is gone." };
  if (league.owner_id !== user.id) {
    return { error: "Only whoever created the league can remove people from it." };
  }

  const { data: member } = await supabase
    .from("league_members")
    .select("id, profile_id, profiles(display_name)")
    .eq("id", memberId)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (!member) return { error: "They are not in this league." };
  if (member.profile_id === user.id) {
    return { error: "You cannot remove yourself — leave the league instead." };
  }

  const name =
    (member.profiles as unknown as { display_name: string } | null)?.display_name ?? "That member";

  const { error, count } = await supabase
    .from("league_members")
    .delete({ count: "exact" })
    .eq("id", memberId)
    .eq("league_id", leagueId);

  if (error) return { error: error.message };
  if (!count) return { error: "Nothing was removed — check you still own this league." };

  revalidatePath(`/leagues/${leagueId}`);
  return {
    ok: true,
    message: `${name} removed. Redraw the fixtures so the remaining rounds pair everyone again.`,
  };
}
