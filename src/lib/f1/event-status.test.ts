import { describe, expect, it } from "vitest";

import {
  eventStatus,
  openingRound,
  QUALIFYING_WINDOW_MS,
  RACE_WINDOW_MS,
  timeUntil,
} from "./event-status";

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

describe("openingRound", () => {
  // Two grands prix a fortnight apart: the one just run, and the one being
  // picked for.
  const current = { round: 16, qualifyingAt: QUALI, raceAt: RACE, status: null };
  const upcoming = {
    round: 17,
    qualifyingAt: "2026-09-26T14:00:00Z",
    raceAt: "2026-09-27T13:00:00Z",
  };

  const on = (iso: string) => openingRound({ current, upcoming, now: new Date(iso) });

  it("stays on the weekend just run while it is the nearer of the two", () => {
    expect(on("2026-09-14T09:00:00Z")).toBe(16);
    expect(on("2026-09-17T09:00:00Z")).toBe(16);
  });

  it("moves on once the next qualifying is closer than the last race", () => {
    // The midpoint falls on the Sunday between them; a day past it the round
    // everyone is picking for is the nearer.
    expect(on("2026-09-21T09:00:00Z")).toBe(17);
    expect(on("2026-09-25T09:00:00Z")).toBe(17);
  });

  it("never gives up a weekend still running", () => {
    // The arithmetic is irrelevant here — this is the one moment the card has
    // a live session to report.
    const running = { ...current, status: { phase: "race", live: true } as const };
    expect(
      openingRound({ current: running, upcoming, now: new Date("2026-09-13T13:30:00Z") }),
    ).toBe(16);
  });

  it("has an answer when only one of the two exists", () => {
    const now = new Date("2026-09-20T09:00:00Z");
    expect(openingRound({ current, upcoming: null, now })).toBe(16);
    expect(openingRound({ current: null, upcoming, now })).toBe(17);
    expect(openingRound({ current: null, upcoming: null, now })).toBeUndefined();
  });

  it("stays put rather than guessing when the next round has no dates", () => {
    // A calendar row without session times says nothing about how near it is,
    // and the arrow still reaches it.
    const undated = { round: 17, qualifyingAt: null, raceAt: null };
    expect(
      openingRound({ current, upcoming: undated, now: new Date("2026-09-25T09:00:00Z") }),
    ).toBe(16);
  });
});

describe("timeUntil", () => {
  const now = new Date("2026-09-12T12:00:00Z");

  it("counts down in the coarsest useful terms", () => {
    expect(timeUntil("2026-09-12T12:45:00Z", now)).toBe("45 min");
    expect(timeUntil("2026-09-12T16:30:00Z", now)).toBe("4h 30m");
    expect(timeUntil("2026-09-12T16:00:00Z", now)).toBe("4h");
    expect(timeUntil("2026-09-18T20:00:00Z", now)).toBe("6d 8h");
    expect(timeUntil("2026-09-19T12:00:00Z", now)).toBe("7d");
  });

  it("says nothing about an instant that has passed", () => {
    // The phase headings own the weekend from here, and a negative countdown
    // reads as a bug.
    expect(timeUntil("2026-09-12T12:00:00Z", now)).toBeNull();
    expect(timeUntil("2026-09-12T11:00:00Z", now)).toBeNull();
    expect(timeUntil(null, now)).toBeNull();
  });

  it("rounds the last minute down to words", () => {
    expect(timeUntil("2026-09-12T12:00:30Z", now)).toBe("under a minute");
  });
});
