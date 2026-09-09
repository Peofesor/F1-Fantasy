"use server";

import { revalidatePath } from "next/cache";

import { generateDuelSchedule } from "@/lib/f1/duel-schedule";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type ScheduleState = { error: string } | { ok: true; fixtures: number } | null;

/**
 * Draws the duel fixtures for the rounds still to come.
 *
 * Owner-only, and safe to run again whenever the membership changes — which is
 * the point. Rounds that have locked keep the pairings they were scored
 * against; everything from the next open round onward is redrawn across
 * whoever is in the league now.
 *
 * Spec §3 calls the schedule fixed for the season, and that holds for rounds
 * already played. Applying it to future ones as well meant a member who joined
 * after the draw never had an opponent again, which is not a fixed schedule so
 * much as a closed one.
 */
export async function generateSchedule(
  _previous: ScheduleState,
  formData: FormData,
): Promise<ScheduleState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) return { error: "Missing league." };

  const supabase = await createServerSupabase();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, season, mode, owner_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league) return { error: "League not found." };
  if (league.owner_id !== user.id) return { error: "Only the league owner can do that." };
  if (league.mode !== "duel") {
    return { error: "Free-for-all leagues have no fixtures — everyone is ranked on points." };
  }

  const { data: members } = await supabase
    .from("league_members")
    .select("id")
    .eq("league_id", leagueId)
    .order("joined_at");

  const memberIds = (members ?? []).map((member) => member.id);
  if (memberIds.length < 2) {
    return { error: "Wait for at least one more member before generating fixtures." };
  }

  const { data: rounds } = await supabase
    .from("rounds")
    .select("round, qualifying_at")
    .eq("season", league.season)
    .order("round");

  if (!rounds?.length) {
    return { error: `No rounds ingested for ${league.season} yet.` };
  }

  // Only schedule rounds that have not locked. A league created mid-season
  // starts from the next open round rather than inventing fixtures for races
  // that have already run.
  const now = Date.now();
  const openRounds = rounds
    .filter((round) => !round.qualifying_at || new Date(round.qualifying_at).getTime() > now)
    .map((round) => round.round);

  if (openRounds.length === 0) {
    return { error: "Every round this season has already locked." };
  }

  // Rounds still to come are rebuilt; rounds already locked are left exactly
  // as they were.
  //
  // This used to refuse outright once any fixture existed, on the grounds that
  // a season's schedule should be fixed. That is right about the past and
  // wrong about the future: a league gains members, and under the old rule
  // everyone who joined after the schedule was drawn had no opponent for the
  // rest of the season — the duel league simply did not include them. Someone
  // who joins in September should play from September.
  //
  // Rewriting a locked round would still be the thing worth refusing, since
  // results are already scored against those pairings, so those are untouched.
  const { error: clearError } = await supabase
    .from("duel_fixtures")
    .delete()
    .eq("league_id", leagueId)
    .in("round", openRounds);

  if (clearError) return { error: clearError.message };

  const fixtures = generateDuelSchedule(memberIds, openRounds).map((fixture) => ({
    league_id: leagueId,
    season: league.season,
    round: fixture.round,
    home_member_id: fixture.homeMemberId,
    away_member_id: fixture.awayMemberId,
  }));

  const { error } = await supabase.from("duel_fixtures").insert(fixtures);
  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  return { ok: true, fixtures: fixtures.length };
}
