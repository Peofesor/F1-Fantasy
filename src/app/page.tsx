import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Entry point.
 *
 * Sends a signed-in member to their leagues and everyone else to sign-in.
 * There is no marketing page to show: this is a private league, so the only
 * thing a visitor can usefully do is sign in.
 *
 * The ingested-data view lives at /data — useful for checking the pipeline,
 * but not where a player should land.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? "/leagues" : "/login");
}
