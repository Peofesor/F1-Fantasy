import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketId } from "./betting";
import { ODDS_WINDOW_RACES, type MarketRecord } from "./bet-odds";

/**
 * How often each selection has produced each market's outcome.
 *
 * Read from ingested results rather than kept as a running counter, so a
 * corrected result changes the price the same way it changes the score.
 *
 * Only the last ten race weekends count. A flat two-season tally priced a
 * driver on a career rather than on form: Antonelli made the points in 11 of 13
 * rounds in 2026 and 14 of 24 as a rookie the year before, and the combined 68%
 * offered odds on a driver who no longer exists.
 *
 * A window rather than a decay curve, because a player can check a window. Ten
 * races is a results page they can scroll.
 *
 * A market absent from here falls back to its listed price — the same number
 * for every selection — which is a hole rather than a default: "beats teammate"
 * paid 1.8 on Alonso against Stroll as readily as on the reverse. Every
 * settleable market is built here for that reason.
 */
export type MarketHistory = Map<MarketId, Map<string, MarketRecord>>;

interface Attempt {
  selection: string;
  won: boolean;
}

/** What PostgREST will return in one response, whatever the query asks for. */
const PAGE_SIZE = 1000;

export async function loadMarketHistory(
  supabase: SupabaseClient,
  season: number,
): Promise<MarketHistory> {
  const seasons = [season - 1, season];

  // The calendar is read first so every other query can be narrowed to the
  // window. A response holds at most a thousand rows, and two seasons of
  // overtakes run to several thousand, so an unbounded query silently returned
  // the oldest thousand — exactly the races the window excludes. "Most
  // overtakes" ended up with no history at all, priced at its listed odds for
  // everyone.
  const { data: calendar } = await supabase
    .from("rounds")
    .select("season, round")
    .in("season", seasons)
    .order("season")
    .order("round");

  // Race weekends in order, so "how many races ago" is a position in that list
  // rather than a difference between round numbers that reset each season.
  const order = new Map<string, number>();
  (calendar ?? []).forEach((row, index) => order.set(`${row.season}:${row.round}`, index));

  // Measured from the last round that actually ran, not the last one on the
  // calendar: counting from a race still months away would push real results
  // out of a window they belong in.
  const { data: lastRace } = await supabase
    .from("race_results")
    .select("season, round")
    .in("season", seasons)
    .order("season", { ascending: false })
    .order("round", { ascending: false })
    .limit(1);

  const lastRun = lastRace?.[0];
  // Nothing raced in either season; every market keeps its listed price.
  if (!lastRun) return new Map();

  const latest = order.get(`${lastRun.season}:${lastRun.round}`) ?? 0;
  const earliest = Math.max(0, latest - ODDS_WINDOW_RACES + 1);

  const windowKeys = new Set(
    (calendar ?? [])
      .filter((row) => {
        const index = order.get(`${row.season}:${row.round}`);
        return index !== undefined && index >= earliest && index <= latest;
      })
      .map((row) => `${row.season}:${row.round}`),
  );

  if (windowKeys.size === 0) return new Map();

  // Round numbers repeat across seasons, so filtering on both lists still
  // admits a pair the window does not contain — round 3 of last season when
  // only round 3 of this one is in it. Every row is checked again for that.
  const windowSeasons = [...new Set([...windowKeys].map((key) => Number(key.split(":")[0])))];
  const windowRounds = [...new Set([...windowKeys].map((key) => Number(key.split(":")[1])))];
  const inWindow = (row: { season: number; round: number }) =>
    windowKeys.has(`${row.season}:${row.round}`);

  const scoped = (table: string, columns: string) =>
    supabase.from(table).select(columns).in("season", windowSeasons).in("round", windowRounds);

  const [races, quali, sprints, safetyCars, pitStops, driverRows] = await Promise.all([
    scoped(
      "race_results",
      "season, round, driver_id, constructor_id, driver_number, position, classification, fastest_lap_rank",
    ),
    scoped("qualifying_results", "season, round, driver_id, position, highest_session_reached"),
    scoped("sprint_results", "season, round, driver_id, position"),
    scoped("safety_car_events", "season, round"),
    scoped("pit_stops", "season, round, driver_id, pit_lane_seconds"),
    supabase.from("drivers").select("driver_id, nationality"),
  ]);

  // Ten races of overtakes are still more than one response holds — a race
  // produces upwards of a hundred — so this one is paged as well as scoped.
  const overtakeRows: { season: number; round: number; overtaking_driver_number: number }[] = [];
  for (let page = 0; ; page += 1) {
    const { data } = await supabase
      .from("overtakes")
      .select("season, round, overtaking_driver_number")
      .in("season", windowSeasons)
      .in("round", windowRounds)
      .eq("on_track", true)
      .order("season")
      .order("round")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (!data || data.length === 0) break;
    overtakeRows.push(...(data as typeof overtakeRows));
    if (data.length < PAGE_SIZE) break;
  }

  const attempts: Partial<Record<MarketId, Attempt[]>> = {};
  const push = (market: MarketId, attempt: Attempt) => {
    (attempts[market] ??= []).push(attempt);
  };

  const raceRows = ((races.data ?? []) as unknown as RaceRow[]).filter(inWindow);
  const qualiRows = ((quali.data ?? []) as unknown as QualiRow[]).filter(inWindow);

  for (const row of raceRows) {
    const at = { selection: row.driver_id };
    const position = row.position;
    const classified = row.classification === "finished" || row.classification === "classified";

    push("race_winner", { ...at, won: position === 1 });
    push("podium", { ...at, won: position !== null && position <= 3 });
    push("top_six", { ...at, won: position !== null && position <= 6 });
    push("top_ten", { ...at, won: position !== null && position <= 10 });
    push("fastest_lap", { ...at, won: row.fastest_lap_rank === 1 });
    push("dnf", { ...at, won: !classified });
  }

  for (const row of qualiRows) {
    const reached = row.highest_session_reached;
    push("reached_q3", { selection: row.driver_id, won: reached === "Q3" });
    push("reached_q2", { selection: row.driver_id, won: reached === "Q2" || reached === "Q3" });
    push("eliminated_q1", { selection: row.driver_id, won: reached === "Q1" });
  }

  for (const row of ((sprints.data ?? []) as unknown as SprintRow[]).filter(inWindow)) {
    push("sprint_winner", { selection: row.driver_id, won: row.position === 1 });
    push("sprint_points", {
      selection: row.driver_id,
      won: row.position !== null && row.position <= 8,
    });
  }

  // --- grouped by weekend, for the markets that need a whole race ---------
  const raceByRound = new Map<string, RaceRow[]>();
  for (const row of raceRows) {
    const key = `${row.season}:${row.round}`;
    raceByRound.set(key, [...(raceByRound.get(key) ?? []), row]);
  }

  const qualiByRound = new Map<string, Map<string, number | null>>();
  for (const row of qualiRows) {
    const key = `${row.season}:${row.round}`;
    const forRound = qualiByRound.get(key) ?? new Map<string, number | null>();
    forRound.set(row.driver_id, row.position);
    qualiByRound.set(key, forRound);
  }

  // --- teammate head-to-heads --------------------------------------------
  //
  // A driver only attempts this in rounds where their teammate also started:
  // counting a weekend the other car missed would credit a walkover.

  // A car that did not finish is behind one that did, whatever the numbers say.
  const rank = (position: number | null) => (position === null ? Infinity : position);

  for (const [key, rows] of raceByRound) {
    const byTeam = new Map<string, RaceRow[]>();
    for (const row of rows) {
      byTeam.set(row.constructor_id, [...(byTeam.get(row.constructor_id) ?? []), row]);
    }

    for (const pair of byTeam.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;

      push("beats_teammate_race", {
        selection: a.driver_id,
        won: rank(a.position) < rank(b.position),
      });
      push("beats_teammate_race", {
        selection: b.driver_id,
        won: rank(b.position) < rank(a.position),
      });

      const grid = qualiByRound.get(key);
      const aQuali = grid?.get(a.driver_id) ?? null;
      const bQuali = grid?.get(b.driver_id) ?? null;
      // Neither is credited when only one of them set a time: no contest.
      if (aQuali === null || bQuali === null) continue;

      push("beats_teammate_qualifying", { selection: a.driver_id, won: aQuali < bQuali });
      push("beats_teammate_qualifying", { selection: b.driver_id, won: bQuali < aQuali });
    }
  }

  // --- most overtakes, per race ------------------------------------------
  const passesByRound = new Map<string, Map<number, number>>();
  for (const row of overtakeRows.filter(inWindow)) {
    const key = `${row.season}:${row.round}`;
    const counts = passesByRound.get(key) ?? new Map<number, number>();
    counts.set(row.overtaking_driver_number, (counts.get(row.overtaking_driver_number) ?? 0) + 1);
    passesByRound.set(key, counts);
  }

  for (const [key, rows] of raceByRound) {
    const counts = passesByRound.get(key);
    if (!counts || counts.size === 0) continue;

    const best = Math.max(...counts.values());
    for (const row of rows) {
      push("most_overtakes", {
        selection: row.driver_id,
        won: (counts.get(row.driver_number) ?? 0) === best,
      });
    }
  }

  // --- fastest pit stop, by constructor -----------------------------------
  const teamOf = new Map(
    raceRows.map((row) => [`${row.season}:${row.round}:${row.driver_id}`, row.constructor_id]),
  );
  const stopsByRound = new Map<string, Map<string, number>>();

  for (const row of ((pitStops.data ?? []) as unknown as PitStopRow[]).filter(inWindow)) {
    const duration = Number(row.pit_lane_seconds);
    if (!Number.isFinite(duration)) continue;
    const key = `${row.season}:${row.round}`;
    const team = teamOf.get(`${key}:${row.driver_id}`);
    if (!team) continue;

    const best = stopsByRound.get(key) ?? new Map<string, number>();
    const current = best.get(team);
    if (current === undefined || duration < current) best.set(team, duration);
    stopsByRound.set(key, best);
  }

  for (const teams of stopsByRound.values()) {
    if (teams.size === 0) continue;
    const quickest = Math.min(...teams.values());
    for (const [team, time] of teams) {
      push("fastest_pit_stop", { selection: team, won: time === quickest });
    }
  }

  // --- winner's nationality -----------------------------------------------
  const nationality = new Map(
    ((driverRows.data ?? []) as unknown as { driver_id: string; nationality: string | null }[]).map(
      (row) => [row.driver_id, row.nationality ?? ""],
    ),
  );
  const allNationalities = [...new Set(nationality.values())].filter(Boolean);

  for (const rows of raceByRound.values()) {
    const winner = rows.find((row) => row.position === 1);
    if (!winner) continue;
    const won = nationality.get(winner.driver_id);

    // Every nationality on the grid gets an attempt, or the ones that never win
    // would have no record and fall back to the listed price.
    for (const country of allNationalities) {
      push("winner_nationality", { selection: country, won: country === won });
    }
  }

  // --- safety car, a yes/no on the race -----------------------------------
  const deployedIn = new Set(
    ((safetyCars.data ?? []) as unknown as { season: number; round: number }[])
      .filter(inWindow)
      .map((row) => `${row.season}:${row.round}`),
  );

  for (const key of raceByRound.keys()) {
    const deployed = deployedIn.has(key);
    push("safety_car", { selection: "yes", won: deployed });
    push("safety_car", { selection: "no", won: !deployed });
  }

  const history: MarketHistory = new Map();
  for (const [market, list] of Object.entries(attempts) as [MarketId, Attempt[]][]) {
    const bySelection = new Map<string, MarketRecord>();
    for (const attempt of list) {
      const current = bySelection.get(attempt.selection) ?? { won: 0, total: 0 };
      current.total += 1;
      if (attempt.won) current.won += 1;
      bySelection.set(attempt.selection, current);
    }
    history.set(market, bySelection);
  }

  return history;
}

interface RaceRow {
  season: number;
  round: number;
  driver_id: string;
  constructor_id: string;
  driver_number: number;
  position: number | null;
  classification: string | null;
  fastest_lap_rank: number | null;
}

interface QualiRow {
  season: number;
  round: number;
  driver_id: string;
  position: number | null;
  highest_session_reached: string | null;
}

interface SprintRow {
  season: number;
  round: number;
  driver_id: string;
  position: number | null;
}

interface PitStopRow {
  season: number;
  round: number;
  driver_id: string;
  pit_lane_seconds: number | string | null;
}
