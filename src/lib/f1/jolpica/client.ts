import {
  raceTableResponseSchema,
  standingsResponseSchema,
  type RaceTableResponse,
  type StandingsResponse,
} from "./schemas";

/**
 * HTTP client for jolpica-f1.
 *
 * Two upstream constraints shape this file:
 *
 * 1. jolpica *requires* a descriptive User-Agent so they can block a misbehaving
 *    client version rather than blocking all traffic. Requests without one risk
 *    being cut off.
 * 2. The unauthenticated budget is 4 requests/second and 500/hour, and their docs
 *    warn it may tighten. Every call therefore goes through a serialising queue
 *    with a fixed gap, and callers are expected to ingest into our own store
 *    rather than proxying user traffic here.
 */

const BASE_URL = "https://api.jolpi.ca/ergast/f1";

/** 4 req/s is the documented burst ceiling; 300ms leaves headroom under it. */
const MIN_REQUEST_GAP_MS = 300;

const USER_AGENT = "F1Fantasy/0.1.0 (+https://github.com/yannick/F1Fantasy)";

/** Upstream caps a page at 100 regardless of what `limit` asks for. */
const MAX_PAGE_SIZE = 100;

let requestChain: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialises every request through one chain with a fixed gap between them.
 * Concurrency here would buy nothing — the rate limit, not latency, is the
 * bottleneck — and would risk tripping the burst ceiling.
 */
async function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const result = await task();
    await sleep(MIN_REQUEST_GAP_MS);
    return result;
  });
  // Keep the chain alive even if this task rejects, so one failure doesn't
  // permanently wedge every later request.
  requestChain = run.catch(() => undefined);
  return run;
}

export class JolpicaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "JolpicaError";
  }
}

/**
 * Waits out a 429 and retries.
 *
 * The per-second gap above only protects the burst ceiling; the binding limit
 * is 500 requests per hour, which a multi-season backfill will exhaust (roughly
 * six requests per round means the budget runs out around round 80). When that
 * happens the only correct response is to wait, so retries honour `Retry-After`
 * when jolpica sends it and otherwise back off exponentially.
 */
const MAX_RETRIES = 5;
const DEFAULT_BACKOFF_MS = 60_000;

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return DEFAULT_BACKOFF_MS * 2 ** attempt;
}

async function fetchJson(path: string): Promise<unknown> {
  const url = `${BASE_URL}/${path}`;

  for (let attempt = 0; ; attempt++) {
    const response = await rateLimited(() =>
      fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }),
    );

    if (response.ok) return response.json();

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delay = retryDelayMs(response, attempt);
      console.warn(
        `jolpica rate limit hit; waiting ${Math.round(delay / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}`,
      );
      await sleep(delay);
      continue;
    }

    throw new JolpicaError(
      `jolpica request failed: ${response.status} ${response.statusText}`,
      response.status,
      url,
    );
  }
}

/**
 * Fetches every page of a jolpica endpoint.
 *
 * Ergast-style pagination reports `total` in the response, so the page count is
 * known after the first request. A 22-car race fits in one page; lap timings for
 * a full race do not.
 */
async function fetchAllPages<T>(
  path: string,
  parse: (raw: unknown) => T,
  countItems: (parsed: T) => number,
  total: (parsed: T) => number,
): Promise<T[]> {
  const separator = path.includes("?") ? "&" : "?";
  const first = parse(await fetchJson(`${path}${separator}limit=${MAX_PAGE_SIZE}`));

  const pages = [first];
  let fetched = countItems(first);
  const expected = total(first);

  while (fetched < expected) {
    const page = parse(
      await fetchJson(
        `${path}${separator}limit=${MAX_PAGE_SIZE}&offset=${fetched}`,
      ),
    );
    const received = countItems(page);
    // Defensive: without this a mis-reported `total` would loop forever.
    if (received === 0) break;
    pages.push(page);
    fetched += received;
  }

  return pages;
}

const raceTableTotal = (response: RaceTableResponse) =>
  Number(response.MRData.total);

function raceTableItemCount(response: RaceTableResponse): number {
  const race = response.MRData.RaceTable.Races[0];
  if (!race) return 0;
  return (
    race.QualifyingResults?.length ??
    race.Results?.length ??
    race.PitStops?.length ??
    race.Laps?.reduce((sum, lap) => sum + lap.Timings.length, 0) ??
    0
  );
}

async function fetchRaceTable(path: string): Promise<RaceTableResponse[]> {
  return fetchAllPages(
    path,
    (raw) => raceTableResponseSchema.parse(raw),
    raceTableItemCount,
    raceTableTotal,
  );
}

/** Merges paginated race-table responses back into a single race object. */
function mergeRaces(pages: RaceTableResponse[]): RaceTableResponse | null {
  const first = pages[0];
  if (!first || first.MRData.RaceTable.Races.length === 0) return null;

  const merged = structuredClone(first);
  const target = merged.MRData.RaceTable.Races[0];

  for (const page of pages.slice(1)) {
    const race = page.MRData.RaceTable.Races[0];
    if (!race) continue;
    if (race.QualifyingResults)
      target.QualifyingResults = [
        ...(target.QualifyingResults ?? []),
        ...race.QualifyingResults,
      ];
    if (race.Results)
      target.Results = [...(target.Results ?? []), ...race.Results];
    if (race.PitStops)
      target.PitStops = [...(target.PitStops ?? []), ...race.PitStops];
    if (race.Laps) target.Laps = [...(target.Laps ?? []), ...race.Laps];
  }

  return merged;
}

export async function getQualifying(season: number, round: number) {
  return mergeRaces(await fetchRaceTable(`${season}/${round}/qualifying.json`));
}

export async function getRaceResults(season: number, round: number) {
  return mergeRaces(await fetchRaceTable(`${season}/${round}/results.json`));
}

/**
 * Sprint results for a round.
 *
 * Returns null for a weekend with no sprint, which is most of them — upstream
 * answers with an empty race list rather than an error.
 */
export async function getSprintResults(season: number, round: number) {
  return mergeRaces(await fetchRaceTable(`${season}/${round}/sprint.json`));
}

export async function getPitStops(season: number, round: number) {
  return mergeRaces(await fetchRaceTable(`${season}/${round}/pitstops.json`));
}

/** Lap-by-lap timings for a single lap — lap 1 backs the "lap-1 leader" market. */
export async function getLap(season: number, round: number, lap: number) {
  return mergeRaces(await fetchRaceTable(`${season}/${round}/laps/${lap}.json`));
}

export async function getDriverStandings(
  season: number,
  round: number,
): Promise<StandingsResponse> {
  return standingsResponseSchema.parse(
    await fetchJson(`${season}/${round}/driverstandings.json?limit=${MAX_PAGE_SIZE}`),
  );
}

export async function getConstructorStandings(
  season: number,
  round: number,
): Promise<StandingsResponse> {
  return standingsResponseSchema.parse(
    await fetchJson(
      `${season}/${round}/constructorstandings.json?limit=${MAX_PAGE_SIZE}`,
    ),
  );
}

/** The season's race calendar, used to discover which rounds exist. */
export async function getSeasonSchedule(season: number) {
  return fetchRaceTable(`${season}.json`);
}
