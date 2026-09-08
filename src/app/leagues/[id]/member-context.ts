import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRoundContext, type RoundContext } from "@/lib/f1/round-context";
import { ledgerBalance } from "@/lib/f1/ledger";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

/**
 * What every league sub-page needs before it can render anything.
 *
 * Roster, chips and bets all begin the same way: prove membership, find the
 * round being played, and read the member's bank. Loading it once keeps those
 * three pages from drifting apart on which round they think is live — a
 * disagreement that would silently attach a chip to the wrong weekend.
 */
export interface MemberContext {
  supabase: SupabaseClient;
  /** `league_members.id`, which is what every gameplay table keys off. */
  memberId: string;
  league: {
    id: string;
    name: string;
    season: number;
    starting_cost_cap: number;
  };
  /** Null when the season has no ingested rounds yet. */
  round: RoundContext | null;
  /** Spare cap: what is in the bank, not counting value tied up in the roster. */
  balance: number;
}

export async function loadMemberContext(leagueId: string): Promise<MemberContext> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createServerSupabase();

  const { data: membership } = await supabase
    .from("league_members")
    // The FK is named explicitly because duel_fixtures references both
    // leagues and league_members, so PostgREST sees a second relationship
    // between them and refuses an unqualified embed.
    .select("id, leagues!league_members_league_id_fkey(id, name, season, starting_cost_cap)")
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  const league = membership.leagues as unknown as MemberContext["league"];

  const [round, { data: ledgerRows }] = await Promise.all([
    loadRoundContext(supabase, league.season),
    supabase.from("cost_cap_entries").select("amount").eq("member_id", membership.id),
  ]);

  return {
    supabase,
    memberId: membership.id,
    league,
    round,
    balance: ledgerBalance(ledgerRows ?? []),
  };
}
