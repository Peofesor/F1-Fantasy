import type { SupabaseClient } from "@supabase/supabase-js";

import { assignTiers, buildSeedRanks, rollingWindowPoints, type RoundPoints, type Tier } from "./tiers";

/**
 * Assembles everything needed to build or validate a roster for one round:
 * which bracket each driver is in, and what everyone costs.
 *
 * Tiers are computed on demand rather than stored. They derive from results
 * that are already in the database, so storing them would create a second copy
 * that could drift out of step with the prices computed from the same window.
 */

export interface RoundContext {
  season: number;
  round: number;
  raceName: string;
  tiers: Map<string, Tier>;
  driverPrices: Map<string, number>;
  constructorPrices: Map<string, number>;
  driverNames: Map<string, string>;
  driverTeams: Map<string, string>;
  constructorNames: Map<string, string>;
}

/**
 * The round a roster is currently being picked for.
 *
 * Uses the most recently ingested round of the season. Once a real fixture
 * calendar with lock deadlines exists this should become "the next unlocked
 * round"; for now it is the latest one we hold data for.
 */
export async function currentRound(
  supabase: SupabaseClient,
  season: number,
): Promise<{ season: number; round: number; race_name: string } | null> {
  const { data } = await supabase
    .from("rounds")
    .select("season, round, race_name")
    .eq("season", season)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function loadRoundContext(
  supabase: SupabaseClient,
  season: number,
): Promise<RoundContext | null> {
  const round = await currentRound(supabase, season);
  if (!round) return null;

  const [results, priorDrivers, priorConstructors, prices, constructorPrices, drivers, constructors] =
    await Promise.all([
      // Two seasons is more than the five-race window needs, and covers a
      // window that straddles the season boundary.
      supabase
        .from("race_results")
        .select("season, round, driver_id, constructor_id, points")
        .in("season", [season - 1, season]),
      supabase.from("driver_standings").select("driver_id, position").eq("season", season - 1),
      supabase
        .from("constructor_standings")
        .select("constructor_id, position")
        .eq("season", season - 1),
      supabase
        .from("driver_prices")
        .select("driver_id, price")
        .eq("season", season)
        .eq("round", round.round),
      supabase
        .from("constructor_prices")
        .select("constructor_id, price")
        .eq("season", season)
        .eq("round", round.round),
      supabase.from("drivers").select("driver_id, given_name, family_name"),
      supabase.from("constructors").select("constructor_id, name"),
    ]);

  const resultRows = results.data ?? [];
  const seasonRows = resultRows.filter((row) => row.season === season);

  const driverTeams = new Map<string, string>(
    seasonRows.map((row) => [row.driver_id, row.constructor_id]),
  );

  const driverPoints: RoundPoints[] = resultRows.map((row) => ({
    season: row.season,
    round: row.round,
    driverId: row.driver_id,
    points: Number(row.points),
  }));

  const seeds = buildSeedRanks(
    (priorDrivers.data ?? []).map((row) => ({
      driverId: row.driver_id,
      position: row.position,
    })),
    (priorConstructors.data ?? []).map((row) => ({
      constructorId: row.constructor_id,
      position: row.position,
    })),
    driverTeams,
  );

  const form = rollingWindowPoints(driverPoints, {
    season: round.season,
    round: round.round,
  });

  const driverIds = [...driverTeams.keys()];

  return {
    season: round.season,
    round: round.round,
    raceName: round.race_name,
    tiers: assignTiers(driverIds, form, seeds),
    driverPrices: new Map(
      (prices.data ?? []).map((row) => [row.driver_id, Number(row.price)]),
    ),
    constructorPrices: new Map(
      (constructorPrices.data ?? []).map((row) => [row.constructor_id, Number(row.price)]),
    ),
    driverNames: new Map(
      (drivers.data ?? []).map((row) => [
        row.driver_id,
        `${row.given_name} ${row.family_name}`,
      ]),
    ),
    driverTeams,
    constructorNames: new Map(
      (constructors.data ?? []).map((row) => [row.constructor_id, row.name]),
    ),
  };
}
