import Image from "next/image";
import Link from "next/link";

export interface MatchupPick {
  name: string;
  headshotUrl?: string;
  /** A team has no portrait of its own, so it is drawn as its two drivers. */
  lineup?: { name: string; headshotUrl?: string }[];
  colour?: string;
  captain: boolean;
}

export interface Side {
  memberId: string;
  name: string;
  /** Grouped the way the roster is picked, so the two squads line up row by row. */
  top: MatchupPick[];
  mid: MatchupPick[];
  back: MatchupPick[];
}

/**
 * A face, or initials on the team colour when no portrait has been ingested.
 *
 * Small on purpose. The card compares two whole squads at a glance, so a
 * recognisable face at 28px does more work than a legible name at 40 would.
 */
function Face({ pick }: { pick: MatchupPick }) {
  const accent = pick.colour ? `#${pick.colour}` : "#a1a1aa";

  return (
    <span className="flex flex-col items-center gap-0.5" title={pick.name}>
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
                  className="h-7 w-7 rounded-full object-cover"
                  style={{ outline: `1.5px solid ${accent}`, marginLeft: index === 0 ? 0 : "-30%" }}
                  unoptimized
                />
              ) : (
                <span
                  key={seat.name}
                  className="h-7 w-7 flex items-center justify-center rounded-full text-[8px] font-semibold text-white"
                  style={{ backgroundColor: accent, marginLeft: index === 0 ? 0 : "-30%" }}
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
            width={64}
            height={64}
            className="h-7 w-7 rounded-full object-cover"
            style={{ outline: `1.5px solid ${accent}` }}
            unoptimized
          />
        ) : (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {pick.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {pick.captain && (
          <span
            aria-label="captain, scores double"
            className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[8px] font-bold leading-3 text-zinc-900"
          >
            2x
          </span>
        )}
      </span>
      <span className="max-w-[3.5rem] truncate text-[9px] leading-tight text-zinc-500">
        {pick.name}
      </span>
    </span>
  );
}

function Row({ label, picks }: { label: string; picks: MatchupPick[] }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wide text-zinc-400">{label}</p>
      {picks.length === 0 ? (
        <p className="mt-1 text-[10px] text-zinc-500">—</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {picks.map((pick) => (
            <Face key={pick.name} pick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Who you are up against this round, and what you are both fielding.
 *
 * The standings say who is ahead over a season; this says what happens on
 * Sunday. Before it existed the fixture list gave you a name and nothing else,
 * so the one thing a head-to-head format is about — comparing two teams — was
 * the thing the league page would not show you.
 *
 * Grouped by bracket rather than listed flat, because the brackets are what
 * make two squads comparable: the interesting question is who took the better
 * three top drivers, and one list of eleven names hides that.
 *
 * An opponent's picks are visible because the roster locks at qualifying, so by
 * the time it matters neither of you can act on what you see. Shown before the
 * lock too, since a team you can still change is a team worth arguing about.
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

      {/* Two columns at every width. A duel is a comparison, and stacking the
          squads on a phone would put them a scroll apart — which is exactly
          where a comparison stops working. */}
      <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
        {[you, opponent].map((side, index) => (
          <div key={side.memberId} className="min-w-0 space-y-2.5 p-3">
            <Link
              href={`/leagues/${leagueId}/members/${side.memberId}`}
              className="block truncate text-sm font-semibold underline-offset-2 hover:underline"
            >
              {side.name}
              {index === 0 && <span className="ml-1 text-xs font-normal text-zinc-500">you</span>}
            </Link>

            {side.top.length + side.mid.length + side.back.length === 0 ? (
              <p className="text-xs text-zinc-500">No team saved yet.</p>
            ) : (
              <>
                <Row label="Top" picks={side.top} />
                <Row label="Midfield" picks={side.mid} />
                <Row label="Back" picks={side.back} />
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
