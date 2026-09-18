import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which part of a race weekend is happening right now.
 *
 * The league page is built around the round a member can still act on, which
 * `currentRound` defines as the next one whose qualifying has not started. That
 * is the right answer for picking a team and the wrong one for watching: the
 * moment qualifying begins, the weekend everyone is actually following stops
 * being "current" and the page moves on to a race a fortnight away — taking
 * the locked rosters and the open bets with it.
 *
 * So a weekend has two lives. Until qualifying it is the deadline; from
 * qualifying until the points land it is the event. This decides which of the
 * latter it is in.
 *
 * Session lengths are assumed rather than known. The calendar carries a
 * qualifying time and a race time and nothing else — no end times, no
 * practice — so the windows below are the published format's nominal lengths
 * with room for a delay. Being generous is the safe direction: a red dot that
 * lingers a few minutes after the chequered flag is a smaller lie than one
 * that goes out while cars are still running.
 */

/** Qualifying is an hour of running; the extra quarter covers a red flag. */
export const QUALIFYING_WINDOW_MS = 75 * 60_000;

/**
 * A grand prix is capped at two hours of racing and three hours in total
 * including suspensions, which is the figure worth assuming — the alternative
 * is calling a red-flagged race finished while it is stopped.
 */
export const RACE_WINDOW_MS = 180 * 60_000;

export type EventPhase =
  /** Qualifying is running. Rosters have locked, bets are still open. */
  | "qualifying"
  /** Between qualifying and the race — the gap is a day on most weekends. */
  | "waiting"
  /** The race is running. Everything is decided and nothing can be changed. */
  | "race"
  /** Run, but not yet scored: results have to be ingested before points move. */
  | "settling";

export interface EventStatus {
  phase: EventPhase;
  /** Whether a session is on track, which is the only thing the dot claims. */
  live: boolean;
}

/**
 * The phase of one round, or null when its weekend has not started.
 *
 * Null is the "not yet" answer, not an error: before qualifying the round is
 * the next race rather than the current event, and the deadline card already
 * owns it. Rendering both would put the same grand prix on screen twice.
 */
export function eventStatus({
  qualifyingAt,
  raceAt,
  now,
}: {
  /** ISO instants, either of which the calendar may be missing. */
  qualifyingAt: string | null;
  raceAt: string | null;
  now: Date;
}): EventStatus | null {
  const quali = qualifyingAt ? new Date(qualifyingAt) : null;
  const race = raceAt ? new Date(raceAt) : null;

  // An older round can have a race date and no session times. It still has a
  // start, so it can still be watched; it just has no qualifying to report.
  const opens = quali ?? race;
  if (!opens) return null;
  if (now < opens) return null;

  if (quali && now >= quali && now.getTime() - quali.getTime() < QUALIFYING_WINDOW_MS) {
    return { phase: "qualifying", live: true };
  }

  if (race) {
    if (now < race) return { phase: "waiting", live: false };
    if (now.getTime() - race.getTime() < RACE_WINDOW_MS) return { phase: "race", live: true };
    return { phase: "settling", live: false };
  }

  return { phase: "settling", live: false };
}

export interface CurrentEvent {
  round: number;
  raceName: string;
  /** ISO instants, carried through so the card can tick its own clock. */
  qualifyingAt: string | null;
  raceAt: string | null;
  status: EventStatus;
}

/**
 * The round whose weekend is under way, if one is.
 *
 * The most recent round whose qualifying has started — which is the round
 * `currentRound` has just stopped returning, since that looks for the next one
 * a member can still act on. Between them the two cover the season with no gap
 * and no overlap.
 *
 * A round with no published qualifying time is not a candidate. Not knowing
 * when a weekend starts is not the same as it having started, and the sessions
 * are the whole of what the card reports.
 *
 * The clock is read here rather than in the page, so that no component reads it
 * during render — which the compiler rightly treats as impurity.
 */
export async function loadCurrentEvent(
  supabase: SupabaseClient,
  season: number,
): Promise<CurrentEvent | null> {
  const now = new Date();

  const { data } = await supabase
    .from("rounds")
    .select("round, race_name, qualifying_at, race_date, race_time")
    .eq("season", season)
    .lte("qualifying_at", now.toISOString())
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // race_time is nullable on rounds the calendar has not fully published.
  const raceAt = data.race_date
    ? new Date(`${data.race_date}T${data.race_time ?? "00:00:00"}Z`).toISOString()
    : null;

  const status = eventStatus({ qualifyingAt: data.qualifying_at, raceAt, now });
  if (!status) return null;

  return {
    round: data.round,
    raceName: data.race_name,
    qualifyingAt: data.qualifying_at,
    raceAt,
    status,
  };
}

/**
 * A round reduced to the two instants that place it on a clock.
 *
 * Structural rather than one of the event types, so both the weekend on track
 * and the one being prepared for satisfy it without either having to know about
 * the other.
 */
export interface RoundAnchor {
  round: number;
  qualifyingAt: string | null;
  raceAt: string | null;
}

/**
 * Which of the two rounds the hub should open on.
 *
 * It used to always open on the weekend on track, on the reasoning that the
 * race being watched beats the race being prepared for. That holds for about a
 * day. A fortnight later the "current" event is a race nobody has thought about
 * since Sunday evening, and the round everyone is actually picking a team for
 * is behind an arrow.
 *
 * So the two are compared on distance instead: whichever instant is nearer to
 * now is the one worth opening on. In practice that keeps the finished race
 * through the week after it and hands the card to the next one somewhere around
 * the midpoint between them — which is also when the conversation changes.
 *
 * A weekend still running is never given up, whatever the arithmetic says. The
 * gap between qualifying and the race is a day, and a page that jumped to the
 * next grand prix while cars were on the grid would be wrong in the one moment
 * it matters most.
 *
 * The clock defaults to now so that callers — server components, all of them —
 * do not have to read it during render, and tests can pin it.
 */
export function openingRound({
  current,
  upcoming,
  now = new Date(),
}: {
  /** The weekend on track, with the phase that says whether it has finished. */
  current: (RoundAnchor & { status?: EventStatus | null }) | null;
  /** The round nobody has raced yet, when there is one left in the season. */
  upcoming: RoundAnchor | null;
  now?: Date;
}): number | undefined {
  if (!upcoming) return current?.round;
  if (!current) return upcoming.round;

  if (current.status && current.status.phase !== "settling") return current.round;

  // An older round can carry a race date and no session times, so neither
  // anchor is guaranteed. Missing one is not a reason to move: the round on
  // track is the safe answer, and the arrow is still there.
  const behind = current.raceAt ?? current.qualifyingAt;
  const ahead = upcoming.qualifyingAt ?? upcoming.raceAt;
  if (!ahead) return current.round;
  if (!behind) return upcoming.round;

  const since = Math.abs(now.getTime() - new Date(behind).getTime());
  const until = Math.abs(new Date(ahead).getTime() - now.getTime());

  return until < since ? upcoming.round : current.round;
}

/**
 * How long until an instant, in the coarsest terms that stay useful.
 *
 * Null once the instant has passed, which is the caller's cue to stop saying
 * "in" anything — a countdown that runs negative reads as a bug, and the phase
 * headings already own what happens next.
 *
 * The card ticks every thirty seconds, so nothing finer than a minute would
 * survive to be read.
 */
export function timeUntil(iso: string | null, now: Date): string | null {
  if (!iso) return null;

  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return null;

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const spare = minutes % 60;
    return spare ? `${hours}h ${spare}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const spare = hours % 24;
  return spare ? `${days}d ${spare}h` : `${days}d`;
}
