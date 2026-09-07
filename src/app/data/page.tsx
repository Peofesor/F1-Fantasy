import Link from "next/link";
import {
  getCoverage,
  getLatestRound,
  getRaceFacts,
  getResults,
  getStandings,
  type ResultRow,
} from "@/lib/f1/queries";

/**
 * Data inspection page for the ingestion pipeline.
 *
 * This is not the game — no league, roster, cost cap or scoring exists yet.
 * It renders what has actually been ingested so the pipeline can be checked
 * from a browser (including a phone) rather than only from the CLI.
 *
 * Rendered per request so it always reflects the current database.
 */
export const dynamic = "force-dynamic";

function classificationLabel(row: ResultRow): string | null {
  switch (row.classification) {
    case "finished":
      return null;
    case "lapped":
      return row.status;
    case "retired":
      return `DNF · ${row.status}`;
    case "disqualified":
      return "DSQ";
    case "did-not-start":
      return "DNS";
    default:
      return row.status;
  }
}

function Gained({ gained }: { gained: number | null }) {
  if (gained === null) return <span className="text-zinc-400">–</span>;
  if (gained === 0) return <span className="text-zinc-400">0</span>;
  const positive = gained > 0;
  return (
    <span className={positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
      {positive ? "+" : ""}
      {gained}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function Home() {
  const latest = await getLatestRound();

  if (!latest) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">F1 Fantasy</h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          No rounds ingested yet. Run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run backfill</code>.
        </p>
      </main>
    );
  }

  const [results, standings, facts, coverage] = await Promise.all([
    getResults(latest.season, latest.round),
    getStandings(latest.season, latest.round),
    getRaceFacts(latest.season, latest.round),
    getCoverage(),
  ]);

  const totalRounds = coverage.reduce((sum, entry) => sum + entry.rounds, 0);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
      <header className="pt-2">
        <Link href="/leagues" className="text-sm text-zinc-500 underline underline-offset-4">
          ← Back to the game
        </Link>
        <p className="mt-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          Pipeline data · not the game
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{latest.raceName}</h1>
        <p className="text-sm text-zinc-500">
          {latest.locality}, {latest.country} · {latest.raceDate} · {latest.season} round{" "}
          {latest.round}
        </p>
      </header>

      <Card title="Bet market facts">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Pole</dt>
            <dd className="font-medium">{facts.poleSitter ?? "–"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Safety car</dt>
            <dd className="font-medium">
              {facts.safetyCar.deployed ? `Yes · ${facts.safetyCar.events} events` : "No"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-zinc-500">Fastest pit lane</dt>
            <dd className="font-medium">
              {facts.fastestPitStop
                ? `${facts.fastestPitStop.driverName} · ${facts.fastestPitStop.seconds.toFixed(3)}s`
                : "–"}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <p className="text-zinc-500 text-sm">
            Most overtakes{" "}
            <span className="text-xs">
              ({facts.overtakeTotals.onTrack} on-track of {facts.overtakeTotals.raw} recorded)
            </span>
          </p>
          <ol className="mt-2 space-y-1 text-sm">
            {facts.topOvertakers.map((entry) => (
              <li key={entry.driverName} className="flex justify-between">
                <span>{entry.driverName}</span>
                <span className="tabular-nums font-medium">{entry.count}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-zinc-500">
            House definition: counted from our own feed with pit-driven passes removed. Runs
            several times higher than the broadcast figure.
          </p>
        </div>

        <p className="mt-3 text-xs text-amber-700 dark:text-amber-500">
          Lap-1 leader is not shown: lap timings are not ingested yet, so that market has no
          data.
        </p>
      </Card>

      <Card title="Race result">
        <ol className="space-y-1 text-sm">
          {results.map((row) => {
            const label = classificationLabel(row);
            return (
              <li
                key={row.driverName}
                className="flex items-baseline gap-3 border-b border-zinc-100 py-1 last:border-0 dark:border-zinc-800"
              >
                <span className="w-6 shrink-0 tabular-nums text-zinc-500">
                  {row.position ?? "–"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.driverName}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {row.constructorId}
                    {label ? ` · ${label}` : ""}
                  </span>
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-xs">
                  <Gained gained={row.gained} />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums font-medium">
                  {row.points || ""}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-zinc-500">
          Columns: position · driver — team · places gained from grid · points
        </p>
      </Card>

      <Card title={`Championship after round ${latest.round}`}>
        <ol className="space-y-1 text-sm">
          {standings.slice(0, 10).map((row) => (
            <li key={row.driverName} className="flex items-baseline gap-3">
              <span className="w-6 shrink-0 tabular-nums text-zinc-500">
                {row.position ?? "–"}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.driverName}</span>
              <span className="shrink-0 tabular-nums font-medium">{row.points}</span>
            </li>
          ))}
        </ol>
        {standings.some((row) => row.position === null) && (
          <p className="mt-2 text-xs text-zinc-500">
            Drivers on zero points are unranked rather than joint-last.
          </p>
        )}
      </Card>

      <Card title="Ingestion coverage">
        <ul className="space-y-1 text-sm">
          {coverage.map((entry) => (
            <li key={entry.season} className="flex justify-between">
              <span className="text-zinc-500">{entry.season}</span>
              <span className="tabular-nums">{entry.rounds} rounds</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-zinc-100 pt-2 text-sm font-medium dark:border-zinc-800">
          {totalRounds} rounds total
        </p>
      </Card>
    </main>
  );
}
