import type { SupabaseClient } from "@supabase/supabase-js";

import { getSeasonSchedule } from "./jolpica/client";
import { sessionInstant } from "./ingest";

/**
 * Calendar ingestion.
 *
 * Results ingestion deliberately refuses a round with no published results, so
 * on its own it can never store a race that has not happened. That left the
 * database holding only past rounds — and a fantasy game where every stored
 * round has already locked has nothing to play.
 *
 * This stores the schedule: race names, dates and qualifying times for the
 * whole season, results or not. Rounds that have run are updated in place by
 * results ingestion afterwards; rounds still to come sit there with their lock
 * deadline set, which is exactly what the roster builder needs.
 */

export interface CalendarReport {
  season: number;
  rounds: number;
  upcoming: number;
  nextRound?: { round: number; raceName: string; qualifyingAt: string | null };
}

export async function ingestCalendar(
  supabase: SupabaseClient,
  season: number,
): Promise<CalendarReport> {
  const pages = await getSeasonSchedule(season);
  const races = pages.flatMap((page) => page.MRData.RaceTable.Races);

  if (races.length === 0) {
    return { season, rounds: 0, upcoming: 0 };
  }

  const rows = races.map((race) => ({
    season,
    round: Number(race.round),
    race_name: race.raceName,
    circuit_id: race.Circuit.circuitId,
    circuit_name: race.Circuit.circuitName,
    country: race.Circuit.Location.country,
    locality: race.Circuit.Location.locality,
    race_date: race.date,
    race_time: race.time ? race.time.replace("Z", "") : null,
    qualifying_at: sessionInstant(race.Qualifying),
    // Known from the schedule, so the sprint markets can be hidden on a weekend
    // that has no sprint instead of being offered and later voided.
    has_sprint: Boolean(race.Sprint),
  }));

  // Upsert without touching openf1_session_key: results ingestion owns that
  // column, and overwriting it here would unlink rounds that are already
  // matched to an OpenF1 session.
  const { error } = await supabase
    .from("rounds")
    .upsert(rows, { onConflict: "season,round" });

  if (error) throw new Error(`Could not write calendar: ${error.message}`);

  const now = Date.now();
  const upcoming = rows.filter(
    (row) => row.qualifying_at && new Date(row.qualifying_at).getTime() > now,
  );
  const next = upcoming.sort((a, b) => a.round - b.round)[0];

  return {
    season,
    rounds: rows.length,
    upcoming: upcoming.length,
    nextRound: next
      ? { round: next.round, raceName: next.race_name, qualifyingAt: next.qualifying_at }
      : undefined,
  };
}
