"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { MemberMonogram } from "./member-monogram";
import { RoundArrow } from "./round-arrow";
import { generateSchedule, type ScheduleState } from "./schedule-actions";

interface Party {
  memberId: string;
  name: string;
  /**
   * Wins, draws and losses so far, or null for a member with no scored round.
   *
   * A fixture is a question about form, and a name on its own does not answer
   * it: "who have I got" and "are they any good" used to be two panels apart.
   */
  record: { wins: number; draws: number; losses: number } | null;
  /** Where they sit in the table, or null before they have a place in it. */
  position: number | null;
}

export interface Fixture {
  round: number;
  home: Party;
  away: Party;
}

/**
 * Who plays whom, one round at a time.
 *
 * This was the whole season as a flat list: a league of six drawn over ten
 * remaining rounds is thirty lines of "R17 peo v kapo", and a phone showed
 * about eight of them. Nobody reads a schedule that way. The question asked of
 * a fixture list is "who have I got next", occasionally "who did I have at
 * Monza", and both of those are about one round.
 *
 * So the round is the unit, and the arrows step through it — the same gesture
 * the event browser uses for the same movement through the season, which is why
 * it is the same control. Each pairing is a card carrying both members with
 * their record and their place in the table, and your own is ringed, so finding
 * yourself in a round does not mean reading six names.
 */
