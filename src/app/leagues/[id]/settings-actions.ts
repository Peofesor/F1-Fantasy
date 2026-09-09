"use server";

import { revalidatePath } from "next/cache";

import { parseChipAllowance } from "@/lib/f1/chip-allowance";
import { THEMES } from "@/lib/f1/themes";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

export type SettingsState = { error: string } | { ok: true; message: string } | null;

/**
 * The league settings a host may change mid-season.
 *
 * Deliberately a short list, and everything on it affects only rounds still to
 * come: the name is cosmetic, the stake ceiling narrows what a future bet may
 * risk, and a chip allowance changes what is left to play. Mode, season and the
 * opening budget stay fixed for the opposite reason — changing any of them
 * would rescore history.
 */
export async function updateLeagueSettings(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const rawStake = String(formData.get("maxStake") ?? "").trim();
  const rawTheme = String(formData.get("theme") ?? "").trim();

  const user = await getCurrentUser();
  if (!user) return { error: "Sign in first." };

  if (name.length < 1 || name.length > 60) {
    return { error: "A league name is between 1 and 60 characters." };
  }

  // Blank means no ceiling beyond the bank, which is what a league starts with.
  const maxStake = rawStake === "" ? null : Number(rawStake);
  if (maxStake !== null && (!Number.isFinite(maxStake) || maxStake <= 0)) {
    return { error: "A stake limit has to be a positive number, or blank for none." };
  }

  // An unknown id would render as the default anyway, but storing one would
  // leave a value in the column that nothing can explain later.
  const theme = THEMES.some((option) => option.id === rawTheme) ? rawTheme : null;

  const allowance = parseChipAllowance(formData);
  if ("error" in allowance) return { error: allowance.error };

  const supabase = await createServerSupabase();

  // The update policy already restricts this to the owner; checked here too so
  // a refusal reads as a sentence rather than as zero rows changed.
  const { data: league } = await supabase
    .from("leagues")
    .select("owner_id")
    .eq("id", leagueId)
    .maybeSingle();

  if (!league) return { error: "That league is gone." };
  if (league.owner_id !== user.id) {
    return { error: "Only whoever created the league can change its settings." };
  }

  const { error } = await supabase
    .from("leagues")
    .update({ name, max_stake: maxStake, chip_allowance: allowance, theme })
    .eq("id", leagueId);

  if (error) return { error: error.message };

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath("/leagues");
  return { ok: true, message: "Saved." };
}
