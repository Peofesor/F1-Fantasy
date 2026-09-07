import { describe, expect, it } from "vitest";
import { buildStandings, pointsByRound, type MemberRoundScore } from "./standings";

const members = ["a", "b", "c"];

const scores: MemberRoundScore[] = [
  { memberId: "a", round: 1, points: 50, duelPoints: 1 },
  { memberId: "b", round: 1, points: 40, duelPoints: 0 },
  { memberId: "a", round: 2, points: 30, duelPoints: 0 },
  { memberId: "b", round: 2, points: 60, duelPoints: 1 },
];

describe("buildStandings", () => {
  it("ranks a duel league on match points, not fantasy points", () => {
    const table = buildStandings(
      members,
      [
        { memberId: "a", round: 1, points: 10, duelPoints: 1 },
        { memberId: "b", round: 1, points: 500, duelPoints: 0 },
      ],
      "duel",
    );
    // b scored far more but lost the head-to-head.
    expect(table[0].memberId).toBe("a");
  });

  it("ranks a free-for-all league on fantasy points", () => {
    const table = buildStandings(
      members,
      [
        { memberId: "a", round: 1, points: 10, duelPoints: 1 },
        { memberId: "b", round: 1, points: 500, duelPoints: 0 },
      ],
      "free_for_all",
    );
    expect(table[0].memberId).toBe("b");
  });

  it("breaks a duel tie on cumulative fantasy points", () => {
    const table = buildStandings(
      ["a", "b"],
      [
        { memberId: "a", round: 1, points: 90, duelPoints: 1 },
        { memberId: "b", round: 1, points: 10, duelPoints: 1 },
      ],
      "duel",
    );
    expect(table[0].memberId).toBe("a");
  });

  it("counts wins, draws and losses", () => {
    const table = buildStandings(
      ["a", "b"],
      [
        { memberId: "a", round: 1, points: 10, duelPoints: 1 },
        { memberId: "a", round: 2, points: 10, duelPoints: 0.5 },
        { memberId: "a", round: 3, points: 10, duelPoints: 0 },
      ],
      "duel",
    );
    const a = table.find((row) => row.memberId === "a")!;
    expect([a.wins, a.draws, a.losses]).toEqual([1, 1, 1]);
    expect(a.duelPoints).toBeCloseTo(1.5, 1);
  });

  it("includes members who have not scored, rather than hiding them", () => {
    const table = buildStandings(members, scores, "duel");
    const c = table.find((row) => row.memberId === "c");
    expect(c).toBeDefined();
    expect(c?.points).toBe(0);
    expect(c?.roundsPlayed).toBe(0);
  });

  it("accumulates points and rounds played", () => {
    const table = buildStandings(members, scores, "free_for_all");
    const a = table.find((row) => row.memberId === "a")!;
    expect(a.points).toBeCloseTo(80, 1);
    expect(a.roundsPlayed).toBe(2);
  });

  it("records the best single round", () => {
    const table = buildStandings(members, scores, "free_for_all");
    expect(table.find((row) => row.memberId === "b")?.bestRound).toBe(60);
  });

  it("assigns positions from 1 upward", () => {
    const table = buildStandings(members, scores, "free_for_all");
    expect(table.map((row) => row.position)).toEqual([1, 2, 3]);
  });

  it("does not count duel results in a free-for-all league", () => {
    const table = buildStandings(members, scores, "free_for_all");
    expect(table.every((row) => row.wins === 0 && row.losses === 0)).toBe(true);
  });

  it("ignores scores for members not in the league", () => {
    const table = buildStandings(["a"], [{ memberId: "ghost", round: 1, points: 99, duelPoints: 1 }], "duel");
    expect(table).toHaveLength(1);
    expect(table[0].points).toBe(0);
  });

  it("is deterministic when everything ties", () => {
    const table = buildStandings(["b", "a"], [], "duel");
    expect(table.map((row) => row.memberId)).toEqual(["a", "b"]);
  });
});

describe("pointsByRound", () => {
  it("indexes each member's score by round", () => {
    const byMember = pointsByRound(scores);
    expect(byMember.get("a")?.get(1)).toBe(50);
    expect(byMember.get("b")?.get(2)).toBe(60);
  });
});
