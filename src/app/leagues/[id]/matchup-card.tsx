interface Side {
  name: string;
  /** Empty when they have not picked yet — which is itself worth seeing. */
  drivers: { name: string; captain: boolean }[];
  constructors: string[];
}

/**
 * Who you are up against this round, and what you are both fielding.
 *
 * The standings say who is ahead over a season; this says what happens on
 * Sunday. Before it existed the fixture list gave you a name and nothing else,
 * so the one thing a head-to-head format is about — comparing two teams — was
 * the one thing the league page would not show you.
 *
 * An opponent's picks are visible because the roster locks at qualifying: by
 * the time this matters neither of you can act on what you see. Shown before
 * the lock too, since a team you can still change is a team worth arguing
 * about, and that argument is most of the appeal of a duel league.
 */
export function MatchupCard({
  round,
  raceName,
  you,
  opponent,
  drawn,
}: {
  round: number;
  raceName: string;
  you: Side;
  opponent: Side | null;
  /** Whether this round has any fixtures at all. */
  drawn: boolean;
}) {
  if (!opponent) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
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
    <section className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      <div className="flex items-baseline justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Next matchup</h2>
        <span className="text-xs text-zinc-500">
          R{round} · {raceName}
        </span>
      </div>

      {/* Two columns on every width. A duel is a comparison, and stacking the
          teams on a phone would put them a scroll apart — which is exactly
          where a comparison stops working. */}
      <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
        {[you, opponent].map((side, index) => (
          <div key={side.name} className="min-w-0 p-3">
            <p className="truncate text-sm font-semibold">
              {side.name}
              {index === 0 && <span className="ml-1 text-xs font-normal text-zinc-500">you</span>}
            </p>

            {side.drivers.length === 0 && side.constructors.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">No team saved yet.</p>
            ) : (
              <>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {side.drivers.map((driver) => (
                    <li key={driver.name} className="flex items-baseline gap-1 truncate">
                      <span className="truncate">{driver.name}</span>
                      {driver.captain && (
                        <span
                          aria-label="captain, scores double"
                          className="shrink-0 rounded bg-amber-400 px-1 text-[9px] font-bold text-zinc-900"
                        >
                          2x
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                <ul className="mt-2 space-y-0.5 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-900">
                  {side.constructors.map((name) => (
                    <li key={name} className="truncate">
                      {name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
