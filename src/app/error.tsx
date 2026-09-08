"use client";

import Link from "next/link";

/**
 * What a player sees when something throws.
 *
 * There was no boundary at all, so a failed query anywhere rendered Next's own
 * error screen — a stack trace in development and a bare "Application error" in
 * production, neither of which tells someone whose roster would not load what to
 * do next.
 *
 * The message is deliberately vague about the cause and specific about the way
 * out. A player cannot act on "column does not exist", and repeating the
 * server's words at them risks putting database shape on screen for anyone who
 * can make the app fail.
 */
export default function Error({ reset }: { error: unknown; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
      <h1 className="text-lg font-semibold">That didn&apos;t load</h1>
      <p className="text-sm text-zinc-500">
        Something went wrong on our side. Nothing you had saved is lost — rosters, bets and cost
        cap are all stored, so trying again is safe.
      </p>
      <div className="flex justify-center gap-2 pt-2">
        <button
          onClick={reset}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
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
