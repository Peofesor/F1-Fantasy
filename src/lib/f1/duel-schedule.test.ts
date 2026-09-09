import { describe, expect, it } from "vitest";
import { fixtureCounts, generateDuelSchedule, pairingCounts } from "./duel-schedule";

const rounds = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

describe("generateDuelSchedule", () => {
  it("pairs everyone exactly once over a full cycle with an even league", () => {
    const members = ["a", "b", "c", "d"];
    // Four members complete a round robin in three rounds.
    const fixtures = generateDuelSchedule(members, rounds(3));

    expect(fixtures).toHaveLength(6);
    for (const count of pairingCounts(fixtures).values()) {
      expect(count).toBe(1);
    }
  });

  it("gives every member the same number of games when the league is even", () => {
    const fixtures = generateDuelSchedule(["a", "b", "c", "d"], rounds(3));
    expect([...fixtureCounts(fixtures).values()]).toEqual([3, 3, 3, 3]);
  });

  it("never pairs a member with themselves", () => {
    const fixtures = generateDuelSchedule(["a", "b", "c", "d", "e"], rounds(20));
    for (const fixture of fixtures) {
      expect(fixture.homeMemberId).not.toBe(fixture.awayMemberId);
    }
  });

  it("sits exactly one member out each round when the league is odd", () => {
    const members = ["a", "b", "c", "d", "e"];
    const fixtures = generateDuelSchedule(members, rounds(5));

    for (const round of rounds(5)) {
      const inRound = fixtures.filter((fixture) => fixture.round === round);
      expect(inRound).toHaveLength(2); // five members, two matches, one bye
      const playing = new Set(inRound.flatMap((f) => [f.homeMemberId, f.awayMemberId]));
      expect(playing.size).toBe(4);
    }
  });

  it("rotates the bye so nobody sits out twice before everyone has once", () => {
    const members = ["a", "b", "c", "d", "e"];
    const fixtures = generateDuelSchedule(members, rounds(5));
    // Over one full cycle each member plays four of the five rounds.
    expect([...fixtureCounts(fixtures).values()]).toEqual([4, 4, 4, 4, 4]);
  });

  it("repeats the cycle for a season longer than one round robin", () => {
    const fixtures = generateDuelSchedule(["a", "b", "c", "d"], rounds(6));
    expect(fixtures).toHaveLength(12);
    // Two complete cycles: every pairing occurs exactly twice.
    for (const count of pairingCounts(fixtures).values()) {
      expect(count).toBe(2);
    }
  });

  it("alternates orientation between cycles rather than repeating it", () => {
    const first = generateDuelSchedule(["a", "b", "c", "d"], rounds(3));
    const both = generateDuelSchedule(["a", "b", "c", "d"], rounds(6));
    const second = both.slice(first.length);

    const asString = (f: { homeMemberId: string; awayMemberId: string }) =>
      `${f.homeMemberId}>${f.awayMemberId}`;

    // The same pairings recur, but not all with the same member at home.
    expect(second.map(asString)).not.toEqual(first.map(asString));
  });

  it("returns nothing for a league too small to pair", () => {
    expect(generateDuelSchedule(["solo"], rounds(5))).toEqual([]);
    expect(generateDuelSchedule([], rounds(5))).toEqual([]);
  });

  it("returns nothing when the season has no rounds", () => {
    expect(generateDuelSchedule(["a", "b"], [])).toEqual([]);
  });

  it("uses the round numbers it was given rather than assuming 1..n", () => {
    // A league created mid-season schedules only the rounds that remain.
    const fixtures = generateDuelSchedule(["a", "b"], [14, 15, 16]);
    expect(fixtures.map((f) => f.round)).toEqual([14, 15, 16]);
  });

  it("schedules a two-member league every round", () => {
    const fixtures = generateDuelSchedule(["a", "b"], rounds(4));
    expect(fixtures).toHaveLength(4);
    expect([...fixtureCounts(fixtures).values()]).toEqual([4, 4]);
  });
});

describe("everyone plays every week", () => {
  /**
   * The property the format rests on, checked across league sizes rather than
   * at one of them: a round pairs every member, and the only member without a
   * game is the one an odd count leaves over.
   */
  it("leaves nobody idle except the odd one out, at any league size", () => {
    const rounds = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

    for (let size = 2; size <= 9; size++) {
      const members = Array.from({ length: size }, (_, index) => `m${index}`);
      const fixtures = generateDuelSchedule(members, rounds);
      const expectedIdle = size % 2 === 1 ? 1 : 0;

      for (const round of rounds) {
        const playing = new Set<string>();
        for (const fixture of fixtures.filter((entry) => entry.round === round)) {
          playing.add(fixture.homeMemberId);
          playing.add(fixture.awayMemberId);
        }

        const idle = members.filter((member) => !playing.has(member));
        expect(idle.length, `size ${size}, round ${round}: ${idle.join(",")} idle`).toBe(
          expectedIdle,
        );

        // And nobody is scheduled twice in the same weekend, which the pairing
        // count alone would not catch.
        const scheduled = fixtures.filter((entry) => entry.round === round).length * 2;
        expect(scheduled, `size ${size}, round ${round}`).toBe(playing.size);
      }
    }
  });
});
