import { createAdminClient } from "../supabase/admin";

/**
 * Read queries for ingested F1 data.
 *
 * Server-only: these use the service-role client, so they must be called from
 * Server Components or route handlers, never from client code. Reference data
 * carries no per-user rows, so there is nothing here that row-level security
 * would need to filter — the game tables, when they exist, will be different.
 */

export interface RoundRef {
  season: number;
  round: number;
  raceName: string;
  country: string;
  locality: string;
  raceDate: string;
}

export interface ResultRow {
  position: number | null;
  driverName: string;
  constructorId: string;
  gridPosition: number;
  points: number;
  classification: string;
  status: string;
  /** Positions made up from the grid; negative means places lost. */
  gained: number | null;
}

export interface StandingRow {
  position: number | null;
  driverName: string;
  constructorId: string;
  points: number;
  wins: number;
}

/**
 * Facts backing the bet markets, for one race.
 *
 * `lapOneLeader` is absent by design: lap timings are not currently ingested,
 * so that market has no stored data yet.
 */
export interface RaceFacts {
  poleSitter: string | null;
  fastestPitStop: { driverName: string; seconds: number } | null;
  safetyCar: { deployed: boolean; events: number };
  topOvertakers: { driverName: string; count: number }[];
  overtakeTotals: { onTrack: number; raw: number };
}

function fullName(driver: { given_name: string; family_name: string } | null): string {
  return driver ? `${driver.given_name} ${driver.family_name}` : "Unknown";
}

export async function getLatestRound(): Promise<RoundRef | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("rounds")
    .select("season, round, race_name, country, locality, race_date")
    .order("season", { ascending: false })
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    season: data.season,
    round: data.round,
    raceName: data.race_name,
    country: data.country,
    locality: data.locality,
    raceDate: data.race_date,
  };
}

export async function getCoverage(): Promise<{ season: number; rounds: number }[]> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("rounds").select("season");
  if (!data) return [];

  const bySeason = new Map<number, number>();
  for (const row of data) {
    bySeason.set(row.season, (bySeason.get(row.season) ?? 0) + 1);
  }
  return [...bySeason.entries()]
    .map(([season, rounds]) => ({ season, rounds }))
    .sort((a, b) => b.season - a.season);
}

export async function getResults(season: number, round: number): Promise<ResultRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("race_results")
    .select("position, constructor_id, grid_position, points, classification, status, drivers(given_name, family_name)")
    .eq("season", season)
    .eq("round", round)
    .order("position", { ascending: true, nullsFirst: false });

  if (!data) return [];

  return data.map((row) => {
    const driver = row.drivers as unknown as {
      given_name: string;
      family_name: string;
    } | null;
    return {
      position: row.position,
      driverName: fullName(driver),
      constructorId: row.constructor_id,
      gridPosition: row.grid_position,
      points: Number(row.points),
      classification: row.classification,
      status: row.status,
      // A pit-lane start is recorded as grid 0, which would otherwise read as
      // an enormous gain.
      gained:
        row.position !== null && row.grid_position > 0
          ? row.grid_position - row.position
          : null,
    };
  });
}

export async function getStandings(season: number, round: number): Promise<StandingRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("driver_standings")
    .select("position, points, wins, constructor_id, drivers(given_name, family_name)")
    .eq("season", season)
    .eq("round", round)
    .order("position", { ascending: true, nullsFirst: false });

  if (!data) return [];

  return data.map((row) => ({
    position: row.position,
    driverName: fullName(
      row.drivers as unknown as { given_name: string; family_name: string } | null,
    ),
    constructorId: row.constructor_id,
    points: Number(row.points),
    wins: row.wins,
  }));
}

export async function getRaceFacts(season: number, round: number): Promise<RaceFacts> {
  const supabase = createAdminClient();

  const [pole, pits, safetyCar, overtakes, results] = await Promise.all([
    supabase
      .from("qualifying_results")
      .select("drivers(given_name, family_name)")
      .eq("season", season)
      .eq("round", round)
      .eq("position", 1)
      .maybeSingle(),
    supabase
      .from("pit_stops")
      .select("pit_lane_seconds, drivers(given_name, family_name)")
      .eq("season", season)
      .eq("round", round)
      .order("pit_lane_seconds", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("safety_car_events")
      .select("message")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("overtakes")
      .select("overtaking_driver_number, on_track")
      .eq("season", season)
      .eq("round", round),
    supabase
      .from("race_results")
      .select("driver_number, drivers(given_name, family_name)")
      .eq("season", season)
      .eq("round", round),
  ]);

  const nameByNumber = new Map<number, string>();
  for (const row of results.data ?? []) {
    nameByNumber.set(
      row.driver_number,
      fullName(row.drivers as unknown as { given_name: string; family_name: string } | null),
    );
  }

  const counts = new Map<number, number>();
  let onTrack = 0;
  for (const row of overtakes.data ?? []) {
    if (!row.on_track) continue;
    onTrack++;
    counts.set(
      row.overtaking_driver_number,
      (counts.get(row.overtaking_driver_number) ?? 0) + 1,
    );
  }

  const pitDriver = pits.data?.drivers as unknown as {
    given_name: string;
    family_name: string;
  } | null;

  return {
    poleSitter: pole.data
      ? fullName(
          pole.data.drivers as unknown as { given_name: string; family_name: string } | null,
        )
      : null,
    fastestPitStop: pits.data
      ? { driverName: fullName(pitDriver), seconds: Number(pits.data.pit_lane_seconds) }
      : null,
    safetyCar: {
      deployed: (safetyCar.data ?? []).some((event) => /DEPLOYED/i.test(event.message)),
      events: (safetyCar.data ?? []).length,
    },
    topOvertakers: [...counts.entries()]
      .map(([number, count]) => ({
        driverName: nameByNumber.get(number) ?? `#${number}`,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    overtakeTotals: { onTrack, raw: (overtakes.data ?? []).length },
  };
}
