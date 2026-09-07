"use server";

import { revalidatePath } from "next/cache";

import { generateDuelSchedule } from "@/lib/f1/duel-schedule";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type ScheduleState = { error: string } | { ok: true; fixtures: number } | null;

/**
 * Generates the season's duel fixtures for a league.
 *
 * Owner-only, and refuses to run once any round has locked. The schedule is
 * meant to be fixed for the season (spec §3): regenerating it partway through
 * would retroactively change who a member was supposed to have played, and any
 * results already scored against the old fixtures would no longer line up.
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

  const { data: existing } = await supabase
    .from("duel_fixtures")
    .select("round")
    .eq("league_id", leagueId)
    .limit(1);

  if (existing?.length) {
    return { error: "Fixtures already exist. The schedule is fixed once generated." };
  }

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
