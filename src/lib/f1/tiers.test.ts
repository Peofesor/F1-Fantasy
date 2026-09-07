import { describe, expect, it } from "vitest";
import {
  assignTiers,
  buildSeedRanks,
  orderDrivers,
  rollingWindowPoints,
  tierSwaps,
  type RoundPoints,
  type Tier,
} from "./tiers";

function points(
  season: number,
  round: number,
  scores: Record<string, number>,
): RoundPoints[] {
  return Object.entries(scores).map(([driverId, value]) => ({
    season,
    round,
    driverId,
    points: value,
  }));
}

describe("rollingWindowPoints", () => {
  it("sums only the most recent weekends within the window", () => {
    const entries = [
      ...points(2026, 1, { norris: 25 }),
      ...points(2026, 2, { norris: 18 }),
      ...points(2026, 3, { norris: 15 }),
    ];
    // Window of 2 covers rounds 2 and 3 only.
    expect(rollingWindowPoints(entries, { season: 2026, round: 3 }, 2).get("norris")).toBe(33);
  });

  it("ignores weekends after the cutoff", () => {
    const entries = [
      ...points(2026, 1, { norris: 25 }),
      ...points(2026, 2, { norris: 18 }),
    ];
    expect(rollingWindowPoints(entries, { season: 2026, round: 1 }, 5).get("norris")).toBe(25);
  });

  it("carries the window across a season boundary", () => {
    // This is what removes the round-one special case: at the start of a
    // season the window still contains the end of the previous one.
    const entries = [
      ...points(2025, 23, { norris: 10 }),
      ...points(2025, 24, { norris: 12 }),
      ...points(2026, 1, { norris: 25 }),
    ];
    const totals = rollingWindowPoints(entries, { season: 2026, round: 1 }, 3);
    expect(totals.get("norris")).toBe(47);
  });

  it("copes with fewer weekends available than the window size", () => {
    const entries = points(2026, 1, { norris: 25 });
    expect(rollingWindowPoints(entries, { season: 2026, round: 1 }, 5).get("norris")).toBe(25);
  });

  it("omits drivers who scored in no weekend in the window", () => {
    const entries = [
      ...points(2026, 1, { norris: 25 }),
      ...points(2026, 2, { piastri: 18 }),
    ];
    const totals = rollingWindowPoints(entries, { season: 2026, round: 2 }, 1);
    expect(totals.has("norris")).toBe(false);
    expect(totals.get("piastri")).toBe(18);
  });
});

describe("buildSeedRanks", () => {
  const teamByDriver = new Map([
    ["norris", "mclaren"],
    ["lindblad", "red_bull"],
    ["newcomer", "unknown_team"],
  ]);

  const priorDrivers = [{ driverId: "norris", position: 2 }];
  const priorConstructors = [
    { constructorId: "mclaren", position: 1 },
    { constructorId: "red_bull", position: 4 },
  ];

  it("seeds an established driver from their championship position", () => {
    const seeds = buildSeedRanks(priorDrivers, priorConstructors, teamByDriver);
    expect(seeds.get("norris")).toBe(2);
  });

  it("seeds a rookie from their team rather than dumping them last", () => {
    // A rookie in the 4th-best car seeds around 8th — inside the top bracket,
    // so players cannot buy a quick car at backmarker prices.
    const seeds = buildSeedRanks(priorDrivers, priorConstructors, teamByDriver);
    expect(seeds.get("lindblad")).toBe(8);
  });

  it("places a driver on an unknown team last but deterministically", () => {
    const seeds = buildSeedRanks(priorDrivers, priorConstructors, teamByDriver);
    expect(seeds.get("newcomer")).toBeGreaterThan(seeds.get("lindblad")!);
  });

  it("ignores unranked prior standings entries", () => {
    // Anyone on zero points has no position at all in the upstream data.
    const seeds = buildSeedRanks(
      [{ driverId: "norris", position: null }],
      priorConstructors,
      new Map([["norris", "mclaren"]]),
    );
    expect(seeds.get("norris")).toBe(2); // falls back to team rank 1 * 2
  });
});

