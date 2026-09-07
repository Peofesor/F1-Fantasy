/**
 * League standings.
 *
 * The two modes rank on different things, which is why the mode is fixed for
 * the season: duel leagues rank on match points won, free-for-all on cumulative
 * fantasy points. Ranking a season that switched halfway would be meaningless.
 */

export type LeagueMode = "duel" | "free_for_all";

export interface MemberRoundScore {
  memberId: string;
  round: number;
  points: number;
  duelPoints: number;
}

export interface StandingRow {
  memberId: string;
  position: number;
  /** Cumulative fantasy points across the season. */
  points: number;
  /** Duel match points. Always 0 in free-for-all. */
  duelPoints: number;
  wins: number;
  draws: number;
  losses: number;
  roundsPlayed: number;
  /** Best single-round score, which the table shows as a tiebreak-ish flourish. */
  bestRound: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Builds the table.
 *
 * Duel leagues rank on match points, with cumulative fantasy points as the
 * tiebreak: two members on the same record are separated by who scored more
 * overall, which is a fairer split than an arbitrary one and needs no extra
 * data. Free-for-all ranks on fantasy points directly.
 *
 * Members with no scored rounds still appear, on zero. A standings table that
 * omits people who have not scored hides who is actually in the league.
 */
export function buildStandings(
  memberIds: readonly string[],
  scores: readonly MemberRoundScore[],
  mode: LeagueMode,
): StandingRow[] {
  const byMember = new Map<string, StandingRow>(
    memberIds.map((memberId) => [
      memberId,
      {
        memberId,
        position: 0,
        points: 0,
        duelPoints: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        roundsPlayed: 0,
        bestRound: 0,
      },
    ]),
  );

  for (const score of scores) {
    const row = byMember.get(score.memberId);
    if (!row) continue;

    row.points = round1(row.points + score.points);
    row.duelPoints = round1(row.duelPoints + score.duelPoints);
    row.roundsPlayed++;
    row.bestRound = Math.max(row.bestRound, score.points);

    if (mode === "duel") {
      if (score.duelPoints === 1) row.wins++;
      else if (score.duelPoints === 0.5) row.draws++;
      else row.losses++;
    }
  }

  const ranked = [...byMember.values()].sort((a, b) => {
    if (mode === "duel" && b.duelPoints !== a.duelPoints) {
      return b.duelPoints - a.duelPoints;
    }
    if (b.points !== a.points) return b.points - a.points;
    // Last resort, so the order never depends on how rows arrived.
    return a.memberId < b.memberId ? -1 : 1;
  });

  ranked.forEach((row, index) => {
    row.position = index + 1;
  });

  return ranked;
}

/** Season-long fantasy points per round, for a chart or sparkline. */
export function pointsByRound(
  scores: readonly MemberRoundScore[],
): Map<string, Map<number, number>> {
  const byMember = new Map<string, Map<number, number>>();
  for (const score of scores) {
    const rounds = byMember.get(score.memberId) ?? new Map<number, number>();
    rounds.set(score.round, score.points);
    byMember.set(score.memberId, rounds);
  }
  return byMember;
}
