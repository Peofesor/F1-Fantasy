"use client";

import { useState, type ReactNode } from "react";

import { money } from "@/lib/f1/money";

import { BetSlipList, type RoundBet } from "../bet-slip-list";
import { RoundArrow } from "../round-arrow";
import { PlacedBets, type PlacedBet } from "./placed-bets";

export interface BrowsableRound {
  round: number;
  raceName: string;
  /** A session is on track, which is where a reader most often wants to be. */
  live: boolean;
}

/** One bet on one round, from anyone in the league. */
export interface LeagueBet extends RoundBet {
  round: number;
  /** Kept so your own slip can be handed to the withdrawable view. */
  own: PlacedBet | null;
}

/**
 * Every bet in the league, one round at a time.
 *
 * This page used to show your slip for the round you could still bet on, and
 * nothing else — which made it useless for the two questions actually being
 * asked. What did the others back? And what is riding on the race that is
 * running right now? Neither was answerable: an opponent's slip could only be
 * reached through their profile, and the moment qualifying started the page
 * jumped forward to a race a fortnight away, taking your own open bets with it.
 *
 * Every round is sent with the page rather than fetched per choice. A season is
 * a few dozen small bets, so switching rounds is instant and needs no request.
 *
 * Withdrawing is offered only on the round still open, because that is the only
 * one where a stake can come back. On any other round this is a record.
 */
export function BetsBrowser({
  leagueId,
  rounds,
  bets,
  openRound,
  opening,
  locked,
  sealed,
  form,
}: {
  leagueId: string;
  rounds: BrowsableRound[];
  bets: LeagueBet[];
  /** The round a bet can still be placed on or taken back. */
  openRound: number;
  /**
   * Which round to show first. The open round is the wrong default: it is the
   * one nobody has bet on yet, so the page would greet a reader with an empty
   * list while the race they are watching sits one choice away.
   */
  opening: number;
  /** Whether that round has shut, which withdrawal depends on. */
  locked: boolean;
  /**
   * Bets on the open round that exist but cannot be read yet, per member.
   * Without them the page says nobody else has bet when what it means is that
   * nobody else's bets are readable — and the wrong one of those invites a
   * shrug at a rival who is actually in for fifty.
   */
  sealed: { name: string; count: number }[];
  /**
   * The betting form, built on the server for the open round.
   *
   * Handed in rather than rendered below the browser, because a form for one
   * round under a list of another round's bets is a trap: during the Spanish
   * weekend this page opened on Spain and offered, underneath it, a form that
   * would have staked money on Azerbaijan. It is shown only while the round
   * being read is the round it belongs to.
   */
  form: ReactNode;
}) {
  const [round, setRound] = useState(opening);

  // Sorted here rather than relying on the order they arrive in: the arrows
  // mean "earlier" and "later", so left has to be the smaller round whichever
  // way the page happened to build the list.
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  const index = Math.max(
    0,
    ordered.findIndex((entry) => entry.round === round),
  );
  const selected = ordered[index] ?? ordered[0];
  const older = ordered[index - 1];
  const newer = ordered[index + 1];

  const onRound = bets.filter((bet) => bet.round === round);
  const staked = onRound.reduce((total, bet) => total + bet.stake, 0);

  // The one round a bet can still be placed on or taken back. Everything else
  // this page shows is a record.
  const isOpenRound = round === openRound;
  const openRaceName = rounds.find((entry) => entry.round === openRound)?.raceName;

  // Your own bets are withdrawable only on the open round, and there they are
  // shown in full above the league's. Everywhere else you are just another
  // member of the list.
  const yours = isOpenRound && !locked;
  const mine = yours
    ? onRound.map((bet) => bet.own).filter((bet): bet is PlacedBet => bet !== null)
    : [];
  const theirs = yours ? onRound.filter((bet) => !bet.isSelf) : onRound;
  const sealedHere = isOpenRound ? sealed : [];
  const sealedTotal = sealedHere.reduce((total, entry) => total + entry.count, 0);

  return (
    <div className="space-y-4">
      {/* Stepped through with arrows rather than picked from a dropdown. The
          season is a line you move along, and it is the same movement the round
          card on the league page makes — arriving here from that card and being
          handed a different control for the same journey is a seam the reader
          has to notice. The live dot and the open marker come inside the header
          for the same reason: it is one thing that names the round, not a
          control plus a caption. */}
      <div className="flex items-stretch gap-1 rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
        <RoundArrow
          direction="left"
          label={older ? `Back to round ${older.round}` : "No earlier round"}
          onClick={older ? () => setRound(older.round) : undefined}
        />

        <div className="min-w-0 flex-1 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {selected?.live ? (
              <>
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <span className="text-red-600 dark:text-red-400">Live now</span>
              </>
            ) : (
              `Round ${selected?.round ?? round}${isOpenRound ? " · open" : ""}`
            )}
          </p>

          <h2 className="truncate text-base font-semibold">{selected?.raceName}</h2>

          <p className="text-xs tabular-nums text-zinc-500">
            {onRound.length} bet{onRound.length === 1 ? "" : "s"} · {money(staked)}
          </p>
        </div>

        <RoundArrow
          direction="right"
          label={newer ? `On to round ${newer.round}` : "No later round"}
          onClick={newer ? () => setRound(newer.round) : undefined}
        />
      </div>

      {yours && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Your slip
          </h2>
          <PlacedBets leagueId={leagueId} round={round} bets={mine} locked={locked} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {yours ? "The rest of the league" : "The league"}
        </h2>

        {theirs.length === 0 && sealedTotal === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            {yours ? "Nobody else has bet on this race." : "Nobody bet on this race."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
            {theirs.length > 0 && (
              <BetSlipList leagueId={leagueId} bets={theirs} stillOpen={isOpenRound && !locked} />
            )}

            {sealedTotal > 0 && (
              <div
                className={`px-4 py-2.5 ${
                  theirs.length > 0 ? "border-t border-zinc-200 dark:border-zinc-800" : ""
                }`}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  Sealed until qualifying
                </p>
                <ul className="mt-1 space-y-0.5">
                  {sealedHere.map((entry) => (
                    <li
                      key={entry.name}
                      className="flex items-baseline gap-2 text-xs text-zinc-500"
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {entry.count} bet{entry.count === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* The form follows the round being read. On any other round it is not
          merely disabled but absent, and the page says why: an open form under
          a race that has already qualified is an invitation to stake money on
          the wrong weekend. */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {isOpenRound
            ? `Place a bet on ${selected?.raceName ?? "this round"}`
            : "Betting"}
        </h2>

        {isOpenRound ? (
          form
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-xs leading-relaxed text-zinc-500 dark:border-zinc-700">
            <strong className="text-zinc-700 dark:text-zinc-300">
              No bets can be placed on {selected?.raceName ?? "this round"}.
            </strong>{" "}
            Betting closed when qualifying started, so this round is a record now.
            {openRaceName && ` Step to ${openRaceName} above to place a bet.`}
          </p>
        )}
      </section>
    </div>
  );
}
