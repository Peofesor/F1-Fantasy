import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadRoundContext, type RoundContext } from "@/lib/f1/round-context";
import { halfOf, summerBreakRound } from "@/lib/f1/half-season";
import type { ChipAllowance } from "@/lib/f1/chips";
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
    /** Per-bet ceiling set by the host, or null for none. */
    max_stake: number | null;
    /** Free chip uses granted per half-season, keyed by chip id. */
    chip_allowance: ChipAllowance | null;
    /** Colour scheme id, or null for the default. */
    theme: string | null;
  };
  /**
   * The rounds sharing this round's half of the season, and the allowance that
   * applies to them. Null when the calendar has no break to split on.
   */
  half: { allowance: ChipAllowance | null; rounds: number[] } | null;
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
    .select(
      "id, leagues!league_members_league_id_fkey(id, name, season, starting_cost_cap, max_stake, chip_allowance, theme)",
    )
    .eq("league_id", leagueId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!membership) notFound();

  const league = membership.leagues as unknown as MemberContext["league"];

  const [round, { data: ledgerRows }] = await Promise.all([
    loadRoundContext(supabase, league.season),
    supabase.from("cost_cap_entries").select("amount").eq("member_id", membership.id),
  ]);

  // Which half of the season this round sits in, so chip allowances reset at
  // the summer break rather than running the whole year.
  let half: MemberContext["half"] = null;
  if (round) {
    const { data: calendar } = await supabase
      .from("rounds")
      .select("round, race_date")
      .eq("season", league.season)
      .order("round");

    const rows = (calendar ?? []).map((entry) => ({
      round: entry.round,
      raceDate: entry.race_date as string,
    }));
    const breakRound = summerBreakRound(rows);

    if (breakRound !== null) {
      const mine = halfOf(round.round, breakRound);
      half = {
        allowance: league.chip_allowance,
        rounds: rows.filter((entry) => halfOf(entry.round, breakRound) === mine).map((e) => e.round),
      };
    }
  }

  return {
    supabase,
    memberId: membership.id,
    league,
    round,
    half,
    balance: ledgerBalance(ledgerRows ?? []),
  };
}
