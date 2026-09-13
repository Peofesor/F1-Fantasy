"use client";

import Link from "next/link";

/**
 * What a league page shows when it throws.
 *
 * There was only the root boundary, which sits above this segment's
 * `loading.tsx`. When something under a league failed, React unwound past the
 * suspended segment to that boundary — and the skeleton stayed on screen,
 * pulsing, for as long as the tab was open. The page had not failed to load
 * slowly; it had failed, and said so nowhere. "Still loading" and "broken" are
 * opposite messages, and the player was shown the wrong one.
 *
 * A boundary beside the fallback rather than above it is the whole fix: it
 * replaces the skeleton it is paired with, so the same segment that promised
 * the page is the one that admits it is not coming.
 *
 * `reset` re-renders the segment without a full navigation, which is the right
 * offer for the usual cause — one query that timed out on a phone.
 */
export default function LeagueError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
      <h1 className="text-lg font-semibold">This league didn&apos;t load</h1>
      {/* Vague about the cause and specific about the way out. A player cannot
          act on "column does not exist", and repeating the server's words at
          them puts database shape on screen for anyone who can make it fail. */}
      <p className="text-sm text-zinc-500">
        Something went wrong on our side. Nothing you had saved is lost — rosters, bets and cost
        cap are all stored, so trying again is safe.
      </p>
      <div className="flex justify-center gap-2 pt-2">
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)]"
        >
          Try again
        </button>
        <Link
          href="/leagues"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
        >
          Your leagues
        </Link>
      </div>
    </main>
  );
}
