import { MatchupGrid, type Side } from "./matchup-grid";

export type { MatchupPick, Side } from "./matchup-grid";

/**
 * Who you are up against next round, and what you are both fielding.
 *
 * The standings say who is ahead over a season; this says what happens on
 * Sunday. Before it existed the fixture list gave you a name and nothing else,
 * so the one thing a head-to-head format is about — comparing two teams — was
 * the thing the league page would not show you.
 *
 * This one is about the round nobody has raced yet, which is why it stays even
 * when both sides are empty: an unpicked team is the thing it is there to point
 * at. The rounds already run are in the event browser at the top of the page,
 * where a squad always has a score beside it.
 */
export function MatchupCard({
  leagueId,
  round,
  raceName,
  you,
  opponent,
  drawn,
}: {
  leagueId: string;
  round: number;
  raceName: string;
  you: Side;
  opponent: Side | null;
  /** Whether this round has any fixtures at all. */
  drawn: boolean;
}) {
  if (!opponent) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] p-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Next matchup</h2>
        {/* A bye and an undrawn schedule look identical from here — no
            opponent — but only one of them is something to act on. With an odd
            number of members somebody sits out every round, and telling that
            player the owner needs to draw fixtures would send them chasing a
            problem that does not exist. */}
        <p className="mt-1 text-sm text-zinc-500">
          {drawn
            ? `You have a bye in round ${round} — an odd number of members means one sits out each race. Your points still count toward the season total.`
            : `No fixtures drawn for round ${round} yet. The league owner can draw them from the panel below.`}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Next matchup</h2>
        <span className="text-xs text-zinc-500">
          R{round} · {raceName}
        </span>
      </div>

      <MatchupGrid leagueId={leagueId} sides={[you, opponent]} />
    </section>
  );
}
