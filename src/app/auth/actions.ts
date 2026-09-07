"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

/**
 * Authentication actions.
 *
 * Every Server Action is reachable by direct POST, not just through the UI, so
 * each one re-checks authentication and authorisation itself rather than
 * assuming the page that rendered the form did.
 */

export type ActionState = { error: string } | { ok: true } | null;

function readCredentials(formData: FormData): { email: string; password: string } | null {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return null;
  return { email, password };
}

export async function signIn(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const credentials = readCredentials(formData);
  if (!credentials) return { error: "Email and password are both required." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) return { error: error.message };

  redirect("/leagues");
}

export async function signUp(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const credentials = readCredentials(formData);
  if (!credentials) return { error: "Email and password are both required." };

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return { error: "Pick a display name — your league sees it." };
  if (credentials.password.length < 8) {
    return { error: "Use at least 8 characters for the password." };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    ...credentials,
    options: { data: { display_name: displayName } },
  });
  if (error) return { error: error.message };

  // With email confirmation enabled there is no session yet; the profile is
  // created on first sign-in instead (see ensureProfile).
  if (!data.session) {
    return { error: "Check your email to confirm the account, then sign in." };
  }

  await ensureProfile(displayName);
  redirect("/leagues");
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Creates the profile row for the signed-in user if it does not exist.
 *
 * Profiles are separate from auth.users because auth schema rows cannot carry
 * application columns or be referenced by foreign keys from our tables.
 */
export async function ensureProfile(displayName?: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createServerSupabase();
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return;

  const name =
    displayName ??
    (user.user_metadata?.display_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "Player";

  await supabase.from("profiles").insert({ id: user.id, display_name: name.slice(0, 40) });
}
