"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { eventStatus, type EventPhase, type EventStatus } from "@/lib/f1/event-status";
import { BetSlipList, type RoundBet } from "./bet-slip-list";
import { MatchupGrid, type Side } from "./matchup-grid";

export interface BrowsableEvent {
  round: number;
  raceName: string;
  /** ISO instants; either can be missing from the calendar. */
  qualifyingAt: string | null;
  raceAt: string | null;
  /** Points are in, so this weekend is history rather than in progress. */
  scored: boolean;
  /**
   * The phase as the server saw it, or null once the round is scored. Rendered
   * until the clock arrives on mount, so the first paint never has to guess —
   * a guessed phase would flash a red dot on a race that finished a fortnight
   * ago.
   */
  status: EventStatus | null;
  /**
   * The squads to compare, yours first. Two on a drawn round, one when there
   * was nobody to face, and none when there is nothing to show at all.
   */
  sides: Side[];
  /** Whether the round had fixtures at all, which tells a bye from no draw. */
  drawn: boolean;
  bets: RoundBet[];
  /**
   * The round nobody has raced yet — the one the deadline counts down to. It
   * sits one step to the right of the weekend on track, and what it shows is
   * whatever the lock allows: a squad that is still secret says so, and bets
   * that cannot be read are counted rather than listed.
   */
  upcoming?: boolean;
  /**
   * Bets that exist but cannot be read yet, counted per member. Without it the
   * round says nobody has bet when what it means is that nobody's bets are
   * readable — opposite claims, and the wrong one invites a shrug.
   */
  hiddenBets?: { name: string; count: number }[];
}

const HEADING: Record<EventPhase, string> = {
  qualifying: "Qualifying under way",
  waiting: "Qualifying done",
  race: "Race under way",
  settling: "Race finished",
};

const NOTE: Record<EventPhase, string> = {
  qualifying: "Rosters are locked. Bets stay open until the race starts.",
  waiting: "Bets close when the race starts.",
  race: "Bets closed at the start. Nothing left to do but watch.",
  settling: "Points and settled bets land once the results are ingested.",
};

/**
 * The races that have been run, the one being run, and the one to come.
 *
 * The rest of the hub looks forward: the deadline card counts down to the next
 * race, the matchup names the fixture to come. All of it moves on the instant
 * qualifying starts — which is the instant the current weekend gets
 * interesting. For two days the league page had nothing to say about the grand
 * prix everyone was watching, and the teams and bets riding on it were
 * reachable only through each member's profile.
 *
 * So this holds the other direction. It opens on the weekend in progress and
 * steps back through the season one race at a time: both squads with their
 * scores, and every bet the league placed. Nothing on those rounds is a secret
 * by the time it is shown — each of them has locked.
 *
 * One step to the right of the weekend on track is the round being prepared
 * for: the fixture you have been drawn, the squads as far as they can be
 * revealed, and what the league has staked so far. It lives here rather than
 * in cards of its own because a round is one thing, and reading it meant
 * scrolling past three headings that each named the same grand prix.
 *
 * Every round is sent with the page rather than fetched per choice. A season is
 * a couple of dozen small squads, so the arrows are instant and cost nothing.
 *
 * The phase of the live round arrives from the server and is then recomputed on
 * a ticking clock, so a session that starts or ends while the page is open is
 * reflected without a reload.
 */
