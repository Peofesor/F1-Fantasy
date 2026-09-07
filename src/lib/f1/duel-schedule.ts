/**
 * Duel fixture generation.
 *
 * The season's pairings are generated once, at season start, and then fixed
 * (spec §3) — not redrawn each week. A fixed schedule means a player can see
 * who they face later in the season, and it removes any suspicion about how a
 * given week's opponent was chosen.
 *
 * Uses the circle method: one member is held still while the rest rotate around
 * them, which produces a full round robin in n-1 rounds with everyone meeting
 * everyone exactly once. Seasons run longer than that, so the cycle repeats.
 */

export interface DuelFixture {
  round: number;
  homeMemberId: string;
  awayMemberId: string;
}

/** Stands in for the absent member when the league has an odd size. */
const BYE = Symbol("bye");

type Seat = string | typeof BYE;

/**
 * Builds the fixture list for a season.
 *
 * With an odd number of members one sits out each round, rotating so nobody
 * sits out twice before everyone has once. A league of fewer than two members
 * produces no fixtures rather than an error — a solo league is legal, it simply
 * has nothing to schedule.
 *
 * Home and away alternate across repeats of the cycle so that a pairing does
 * not always fall the same way round. Nothing in scoring currently depends on
 * which side a member is, but a fixture list that always reads the same way
 * looks broken.
 */
export function generateDuelSchedule(
  memberIds: readonly string[],
  rounds: readonly number[],
): DuelFixture[] {
  if (memberIds.length < 2 || rounds.length === 0) return [];

  const seats: Seat[] = [...memberIds];
  if (seats.length % 2 === 1) seats.push(BYE);

  const seatCount = seats.length;
  const pairsPerRound = seatCount / 2;
  const cycleLength = seatCount - 1;

  // The first seat stays put; the remainder rotate around it.
  const fixed = seats[0];
  let rotating = seats.slice(1);

  const fixtures: DuelFixture[] = [];

  rounds.forEach((round, roundIndex) => {
    const arrangement: Seat[] = [fixed, ...rotating];
    // Alternate orientation each time the cycle comes round again.
    const flip = Math.floor(roundIndex / cycleLength) % 2 === 1;

    for (let pair = 0; pair < pairsPerRound; pair++) {
      const left = arrangement[pair];
      const right = arrangement[seatCount - 1 - pair];

      // The member drawn against BYE sits this round out.
      if (left === BYE || right === BYE) continue;

      // Alternate within the round too, so the held-still seat is not always
      // at home.
      const homeFirst = pair % 2 === 0 ? !flip : flip;

      fixtures.push({
        round,
        homeMemberId: homeFirst ? left : right,
        awayMemberId: homeFirst ? right : left,
      });
    }

    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  });

  return fixtures;
}

/** How many rounds each member is scheduled to play. */
export function fixtureCounts(fixtures: readonly DuelFixture[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    counts.set(fixture.homeMemberId, (counts.get(fixture.homeMemberId) ?? 0) + 1);
    counts.set(fixture.awayMemberId, (counts.get(fixture.awayMemberId) ?? 0) + 1);
  }
  return counts;
}

/**
 * How often each pairing occurs, keyed by the two members sorted so that a
 * meeting counts the same whichever way round it was scheduled.
 */
export function pairingCounts(fixtures: readonly DuelFixture[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fixture of fixtures) {
    const key = [fixture.homeMemberId, fixture.awayMemberId].sort().join("|");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
