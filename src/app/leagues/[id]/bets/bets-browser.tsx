"use client";

import { useState } from "react";

import { BetSlipList, type RoundBet } from "../bet-slip-list";
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
}) {
  const [round, setRound] = useState(opening);
  const selected = rounds.find((entry) => entry.round === round) ?? rounds[0];

  const onRound = bets.filter((bet) => bet.round === round);
  const staked = onRound.reduce((total, bet) => total + bet.stake, 0);

  // Your own bets are withdrawable only on the open round, and there they are
  // shown in full above the league's. Everywhere else you are just another
  // member of the list.
  const yours = round === openRound && !locked;
  const mine = yours
    ? onRound.map((bet) => bet.own).filter((bet): bet is PlacedBet => bet !== null)
    : [];
  const theirs = yours ? onRound.filter((bet) => !bet.isSelf) : onRound;
  const sealedHere = round === openRound ? sealed : [];
  const sealedTotal = sealedHere.reduce((total, entry) => total + entry.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          value={round}
          onChange={(select) => setRound(Number(select.target.value))}
          aria-label="Race"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {rounds.map((entry) => (
            <option key={entry.round} value={entry.round}>
              R{entry.round} · {entry.raceName}
              {entry.live ? " · live" : ""}
              {entry.round === openRound ? " · open" : ""}
            </option>
          ))}
        </select>

        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
          {onRound.length} bet{onRound.length === 1 ? "" : "s"} · {staked.toFixed(1)}
        </span>
      </div>

      {selected?.live && (
        <p className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          This one is being run now.
        </p>
      )}

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
            {theirs.length > 0 && <BetSlipList leagueId={leagueId} bets={theirs} />}

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
    </div>
  );
}
