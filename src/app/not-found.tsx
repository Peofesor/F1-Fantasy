import Link from "next/link";

/**
 * A page that isn't there.
 *
 * Reached by a stale link as much as by a typo: a league someone left, or one
 * deleted when its last member walked out. So the wording does not assume a
 * mistake was made, and the way back is to the list rather than to the thing
 * that is gone.
 */
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
      <h1 className="text-lg font-semibold">Nothing here</h1>
      <p className="text-sm text-zinc-500">
        This page doesn&apos;t exist, or the league it belonged to is gone — a league is deleted
        when its last member leaves.
      </p>
      <div className="pt-2">
        <Link
          href="/leagues"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Your leagues
        </Link>
      </div>
    </main>
  );
}
