"use client";

import Image from "next/image";
import { useState } from "react";

import { grossMultiplier } from "@/lib/f1/bet-odds";
import { betOutcomeLabel } from "@/lib/f1/betting";
import { money } from "@/lib/f1/money";
import { RoundArrow } from "../../round-arrow";

export interface Pick {
  slotType: string;
  name: string;
  headshotUrl?: string;
  /** A team has no portrait of its own, so it is drawn as its two drivers. */
  lineup?: { name: string; headshotUrl?: string }[];
  colour?: string;
  /** "2x", "3x" or null — what this pick's points were multiplied by. */
  boost: string | null;
  price: number | null;
  /** What it scored for the round, boost included. Null before the round is scored. */
  points: number | null;
}

export interface Bet {
  market: string;
  selection: string;
  stake: number;
  odds: number | null;
  outcome: string | null;
  returned: number | null;
}

export interface Squad {
  round: number;
  raceName: string;
  points: number | null;
  picks: Pick[];
  bets: Bet[];
}

/**
 * The order a squad reads in, and what each slot is called.
 *
 * The same order and the same words the round card uses, because a squad met on
 * a rival's profile and the same squad met on a fixture should not be two
 * different lists. Drivers lead their bracket and the team closes it, which is
 * also the order the roster picker fills them in.
 */
const SLOT_ORDER: { type: string; label: string }[] = [
  { type: "driver_top", label: "Top" },
  { type: "constructor_top", label: "Top team" },
  { type: "driver_mid", label: "Mid" },
  { type: "constructor_mid", label: "Mid team" },
  { type: "driver_backmarker", label: "Backmarker" },
  { type: "constructor_reverse", label: "Backmarker team" },
];

/**
 * What a pick scored, signed and coloured the way the round card does it, so a
 * pick reads identically wherever it is met.
 *
 * Zero takes no sign in either direction. The backmarker reads with a minus
 * because it is scored the other way up, but on a round where it paid cost cap
 * instead its score really is nothing — and "-0" is not a number anyone means.
 */
