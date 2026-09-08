import { describe, expect, it } from "vitest";
import { halfOf, summerBreakRound, type SeasonRound } from "./half-season";

/** A season with a four-week gap after round 4. */
const withBreak: SeasonRound[] = [
  { round: 1, raceDate: "2026-03-08" },
  { round: 2, raceDate: "2026-03-22" },
  { round: 3, raceDate: "2026-04-05" },
  { round: 4, raceDate: "2026-04-19" },
  { round: 5, raceDate: "2026-05-24" },
  { round: 6, raceDate: "2026-06-07" },
];

describe("summerBreakRound", () => {
  it("finds the round that comes after the longest gap", () => {
    expect(summerBreakRound(withBreak)).toBe(5);
  });

  it("does not care what order the rounds arrive in", () => {
    expect(summerBreakRound([...withBreak].reverse())).toBe(5);
  });

  it("refuses to split an evenly spaced season", () => {
    // Every gap two weeks: there is no break, and picking one would be
    // arbitrary rather than meaningful.
    const even = withBreak.map((round, index) => ({
      round: index + 1,
      raceDate: new Date(Date.UTC(2026, 2, 8 + index * 14)).toISOString().slice(0, 10),
    }));
    expect(summerBreakRound(even)).toBeNull();
  });

  it("returns null for a season too short to have halves", () => {
    expect(summerBreakRound(withBreak.slice(0, 3))).toBeNull();
  });

  it("ignores a gap under three weeks", () => {
    const tight: SeasonRound[] = [
      { round: 1, raceDate: "2026-03-08" },
      { round: 2, raceDate: "2026-03-22" },
      { round: 3, raceDate: "2026-04-05" },
      { round: 4, raceDate: "2026-04-24" },
    ];
    expect(summerBreakRound(tight)).toBeNull();
  });
});

describe("halfOf", () => {
  it("puts rounds before the break in the first half", () => {
    expect(halfOf(4, 5)).toBe("first");
    expect(halfOf(1, 5)).toBe("first");
  });

  it("puts the break round itself in the second half", () => {
    // The second half opens with a race, not with the wait before it.
    expect(halfOf(5, 5)).toBe("second");
    expect(halfOf(9, 5)).toBe("second");
  });

  it("treats a season with no break as one half", () => {
    expect(halfOf(20, null)).toBe("first");
  });
});
