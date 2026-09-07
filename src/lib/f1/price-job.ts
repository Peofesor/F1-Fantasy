import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CONSTRUCTOR_PRICE_BAND,
  DRIVER_PRICE_BAND,
  priceField,
} from "./pricing";
import { rollingWindowPoints, type RoundKey, type RoundPoints } from "./tiers";

/**
 * Price population.
 *
 * `driver_prices(season, round)` holds the price paid when picking *for* that
 * round, so it is derived from form through the round *before* it. A roster is
 * set before the race runs, so a price that depended on the race's own result
 * would be unusable at the moment players need it.
 */

export interface PricedRound extends RoundKey {
  driverPrices: Map<string, number>;
  constructorPrices: Map<string, number>;
}

function isBefore(entry: RoundKey, target: RoundKey): boolean {
  return (
    entry.season < target.season ||
    (entry.season === target.season && entry.round < target.round)
  );
}

/**
 * Prices one round from the results preceding it.
 *
 * Entries at or after the target are excluded entirely, so this cannot leak the
 * outcome of the race being priced. When nothing precedes the target — the very
 * first round in the dataset — every competitor takes the floor price, which is
 * correct in the sense that no form exists to distinguish them.
 */
export function pricesForRound(
  results: readonly RoundPoints[],
  constructorResults: readonly RoundPoints[],
  target: RoundKey,
  driverIds: readonly string[],
  constructorIds: readonly string[],
): PricedRound {
  const priorDriver = results.filter((entry) => isBefore(entry, target));
  const priorConstructor = constructorResults.filter((entry) => isBefore(entry, target));

  const latest = (entries: readonly RoundPoints[]): RoundKey | null =>
    entries.reduce<RoundKey | null>(
      (best, entry) =>
        best === null || !isBefore(entry, best) ? { season: entry.season, round: entry.round } : best,
      null,
    );

  const driverThrough = latest(priorDriver);
  const constructorThrough = latest(priorConstructor);

  const driverForm = driverThrough
    ? rollingWindowPoints(priorDriver, driverThrough)
    : new Map<string, number>();
  const constructorForm = constructorThrough
    ? rollingWindowPoints(priorConstructor, constructorThrough)
    : new Map<string, number>();

  return {
    season: target.season,
    round: target.round,
    driverPrices: priceField(driverIds, driverForm, DRIVER_PRICE_BAND),
    constructorPrices: priceField(constructorIds, constructorForm, CONSTRUCTOR_PRICE_BAND),
  };
}

interface ResultRow {
  season: number;
  round: number;
  driver_id: string;
  constructor_id: string;
  points: number | string;
}

/**
 * Loads every race result once.
 *
 * Pricing a round needs the rounds before it, so backfilling the whole dataset
 * one query per round would re-read almost everything each time. The full set
 * is a couple of thousand rows.
 */
async function loadResults(supabase: SupabaseClient): Promise<ResultRow[]> {
  const rows: ResultRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("race_results")
      .select("season, round, driver_id, constructor_id, points")
      .order("season")
      .order("round")
      .order("driver_id")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Could not read race results: ${error.message}`);
    if (!data?.length) break;

    rows.push(...(data as ResultRow[]));
    if (data.length < pageSize) break;
  }

  return rows;
}

export interface PopulateReport {
  rounds: number;
  driverPrices: number;
  constructorPrices: number;
  floorPricedRounds: RoundKey[];
}

/**
 * Computes and stores prices for every ingested round.
 *
 * Idempotent: prices are upserted on their primary key, so re-running after a
 * results correction simply rewrites them.
 */
export async function populatePrices(
  supabase: SupabaseClient,
  seasons?: readonly number[],
): Promise<PopulateReport> {
  const results = await loadResults(supabase);

  const driverPoints: RoundPoints[] = results.map((row) => ({
    season: row.season,
    round: row.round,
    driverId: row.driver_id,
    points: Number(row.points),
  }));

  // A constructor's round score is its drivers' combined points, matching the
  // real sport. There is no per-round constructor total stored upstream.
  const constructorPoints: RoundPoints[] = results.map((row) => ({
    season: row.season,
    round: row.round,
    driverId: row.constructor_id,
    points: Number(row.points),
  }));

  const { data: roundRows, error } = await supabase
    .from("rounds")
    .select("season, round")
    .order("season")
    .order("round");
  if (error) throw new Error(`Could not read rounds: ${error.message}`);

  const targets = (roundRows ?? []).filter(
    (row) => !seasons || seasons.includes(row.season),
  );

  const report: PopulateReport = {
    rounds: 0,
    driverPrices: 0,
    constructorPrices: 0,
    floorPricedRounds: [],
  };

  for (const target of targets) {
    // Price only competitors active in that season, so a driver who has left
    // the sport does not linger in later price lists.
    const seasonRows = results.filter((row) => row.season === target.season);
    const driverIds = [...new Set(seasonRows.map((row) => row.driver_id))];
    const constructorIds = [...new Set(seasonRows.map((row) => row.constructor_id))];

    const priced = pricesForRound(
      driverPoints,
      constructorPoints,
      target,
      driverIds,
      constructorIds,
    );

    // Every competitor at the floor means no prior form existed — worth
    // surfacing rather than silently storing a flat price list.
    const distinctPrices = new Set(priced.driverPrices.values());
    if (distinctPrices.size <= 1) {
      report.floorPricedRounds.push({ season: target.season, round: target.round });
    }

    const driverRows = [...priced.driverPrices.entries()].map(([driverId, price]) => ({
      season: target.season,
      round: target.round,
      driver_id: driverId,
      price,
    }));
    const constructorRows = [...priced.constructorPrices.entries()].map(
      ([constructorId, price]) => ({
        season: target.season,
        round: target.round,
        constructor_id: constructorId,
        price,
      }),
    );

    const driverWrite = await supabase
      .from("driver_prices")
      .upsert(driverRows, { onConflict: "season,round,driver_id" });
    if (driverWrite.error) {
      throw new Error(
        `Failed to write driver prices for ${target.season} R${target.round}: ${driverWrite.error.message}`,
      );
    }

    const constructorWrite = await supabase
      .from("constructor_prices")
      .upsert(constructorRows, { onConflict: "season,round,constructor_id" });
    if (constructorWrite.error) {
      throw new Error(
        `Failed to write constructor prices for ${target.season} R${target.round}: ${constructorWrite.error.message}`,
      );
    }

    report.rounds++;
    report.driverPrices += driverRows.length;
    report.constructorPrices += constructorRows.length;
  }

  return report;
}
