"use client";

import { useRef, useState } from "react";

import { MatchupHeader, MatchupLineup, type Matchup } from "./matchup-card";

/**
 * Every fixture of one race weekend, one at a time.
 *
 * The hub used to show your duel and nothing else, which answered half the
 * question a league asks on a Sunday: you could see whether you were winning
 * but not whether the result mattered. The rest of the round was reachable only
 * by opening each rival's profile in turn and holding four squads in your head.
 *
 * A swipe is the right gesture for it because the fixtures are peers — there is
 * no hierarchy to navigate, just a handful of cards to flick through — and on a
 * phone it costs no chrome at all. The dots and the arrows are for saying how
 * many there are and for pointers, which have no swipe.
 *
 * Native scroll-snap rather than a transform: the platform already does the
 * momentum, the rubber-banding and the snap, and doing it by hand means
 * reimplementing three behaviours the browser ships correctly.
 */
export function MatchupCarousel({
  leagueId,
  matchups,
  duel,
}: {
  leagueId: string;
  /** In display order. The viewer's own fixture is expected first. */
  matchups: Matchup[];
  duel: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Reset between rounds by remounting rather than by an effect: the browser
  // around this keys it on the round, so a round with two fixtures can never
  // inherit the third card of the round before it.
  const [active, setActive] = useState(0);

  const go = (index: number) => {
    const node = scroller.current;
    if (!node) return;
    const clamped = Math.max(0, Math.min(matchups.length - 1, index));
    // The index is set here rather than left to the scroll handler so a tap
    // lights the dot immediately, before the smooth scroll has run.
    setActive(clamped);
    node.scrollTo({ left: clamped * node.clientWidth, behavior: "smooth" });
  };

  if (matchups.length === 0) return null;
  const current = matchups[Math.min(active, matchups.length - 1)];
  const many = matchups.length > 1;

  return (
    <div className="space-y-2 p-3">
      <div
        ref={scroller}
        onScroll={(event) => {
          const node = event.currentTarget;
          const index = Math.round(node.scrollLeft / node.clientWidth);
          setActive(Math.max(0, Math.min(matchups.length - 1, index)));
        }}
        className={`-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          many ? "" : "overflow-x-hidden"
        }`}
      >
        {matchups.map((matchup) => (
          <div key={matchup.id} className="w-full shrink-0 snap-start">
            <MatchupHeader leagueId={leagueId} matchup={matchup} duel={duel} />
          </div>
        ))}
      </div>

      {many && (
        <div className="flex items-center justify-center gap-3">
          <Step
            direction="left"
            label="Previous matchup"
            onClick={active > 0 ? () => go(active - 1) : undefined}
          />

          <span className="flex items-center gap-1.5">
            {matchups.map((matchup, index) => (
              <button
                key={matchup.id}
                type="button"
                onClick={() => go(index)}
                aria-label={`Matchup ${index + 1} of ${matchups.length}`}
                aria-current={index === active ? "true" : undefined}
                className={`h-1.5 rounded-full transition-all ${
                  index === active
                    ? "w-4 bg-[var(--accent)]"
                    : "w-1.5 bg-zinc-300 dark:bg-zinc-700"
                }`}
              />
            ))}
          </span>

          <Step
            direction="right"
            label="Next matchup"
            onClick={active < matchups.length - 1 ? () => go(active + 1) : undefined}
          />
        </div>
      )}

      {/* The lineup is outside the scroller so the dots sit directly under the
          card they belong to, the way a paged header reads. It follows the
          selected fixture rather than scrolling with it. */}
      <MatchupLineup matchup={current} />
    </div>
  );
}

function Step({
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
      className="px-1 text-xs text-zinc-400 disabled:opacity-25"
    >
      {direction === "left" ? "◀" : "▶"}
    </button>
  );
}
