import type { SupabaseClient } from "@supabase/supabase-js";

import { getDrivers, getRaceSessions } from "./openf1/client";

/**
 * Driver portraits and team colours.
 *
 * OpenF1 carries both on its session driver list; jolpica carries neither. They
 * are stored rather than fetched at render time because a page load must not
 * depend on an API limited to 30 requests a minute.
 *
 * Keyed by car number, which is the only identifier the two sources share, so
 * this resolves numbers to jolpica driver ids via the season's race results.
 */

export interface DriverMediaReport {
  season: number;
  sessionKey: number | null;
  matched: number;
  unmatched: number[];
}

export async function ingestDriverMedia(
  supabase: SupabaseClient,
  season: number,
): Promise<DriverMediaReport> {
  // The most recent race of the season carries the current line-up, so a
  // mid-season replacement gets their own portrait rather than inheriting one.
  const sessions = await getRaceSessions(season);
  const latest = [...sessions].sort((a, b) =>
    a.date_start < b.date_start ? 1 : -1,
  )[0];

  if (!latest) return { season, sessionKey: null, matched: 0, unmatched: [] };

  const openF1Drivers = await getDrivers(latest.session_key);

  const { data: results } = await supabase
    .from("race_results")
    .select("driver_id, driver_number")
    .eq("season", season);

  // A driver may appear across several rounds; any row gives the same mapping.
  const driverByNumber = new Map<number, string>();
  for (const row of results ?? []) {
    driverByNumber.set(row.driver_number, row.driver_id);
  }

  const unmatched: number[] = [];
  let matched = 0;

  for (const entry of openF1Drivers) {
    const driverId = driverByNumber.get(entry.driver_number);
    if (!driverId) {
      // A driver who appears in OpenF1 but never started a race we ingested.
      unmatched.push(entry.driver_number);
      continue;
    }

    const { error } = await supabase
      .from("drivers")
      .update({
        headshot_url: entry.headshot_url ?? null,
        team_colour: entry.team_colour ?? null,
      })
      .eq("driver_id", driverId);

    if (!error) matched++;
  }

  return { season, sessionKey: latest.session_key, matched, unmatched };
}
