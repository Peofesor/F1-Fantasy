import { describe, expect, it } from "vitest";

import { eventStatus, QUALIFYING_WINDOW_MS, RACE_WINDOW_MS } from "./event-status";

// The Spanish Grand Prix as the calendar carries it: qualifying on Saturday
// afternoon, the race at one o'clock the next day.
const QUALI = "2026-09-12T14:00:00Z";
const RACE = "2026-09-13T13:00:00Z";

const at = (iso: string) => eventStatus({ qualifyingAt: QUALI, raceAt: RACE, now: new Date(iso) });

describe("eventStatus", () => {
  it("says nothing before the weekend starts", () => {
    // The deadline card owns the round until then, and two cards for one grand
    // prix is worse than none.
    expect(at("2026-09-12T13:59:00Z")).toBeNull();
  });

  it("is live through qualifying", () => {
    expect(at("2026-09-12T14:00:00Z")).toEqual({ phase: "qualifying", live: true });
    expect(at("2026-09-12T14:45:00Z")).toEqual({ phase: "qualifying", live: true });
  });

  it("stops claiming qualifying is live once the session has run", () => {
    const justAfter = new Date(new Date(QUALI).getTime() + QUALIFYING_WINDOW_MS);
    expect(eventStatus({ qualifyingAt: QUALI, raceAt: RACE, now: justAfter })).toEqual({
      phase: "waiting",
      live: false,
    });
  });

  it("waits out the day between qualifying and the race", () => {
    expect(at("2026-09-13T09:00:00Z")).toEqual({ phase: "waiting", live: false });
  });

  it("is live through the race", () => {
    expect(at("2026-09-13T13:00:00Z")).toEqual({ phase: "race", live: true });
    expect(at("2026-09-13T14:30:00Z")).toEqual({ phase: "race", live: true });
  });

  it("keeps the dot on for a suspended race", () => {
    // Two hours in with a long red flag is still a race in progress. Calling it
    // finished would take the card down while the cars are on the grid.
    expect(at("2026-09-13T15:30:00Z")).toEqual({ phase: "race", live: true });
  });

  it("settles once the race is over", () => {
    const after = new Date(new Date(RACE).getTime() + RACE_WINDOW_MS + 60_000);
    expect(eventStatus({ qualifyingAt: QUALI, raceAt: RACE, now: after })).toEqual({
      phase: "settling",
      live: false,
    });
  });

  it("falls back to the race start when no qualifying time is published", () => {
    // Rounds ingested before session times existed have only a race date.
    const args = { qualifyingAt: null, raceAt: RACE };
    expect(eventStatus({ ...args, now: new Date("2026-09-13T12:00:00Z") })).toBeNull();
    expect(eventStatus({ ...args, now: new Date("2026-09-13T13:30:00Z") })).toEqual({
      phase: "race",
      live: true,
    });
  });

  it("still reports a weekend whose race time is missing", () => {
    // Qualifying is the lock deadline, so a round can have one and no race
    // time. It has started, and saying otherwise would hide a locked roster.
    expect(
      eventStatus({ qualifyingAt: QUALI, raceAt: null, now: new Date("2026-09-12T14:10:00Z") }),
    ).toEqual({ phase: "qualifying", live: true });
    expect(
      eventStatus({ qualifyingAt: QUALI, raceAt: null, now: new Date("2026-09-13T20:00:00Z") }),
    ).toEqual({ phase: "settling", live: false });
  });

  it("says nothing when the calendar has no times at all", () => {
    expect(
      eventStatus({ qualifyingAt: null, raceAt: null, now: new Date("2026-09-13T13:30:00Z") }),
    ).toBeNull();
  });
});