function PickPoints({ pick }: { pick: Pick }) {
  const points = pick.points ?? 0;
  if (points === 0) {
    return <span className="text-sm font-semibold tabular-nums text-zinc-500">0 pts</span>;
  }

  const backmarker = pick.slotType === "driver_backmarker";
  const lost = !backmarker && points < 0;

  return (
    <span
      className={`text-sm font-semibold tabular-nums ${
        lost ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {backmarker
        ? `-${Math.abs(points).toFixed(0)}`
        : `${points > 0 ? "+" : ""}${points.toFixed(0)}`}{" "}
      pts
    </span>
  );
}

/**
 * The portrait, or a team's two cars overlapped where there is no portrait.
 *
 * Sized by a fixed well wide enough for the two overlapping faces, rather than
 * by whichever it happens to be. Left to its content a team pushed its name
 * about twenty-five pixels further in than a driver's, so ten rows of names
 * started in two different places and the column could not be read down. The
 * team picture is still visibly the wider of the two — which is what marks a
 * team out — it just no longer moves the text. The same well the fixture card
 * uses, for the same reason.
 */
function Face({ pick }: { pick: Pick }) {
  const accent = pick.colour ? `#${pick.colour}` : "#a1a1aa";

  return (
    <span className="flex w-[4.125rem] shrink-0 justify-start">
      {/* The badge hangs off the picture, so it anchors to the faces rather
          than to the well — on a driver the two edges are twenty-five pixels
          apart, which is a badge floating in the margin. */}
      <span className="relative">
      {pick.lineup?.length ? (
        <span className="flex items-center">
          {pick.lineup.slice(0, 2).map((seat, index) =>
            seat.headshotUrl ? (
              <Image
                key={seat.name}
                src={seat.headshotUrl}
                alt=""
                width={96}
                height={96}
                className="h-10 w-10 rounded-full object-cover"
                style={{ outline: `2px solid ${accent}`, marginLeft: index === 0 ? 0 : "-35%" }}
                unoptimized
              />
            ) : (
              <span
                key={seat.name}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ backgroundColor: accent, marginLeft: index === 0 ? 0 : "-35%" }}
              >
                {seat.name.slice(0, 2).toUpperCase()}
              </span>
            ),
          )}
        </span>
      ) : pick.headshotUrl ? (
        <Image
          src={pick.headshotUrl}
          alt=""
          width={96}
          height={96}
          className="h-10 w-10 rounded-full object-cover"
          style={{ outline: `2px solid ${accent}` }}
          unoptimized
        />
      ) : (
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          {pick.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      {pick.boost && (
        <span
          aria-label={`scored ${pick.boost}`}
          className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-4 text-zinc-900"
        >
          {pick.boost}
        </span>
      )}
      </span>
    </span>
  );
}

/**
 * A team's name with the boilerplate off, the same way the round card trims it.
 *
 * The reference data calls them "Alpine F1 Team" and "Aston Martin F1 Team", of
 * which one word identifies the team.
 */
function displayName(pick: Pick): string {
  return pick.lineup ? pick.name.replace(/\s+(?:F1|Formula 1)\s+Team$/i, "") : pick.name;
}

/**
 * One pick, as a row: who it is on the left, which slot they filled and what
 * they scored on the right.
 *
 * A row rather than a tile. The squad used to wrap across three little grids of
 * portraits, which packed ten picks into a small space but made the one thing
 * the page is opened for — how did each of them do — a hunt through captions
 * four words wide. Down the page each pick gets a full line, the names line up
 * under one another, and the scores form a column that can be read without
 * reading anything else.
 */
function PickRow({ pick, label }: { pick: Pick; label: string }) {
  const seats = pick.lineup?.slice(0, 2) ?? [];

  return (
    <li className="flex items-center gap-3 px-3 py-2 odd:bg-[color-mix(in_oklab,var(--accent)_7%,var(--background))]">
      <Face pick={pick} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{displayName(pick)}</p>
        {/* A team spends its second line on the two cars it is drawn as —
            without the names the badge is a picture of two people the reader is
            expected to recognise at ten pixels. A driver spends it on what they
            cost. */}
        <p className="truncate text-[11px] leading-tight text-zinc-500">
          {seats.length > 0 && seats.map((seat) => seat.name).join(" · ")}
          {seats.length > 0 && pick.price !== null && " · "}
          {pick.price !== null && <span className="tabular-nums">{money(pick.price)}</span>}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-zinc-400">
          {label}
        </p>
        {pick.points !== null && <PickPoints pick={pick} />}
      </div>
    </li>
  );
}

/**
 * One squad at a time, stepped through a race at a time.
 *
 * Every round stacked down the page made a fourteen-race season an enormous
 * scroll to answer a question that is always about one race: what did they
 * field at Monza. A picker turns that into one choice and one team.
 *
 * The picker is the hub's arrows rather than a dropdown, because it is the same
 * movement through the same season — a member arriving from the round card and
 * tapping a name should not have to learn a second control to do what they were
 * just doing. It opens on the most recent race and steps back from there.
 *
 * All the rounds are sent with the page rather than fetched per choice. A
 * season is a couple of dozen small squads, so switching is instant and the
 * list works with no further round trips.
 */
export function RosterHistory({
  squads,
  name,
  sealed,
  openRound,
}: {
  squads: Squad[];
  name: string;
  /**
   * The round whose team exists but is not readable yet, if any. A profile that
   * simply stopped at the last locked race read as though they had stopped
   * playing, which is the opposite of what it means.
   */
  sealed: { round: number; raceName: string; bets: number } | null;
  /**
   * The round still open for betting, or null when the season has none left.
   * A bet on any other round has locked, whether or not it has settled yet.
   */
  openRound: number | null;
}) {
  // Stepped oldest-to-newest so the arrows point the way the season runs, while
  // the list arrives newest first because that is the order a profile reads in.
  const ordered = [...squads].sort((a, b) => a.round - b.round);
  const [round, setRound] = useState(ordered[ordered.length - 1]?.round ?? 0);

  const index = Math.max(
    0,
    ordered.findIndex((entry) => entry.round === round),
  );
  const squad = ordered[index];
  const older = ordered[index - 1];
  const newer = ordered[index + 1];

  const seal = sealed && (
    <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-center text-xs text-zinc-500 dark:border-zinc-700">
      R{sealed.round} · {sealed.raceName} is picked but sealed until qualifying
      {sealed.bets > 0 && `, with ${sealed.bets} bet${sealed.bets === 1 ? "" : "s"}`}.
    </p>
  );

  if (!squad) {
    return (
      <div className="space-y-3">
        {seal}
        <section className="rounded-xl border border-dashed border-zinc-300 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] p-6 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-500">
            {sealed ? `Nothing of ${name}'s is readable yet.` : `${name} has no team to show yet.`}
          </p>
        </section>
      </div>
    );
  }

  // One flat list in slot order, the boosted driver leading its bracket — the
  // order the round card reads in. The rows arrive in whatever order the
  // database returned them, so without this a team could lead its own bracket
  // here and trail it there: the same squad reading differently depending on
  // which screen you met it on.
  const rows = SLOT_ORDER.flatMap(({ type, label }) =>
    squad.picks
      .filter((pick) => pick.slotType === type)
      .sort((a, b) => Number(Boolean(b.boost)) - Number(Boolean(a.boost)))
      .map((pick) => ({ pick, label })),
  );

  return (
    <div className="space-y-3">
      {seal}

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
        <div className="flex items-stretch gap-1 border-b border-zinc-200 p-2 dark:border-zinc-800">
          <RoundArrow
            direction="left"
            label={older ? `Back to round ${older.round}` : "No earlier round"}
            onClick={older ? () => setRound(older.round) : undefined}
          />

          <div className="min-w-0 flex-1 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Round {squad.round}
            </p>
            <h2 className="truncate text-base font-semibold">{squad.raceName}</h2>
            <p className="text-xs text-zinc-500">
              {squad.points !== null
                ? `${squad.points.toFixed(0)} points`
                : squad.picks.length === 0
                  ? "Bets only — no squad to show"
                  : "Not scored yet"}
            </p>
          </div>

          <RoundArrow
            direction="right"
            label={newer ? `On to round ${newer.round}` : "No later round"}
            onClick={newer ? () => setRound(newer.round) : undefined}
          />
        </div>

        {rows.length > 0 && (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map(({ pick, label }) => (
              <PickRow key={`${pick.slotType}-${pick.name}`} pick={pick} label={label} />
            ))}
          </ul>
        )}

        {squad.bets.length > 0 && (
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Bets</p>
            <ul className="mt-1.5 space-y-1">
              {squad.bets.map((bet) => (
                <li
                  key={`${bet.market}-${bet.selection}`}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {bet.market} — <span className="text-zinc-500">{bet.selection}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    {money(bet.stake)}
                    {bet.odds !== null && ` × ${grossMultiplier(bet.odds).toFixed(2)}`}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right tabular-nums ${
                      bet.outcome === "won"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : bet.outcome === "lost"
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-500"
                    }`}
                  >
                    {/* The money, not the word: a history read to see how
                        somebody is doing wants the amounts, and "won" beside
                        "lost" says nothing about which way the round went. */}
                    {betOutcomeLabel(
                      bet.outcome,
                      squad.round === openRound,
                      bet.stake,
                      bet.returned,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
