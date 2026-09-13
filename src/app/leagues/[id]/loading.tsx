/**
 * What a league page looks like before it has arrived.
 *
 * Every page under a league is rendered on demand — the round being played, a
 * ledger balance, a dozen members' teams — which is a few hundred milliseconds
 * of database round trips on a good connection and rather more on a phone. With
 * nothing here the router held the old page on screen for all of it, so tapping
 * Paddock did nothing at all for a second or two and then jumped. The tap
 * looked lost, and the usual response to that is to tap again.
 *
 * This is also what makes the tabs prefetchable: the router fetches a route's
 * fallback ahead of the tap, so the shell is already in hand when it comes.
 *
 * Deliberately dumb — three grey blocks in the shape of the cards that follow.
 * It is on screen for a moment, and a spinner that is more interesting than the
 * page is a spinner that gets looked at.
 */
export default function LeagueLoading() {
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4 pb-16" aria-busy="true">
      <span className="sr-only">Loading</span>

      <div className="space-y-2 pt-2">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-64 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
      </div>

      {[0, 1, 2].map((card) => (
        <div
          key={card}
          className="animate-pulse rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] p-4 dark:border-zinc-800"
          // Tapering, so the page reads as content trailing off rather than as
          // three identical boxes waiting for something.
          style={{ height: `${11 - card * 2}rem` }}
        />
      ))}
    </main>
  );
}