export function EventBrowser({
  leagueId,
  events,
  initialRound,
  duel,
}: {
  leagueId: string;
  /** Ascending by round. The newest is the one worth opening on. */
  events: BrowsableEvent[];
  initialRound: number;
  /**
   * Whether the league plays head to head. A free-for-all has no fixture to
   * show, and telling those players their round was undrawn would send them
   * chasing a schedule that is not part of their game.
   */
  duel: boolean;
}) {
  const [round, setRound] = useState(initialRound);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // The clock is the external thing this follows. The first reading is
    // scheduled rather than taken inline so the server's HTML is never
    // contradicted mid-hydration.
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const index = Math.max(
    0,
    events.findIndex((event) => event.round === round),
  );
  const event = events[index];
  if (!event) return null;

  const older = events[index - 1];
  const newer = events[index + 1];

  // A scored round is finished whatever the clock says, and saying "race
  // finished, points to come" about a weekend already in the standings would be
  // a fortnight out of date.
  //
  // The round still being prepared for is left out of the clock entirely: its
  // squads and bets were sent hidden, so a page left open until qualifying
  // would start claiming a session was live beside a card that still says the
  // teams are secret. A reload is what reveals them, and a reload is what moves
  // the round out of `upcoming`.
  const status =
    event.upcoming || event.scored || !now
      ? event.status
      : eventStatus({ qualifyingAt: event.qualifyingAt, raceAt: event.raceAt, now });

  const hidden = event.hiddenBets ?? [];
  const hiddenTotal = hidden.reduce((total, entry) => total + entry.count, 0);
  const staked = event.bets.reduce((total, bet) => total + bet.stake, 0);
  const result = event.sides[0]?.duelPoints;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_18%,var(--background))] dark:border-zinc-800">
      <div className="flex items-stretch gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
        {/* Triangles rather than words, because the label is the race name in
            the middle and two of those would be read as the choice itself. */}
        <Arrow
          direction="left"
          label={older ? `Back to round ${older.round}` : "No earlier round"}
          onClick={older ? () => setRound(older.round) : undefined}
        />

        <div className="min-w-0 flex-1 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {status?.live ? (
              <>
                {/* The one red dot on the page, and it means exactly one
                    thing: a session is on track right now. */}
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-red-600 dark:text-red-400">Live now</span>
              </>
            ) : event.upcoming ? (
              `Next up · Round ${event.round}`
            ) : (
              `Round ${event.round}`
            )}
          </p>

          <h2 className="truncate text-base font-semibold">{event.raceName}</h2>

          <p className="text-xs text-zinc-500">
            {event.upcoming ? (
              "Rosters lock when qualifying starts. Bets stay open until the race."
            ) : status ? (
              <>
                {HEADING[status.phase]} · {NOTE[status.phase]}
              </>
            ) : result === 1 ? (
              "You won this one."
            ) : result === 0 ? (
              "You lost this one."
            ) : result === 0.5 ? (
              "A draw."
            ) : (
              "Scored."
            )}
          </p>
        </div>

        <Arrow
          direction="right"
          label={newer ? `On to round ${newer.round}` : "No later round"}
          onClick={newer ? () => setRound(newer.round) : undefined}
        />
      </div>

      {/* The fixture is named before the squads on the round to come, because
          that is the question the browser is being stepped right to answer:
          who you are drawn against next. On a round already run the scores in
          the grid say it. */}
      {event.upcoming && duel && event.sides.length > 1 && (
        <p className="px-3 pt-2.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Next matchup · {event.sides[0].name} v {event.sides[1].name}
        </p>
      )}

      {event.sides.length > 0 ? (
        <MatchupGrid leagueId={leagueId} sides={event.sides} />
      ) : (
        <p className="px-4 py-3 text-xs text-zinc-500">
          {duel && event.drawn
            ? event.upcoming
              ? "You have a bye this round. Any points you score still count toward the season."
              : "You had a bye this round. Any points you scored still counted toward the season."
            : event.upcoming
              ? "You have not picked a team for this round yet."
              : "You had no team this round."}
        </p>
      )}

      {/* A bye and an undrawn schedule look identical from here — no opponent —
          but only one of them is something to act on. With an odd number of
          members somebody sits out every round, and telling that player the
          owner needs to draw fixtures would send them chasing a problem that
          does not exist. */}
      {event.upcoming && duel && event.sides.length === 1 && (
        <p className="px-4 pb-3 text-xs text-zinc-500">
          {event.drawn
            ? `You have a bye in round ${event.round} — an odd number of members means one sits out each race. Your points still count toward the season total.`
            : `No fixtures drawn for round ${event.round} yet. The league owner can draw them from the schedule panel below.`}
        </p>
      )}

      {event.bets.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between gap-3 border-t border-zinc-200 px-4 pt-2.5 text-xs text-zinc-500 dark:border-zinc-800">
            <span className="font-medium uppercase tracking-wide text-zinc-400">
              {event.scored ? "Settled" : "Riding on it"}
            </span>
            <span className="shrink-0 tabular-nums">
              {event.bets.length} bet{event.bets.length === 1 ? "" : "s"} · {staked.toFixed(1)}{" "}
              staked
            </span>
          </div>
          <BetSlipList leagueId={leagueId} bets={event.bets} />
        </>
      ) : hiddenTotal === 0 ? (
        <p className="border-t border-zinc-200 px-4 py-2.5 text-xs text-zinc-500 dark:border-zinc-800">
          {event.upcoming ? "Nobody has bet on this race yet." : "Nobody bet on this race."}
        </p>
      ) : null}

      {hiddenTotal > 0 && (
        <div className="border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Sealed until qualifying
          </p>
          <ul className="mt-1 space-y-0.5">
            {hidden.map((entry) => (
              <li key={entry.name} className="flex items-baseline gap-2 text-xs text-zinc-500">
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <span className="shrink-0 tabular-nums">
                  {entry.count} bet{entry.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
        <Link
          href={`/leagues/${leagueId}/bets`}
          className="text-xs text-zinc-500 underline-offset-2 hover:underline"
        >
          Every round, every member →
        </Link>
      </div>
    </section>
  );
}

/**
 * One step through the season.
 *
 * Disabled rather than hidden at the ends of the calendar, so the header does
 * not change width when you reach the first race and the arrow you were
 * clicking does not move out from under the cursor.
 */
function Arrow({
  direction,
  label,
  onClick,
}: {
  direction: "left" | "right";
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-lg px-2.5 text-sm text-zinc-500 transition enabled:hover:bg-zinc-100 disabled:opacity-25 dark:enabled:hover:bg-zinc-900"
    >
      {direction === "left" ? "◀" : "▶"}
    </button>
  );
}
