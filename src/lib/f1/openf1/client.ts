import {
  driverListSchema,
  overtakeListSchema,
  pitListSchema,
  raceControlListSchema,
  sessionListSchema,
  type OpenF1Driver,
  type OpenF1Overtake,
  type OpenF1Pit,
  type OpenF1RaceControl,
  type OpenF1Session,
} from "./schemas";

/**
 * HTTP client for OpenF1.
 *
 * The free "Community" tier allows 3 requests/second but only 30 per minute, so
 * the per-minute figure is the binding constraint — a 2.1s gap sustains ~28/min.
 * Live-session data requires a paid tier; everything here reads post-session
 * data, which is what the game needs since scoring runs after each race.
 *
 * Historical coverage starts at 2023. Requests for earlier seasons return empty
 * arrays rather than errors.
 */

const BASE_URL = "https://api.openf1.org/v1";

/** 30 req/min is the free-tier ceiling; 2.1s between calls stays under it. */
const MIN_REQUEST_GAP_MS = 2100;

let requestChain: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const result = await task();
    await sleep(MIN_REQUEST_GAP_MS);
    return result;
  });
  requestChain = run.catch(() => undefined);
  return run;
}

export class OpenF1Error extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "OpenF1Error";
  }
}

async function fetchJson(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<unknown> {
  const query = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  const url = `${BASE_URL}/${endpoint}?${query}`;

  const response = await rateLimited(() =>
    fetch(url, { headers: { Accept: "application/json" } }),
  );

  if (!response.ok) {
    // OpenF1 answers "no matching data" with 404 and {"detail":"No results
    // found."} rather than an empty array. A race with no safety car is a
    // perfectly normal race, so this is an empty result, not a failure.
    if (response.status === 404) return [];

    throw new OpenF1Error(
      `OpenF1 request failed: ${response.status} ${response.statusText}`,
      response.status,
      url,
    );
  }

  return response.json();
}

/**
 * Finds the race session for a given event.
 *
 * OpenF1 has no notion of a championship round number, so sessions are located
 * by year plus country, then narrowed to the race. Events sharing a country in
 * one season (Italy hosting both Imola and Monza) return more than one session,
 * which is why the caller gets the list rather than a single result.
 */
export async function getRaceSessions(
  year: number,
  countryName?: string,
): Promise<OpenF1Session[]> {
  const params: Record<string, string | number> = {
    year,
    session_name: "Race",
  };
  if (countryName) params.country_name = countryName;
  return sessionListSchema.parse(await fetchJson("sessions", params));
}

export async function getDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
  return driverListSchema.parse(
    await fetchJson("drivers", { session_key: sessionKey }),
  );
}

export async function getOvertakes(
  sessionKey: number,
): Promise<OpenF1Overtake[]> {
  return overtakeListSchema.parse(
    await fetchJson("overtakes", { session_key: sessionKey }),
  );
}

export async function getPitStops(sessionKey: number): Promise<OpenF1Pit[]> {
  return pitListSchema.parse(
    await fetchJson("pit", { session_key: sessionKey }),
  );
}

export async function getSafetyCarMessages(
  sessionKey: number,
): Promise<OpenF1RaceControl[]> {
  return raceControlListSchema.parse(
    await fetchJson("race_control", {
      session_key: sessionKey,
      category: "SafetyCar",
    }),
  );
}