describe("orderDrivers", () => {
  it("ranks by points before anything else", () => {
    const order = orderDrivers(
      ["a", "b"],
      new Map([
        ["a", 10],
        ["b", 20],
      ]),
      new Map([
        ["a", 1],
        ["b", 20],
      ]),
    );
    expect(order).toEqual(["b", "a"]);
  });

  it("breaks a points tie by seed", () => {
    const order = orderDrivers(
      ["a", "b"],
      new Map([
        ["a", 10],
        ["b", 10],
      ]),
      new Map([
        ["a", 5],
        ["b", 2],
      ]),
    );
    expect(order).toEqual(["b", "a"]);
  });

  it("sorts drivers with no points below every scorer", () => {
    const order = orderDrivers(
      ["scorer", "blank"],
      new Map([["scorer", 1]]),
      new Map([["blank", 1]]),
    );
    expect(order).toEqual(["scorer", "blank"]);
  });

  it("is deterministic when points and seed both tie", () => {
    const order = orderDrivers(["b", "a"], new Map(), new Map());
    expect(order).toEqual(["a", "b"]);
  });
});

describe("assignTiers", () => {
  const drivers = Array.from({ length: 12 }, (_, index) => `d${String(index).padStart(2, "0")}`);
  const scores = new Map(drivers.map((id, index) => [id, 100 - index]));

  it("puts exactly the top 8 in the top bracket", () => {
    const tiers = assignTiers(drivers, scores, new Map());
    const top = [...tiers.entries()].filter(([, tier]) => tier === "top");
    expect(top).toHaveLength(8);
    expect(tiers.get("d00")).toBe("top");
    expect(tiers.get("d07")).toBe("top");
    expect(tiers.get("d08")).toBe("mid");
  });

  it("assigns every driver a tier", () => {
    const tiers = assignTiers(drivers, scores, new Map());
    expect(tiers.size).toBe(drivers.length);
  });

  it("still fills the bracket when nobody has scored", () => {
    // Round one of a season with no prior data at all: seeds alone decide.
    const seeds = new Map(drivers.map((id, index) => [id, index + 1]));
    const tiers = assignTiers(drivers, new Map(), seeds);
    expect(tiers.get("d00")).toBe("top");
    expect(tiers.get("d11")).toBe("mid");
  });
});

describe("tierSwaps", () => {
  it("pairs a demotion with the promotion that displaced it", () => {
    expect(tierSwaps(["a", "b", "c"], ["a", "c", "b"], 2)).toEqual([
      { demoted: "b", promoted: "c" },
    ]);
  });

  it("returns nothing when no bracket changed", () => {
    expect(tierSwaps(["a", "b", "c"], ["b", "a", "c"], 2)).toEqual([]);
  });

  it("ignores a driver absent from the previous ordering", () => {
    // A mid-season debutant displaces nobody: they had no bracket to leave.
    expect(tierSwaps(["a", "b"], ["a", "newbie", "b"], 2)).toEqual([]);
  });

  it("pairs multiple simultaneous swaps by rank, not alphabetically", () => {
    // "d" ranks above "c" after the change, so it takes the higher slot and
    // pairs with "a", the higher-ranked driver leaving. Alphabetical pairing
    // would wrongly give "c" to "a".
    const before = ["a", "b", "c", "d"];
    const after = ["d", "c", "a", "b"];
    expect(tierSwaps(before, after, 2)).toEqual([
      { demoted: "a", promoted: "d" },
      { demoted: "b", promoted: "c" },
    ]);
  });

  it("pairs the highest departing driver with the highest arriving one", () => {
    const before = ["a", "b", "c", "x", "y"];
    const after = ["a", "x", "y", "b", "c"];
    expect(tierSwaps(before, after, 3)).toEqual([
      { demoted: "b", promoted: "x" },
      { demoted: "c", promoted: "y" },
    ]);
  });
});
