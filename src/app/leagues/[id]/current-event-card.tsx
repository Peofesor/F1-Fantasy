"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { eventStatus, type EventStatus } from "@/lib/f1/event-status";
import { BetSlipList, type RoundBet } from "./bet-slip-list";

/**
 * The weekend that is happening now.
 *
 * The rest of the hub looks forward: the deadline card counts down to the next
 * race, the bets card lists what has been staked on it, the matchup names the
 * fixture to come. All of it flips over the instant qualifying begins — which
 * is the instant the current weekend gets interesting. For two days the league
 * page had nothing to say about the grand prix everyone was watching, and the
 * bets riding on it were reachable only through each member's profile.
 *
 * So this sits above the next race and holds the event: what session is on
 * track, and what the league has riding on it. Both sides of the round are
 * readable by now, because the lock that hides them has already passed.
 *
 * The phase arrives from the server and is then recomputed on a ticking clock,
 * so a session that starts or ends while the page is open is reflected without
 * a reload. The first client render uses the server's value so the two agree.
 */
export function CurrentEventCard({
  leagueId,
  round,
  raceName,
  qualifyingAt,
  raceAt,
  status,
  bets,
}: {
  leagueId: string;
  round: number;
  raceName: string;
  /** ISO instants; either can be missing from the calendar. */
  qualifyingAt: string | null;
  raceAt: string | null;
  /** The phase as the server saw it, which is what renders until mount. */
  status: EventStatus;
  bets: RoundBet[];
}) {
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

  const current = now ? (eventStatus({ qualifyingAt, raceAt, now }) ?? status) : status;
  const race = raceAt ? new Date(raceAt) : null;

  const heading: Record<EventStatus["phase"], string> = {
    qualifying: "Qualifying under way",
    waiting: "Qualifying done",
    race: "Race under way",
    settling: "Race finished",
  };

  const note: Record<EventStatus["phase"], string> = {
    qualifying: "Rosters are locked. Bets stay open until the race starts.",
    waiting: "Bets close when the race starts.",
    race: "Bets closed at the start. Nothing left to do but watch.",
    settling: "Points and settled bets land once the results are ingested.",
  };

  const staked = bets.reduce((total, bet) => total + bet.stake, 0);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_18%,var(--background))] dark:border-zinc-800">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {current.live ? (
              <>
                {/* The one red dot on the page, and it means exactly one
                    thing: a session is on track right now. */}
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-red-600 dark:text-red-400">Live now</span>
              </>
            ) : (
              "This weekend"
            )}
          </p>
          <span className="shrink-0 text-xs text-zinc-500">Round {round}</span>
        </div>

        <h2 className="mt-0.5 truncate text-base font-semibold">{raceName}</h2>

        <p className="mt-1 text-sm">
          {heading[current.phase]}
          {current.phase === "waiting" && race && now && (
            <span className="text-zinc-500"> · race {countdown(race, now)} away</span>
          )}
        </p>
        <p className="text-xs text-zinc-500">{note[current.phase]}</p>
      </div>

      {bets.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between gap-3 px-4 pt-2.5 text-xs text-zinc-500">
            <span className="font-medium uppercase tracking-wide text-zinc-400">Riding on it</span>
            <span className="shrink-0 tabular-nums">
              {bets.length} bet{bets.length === 1 ? "" : "s"} · {staked.toFixed(1)} staked
            </span>
          </div>
          <BetSlipList leagueId={leagueId} bets={bets} />
        </>
      ) : (
        <p className="px-4 py-2.5 text-xs text-zinc-500">Nobody bet on this race.</p>
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

function countdown(target: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}