export function SchedulePanel({
  leagueId,
  isOwner,
  fixtures,
  currentRound,
  currentMemberId,
}: {
  leagueId: string;
  isOwner: boolean;
  /** Every fixture of the season, ascending by round. */
  fixtures: Fixture[];
  /**
   * The weekend the rest of the page is on. It decides three things: the round
   * this opens on, the one that is badged, and where the way back leads.
   * Clamped to a round that was actually drawn.
   */
  currentRound?: number;
  /** Whose fixture gets the ring. Absent for someone reading from outside. */
  currentMemberId?: string;
}) {
  const [state, formAction, pending] = useActionState<ScheduleState, FormData>(
    generateSchedule,
    null,
  );

  // Ascending and deduplicated. Rounds rather than an index range: a redraw
  // leaves the raced rounds alone, so the drawn rounds are not guaranteed to be
  // a contiguous run, and an arrow that lands on an empty round is an arrow
  // that wasted a click.
  const rounds = [...new Set(fixtures.map((fixture) => fixture.round))].sort((a, b) => a - b);

  // This week's fixtures: the nearest drawn round at or after the weekend the
  // page is on. The schedule may well have nothing left to say about a race
  // being run right now, and the round worth landing on is then the one after.
  const thisWeek = rounds.find((entry) => entry >= (currentRound ?? 0)) ?? rounds[rounds.length - 1];

  const [round, setRound] = useState(() => thisWeek ?? 0);

  const drawn = fixtures.length > 0;
  const index = Math.max(0, rounds.indexOf(round));
  const showingRound = rounds[index];
  const older = rounds[index - 1];
  const newer = rounds[index + 1];
  const showing = fixtures.filter((fixture) => fixture.round === showingRound);
  const onThisWeek = showingRound === thisWeek;

  /**
   * The draw control, shown to the owner whether or not fixtures exist.
   *
   * It used to disappear once the schedule had been drawn, which quietly
   * excluded everyone who joined afterwards: they had no opponent for the rest
   * of the season and no way for the owner to give them one.
   */
  const control = isOwner && (
    <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <form action={formAction}>
        <input type="hidden" name="leagueId" value={leagueId} />
        <button
          disabled={pending}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-60"
        >
          {pending ? "Drawing…" : drawn ? "Redraw remaining rounds" : "Draw the schedule"}
        </button>
      </form>
      <p className="mt-2 text-xs text-zinc-500">
        {drawn
          ? "Run this after someone joins or leaves. Rounds already raced keep their pairings; everything from the next race onward is drawn again."
          : "Draw it once the first few people have joined — you can redraw later when more arrive."}
      </p>

      {state && "error" in state && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      )}
      {state && "ok" in state && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          {state.fixtures} fixtures drawn.
        </p>
      )}
    </div>
  );

  if (!drawn) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
        <h2 className="text-sm font-semibold">Fixtures</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {isOwner
            ? "No schedule yet, so nobody has an opponent."
            : "The league owner has not drawn the schedule yet."}
        </p>
        {control}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      {/* The heading names the panel and the stepper says which round is in it,
          which is the only choice this card offers. Allowed to wrap, because a
          narrow phone would otherwise squeeze the round number to make room for
          a heading that never changes. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">Fixtures</h2>

        <div className="flex shrink-0 items-center gap-1">
          <RoundArrow
            direction="left"
            label={older ? `Back to round ${older}` : "No earlier round drawn"}
            onClick={older ? () => setRound(older) : undefined}
          />
          <span className="w-[4.5rem] text-center text-sm font-semibold tabular-nums">
            Round {showingRound}
          </span>
          <RoundArrow
            direction="right"
            label={newer ? `On to round ${newer}` : "No later round drawn"}
            onClick={newer ? () => setRound(newer) : undefined}
          />

          {/* One slot, two things, because they are the same fact stated the
              two ways it can be useful: on this week's round it says so, and
              anywhere else it is the way back. A badge that stayed put while a
              separate button appeared beside it would push the arrows about
              every time you stepped off the current round. */}
          {onThisWeek ? (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent-ink)]">
              This week
            </span>
          ) : (
            <button
              type="button"
              onClick={() => thisWeek !== undefined && setRound(thisWeek)}
              className="rounded-full border border-[var(--accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:text-zinc-300"
            >
              This week
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-zinc-500">
        One opponent a race. Rounds already raced are settled and never change.
      </p>

      <ul className="mt-3 space-y-2">
        {showing.map((fixture) => {
          const mine =
            currentMemberId !== undefined &&
            (fixture.home.memberId === currentMemberId ||
              fixture.away.memberId === currentMemberId);

          return (
            <li
              key={`${fixture.round}-${fixture.home.memberId}`}
              className={`flex items-center gap-2 rounded-lg border bg-[color-mix(in_oklab,var(--accent)_8%,var(--background))] p-2 ${
                mine ? "border-[var(--accent)]" : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <PartyLink leagueId={leagueId} party={fixture.home} align="left" />

              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                vs
              </span>

              <PartyLink leagueId={leagueId} party={fixture.away} align="right" />
            </li>
          );
        })}
      </ul>

      {control}
    </section>
  );
}

/**
 * One side of a fixture, reading outward from the vs in the middle.
 *
 * A link rather than a label because the name is the question people have about
 * an opponent they have not played yet, and the profile behind it is the answer.
 */
function PartyLink({
  leagueId,
  party,
  align,
}: {
  leagueId: string;
  party: Party;
  align: "left" | "right";
}) {
  const right = align === "right";

  return (
    <Link
      href={`/leagues/${leagueId}/members/${party.memberId}`}
      className={`flex min-w-0 flex-1 items-center gap-2 ${right ? "flex-row-reverse" : ""}`}
    >
      <MemberMonogram memberId={party.memberId} name={party.name} size={28} />
      <span className={`min-w-0 flex-1 ${right ? "text-right" : ""}`}>
        <span className="block truncate text-sm underline-offset-2 hover:underline">
          {party.name}
        </span>
        <span className="block truncate text-[11px] tabular-nums text-zinc-500">
          {form(party)}
        </span>
      </span>
    </Link>
  );
}

/**
 * A member's season in one line: the record, then the place it has put them.
 *
 * Both or neither. A record with no position is half an answer, and a member
 * who has not been scored yet has neither to give — for them the line is empty
 * rather than a row of zeroes, which would read as a season gone badly instead
 * of one not yet begun.
 */
function form(party: Party): string {
  if (!party.record || party.position === null) return "—";
  const { wins, draws, losses } = party.record;
  return `${wins}-${draws}-${losses} (#${party.position})`;
}
