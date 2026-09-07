"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureProfile } from "../auth/actions";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type LeagueActionState = { error: string } | null;

/** Unambiguous alphabet: no O/0 or I/1, since codes get read aloud and retyped. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateInviteCode(): string {
  return Array.from(
    { length: 8 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join("");
}

export async function createLeague(
  _previous: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  // Re-checked here rather than trusted from the page: a Server Action is
  // reachable by direct POST.
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  await ensureProfile();

  const name = String(formData.get("name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "");
  const season = Number(formData.get("season") ?? new Date().getUTCFullYear());

  if (!name) return { error: "Give the league a name." };
  if (mode !== "duel" && mode !== "free_for_all") return { error: "Pick a mode." };
  if (!Number.isInteger(season)) return { error: "Season must be a year." };

  const supabase = await createServerSupabase();
  const { data: league, error } = await supabase
    .from("leagues")
    .insert({ name, mode, season, owner_id: user.id, invite_code: generateInviteCode() })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // The creator is a member too, otherwise they could not field a roster.
  const { error: joinError } = await supabase
    .from("league_members")
    .insert({ league_id: league.id, profile_id: user.id });
  if (joinError) return { error: joinError.message };

  revalidatePath("/leagues");
  redirect(`/leagues/${league.id}`);
}

export async function joinLeague(
  _previous: LeagueActionState,
  formData: FormData,
): Promise<LeagueActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };
  await ensureProfile();

  const code = String(formData.get("inviteCode") ?? "").trim().toUpperCase();
  if (!code) return { error: "Enter an invite code." };

  const supabase = await createServerSupabase();

  // Resolving a code before membership exists needs a lookup the member-only
  // read policy would block, so this runs through a security-definer function.
  const { data: leagueId, error: lookupError } = await supabase.rpc("league_id_for_invite", {
    code,
  });

  if (lookupError) return { error: lookupError.message };
  if (!leagueId) return { error: "No league with that code." };

  const { error } = await supabase
    .from("league_members")
    .insert({ league_id: leagueId, profile_id: user.id });

  if (error) {
    // A unique violation here just means they were already in the league.
    if (error.code === "23505") redirect(`/leagues/${leagueId}`);
    return { error: error.message };
  }

  revalidatePath("/leagues");
  redirect(`/leagues/${leagueId}`);
}
