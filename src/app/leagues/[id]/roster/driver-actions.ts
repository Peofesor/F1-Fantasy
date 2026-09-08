"use server";

import { loadDriverSeason, type DriverSeason } from "@/lib/f1/driver-season";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type DriverSeasonState = DriverSeason | { error: string };

/**
 * A driver's season for the detail sheet.
 *
 * Loaded on demand rather than shipped with the roster page: the breakdown is
 * every round for every driver in the field, which is a lot of payload for
 * something most visits never open. Membership is re-checked here because a
 * Server Action takes a direct POST — the figures are not secret, but an
 * endpoint that scores a whole season for anyone who asks is worth gating.
 */
export async function driverSeason(
  leagueId: string,
  driverId: string,
): Promise<DriverSeasonState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("league_members")
    .select("id, leagues!league_members_league_id_fkey(season)")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "Not a member of this league." };

  const league = membership.leagues as unknown as { season: number };

  try {
    return await loadDriverSeason(supabase, league.season, driverId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load that season." };
  }
}
