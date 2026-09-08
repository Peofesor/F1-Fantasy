/**
 * The league's season, shaped for plotting.
 *
 * Points and cost cap are deliberately kept as two separate series lists rather
 * than one combined row. They are different measures on different scales — a
 * season total runs to thousands while a bank sits under a hundred — and the
 * chart draws them as two panels sharing an x-axis for exactly that reason.
 * Putting them on one pair of axes would need a second y-scale, which makes any
 * crossing point look meaningful when it is an artefact of the scaling.
 */

export interface RoundScoreRow {
  memberId: string;
  round: number;
  points: number;
}

export interface LedgerRow {
  memberId: string;
  round: number;
  amount: number;
}

export interface StatsPoint {
  round: number;
  /** Points accumulated up to and including this round. */
  points: number;
  /** Cost cap held after this round's ledger entries. */
  cap: number;
}

export interface MemberSeries {
  memberId: string;
  name: string;
  points: StatsPoint[];
  /** Where they finished: total points, for ordering the legend. */
  total: number;
}

/**
 * Builds one running series per member.
 *
 * Both measures are cumulative by nature — points add up and the ledger is a
 * balance — so a member with no entry in a round holds their previous value
 * rather than dropping to zero. Plotting the gap as zero would draw a cliff
 * every time somebody skipped a week.
 */
export function buildLeagueStats(
  members: { id: string; name: string }[],
  scores: readonly RoundScoreRow[],
  ledger: readonly LedgerRow[],
): MemberSeries[] {
  const rounds = [
    ...new Set([...scores.map((row) => row.round), ...ledger.map((row) => row.round)]),
  ].sort((a, b) => a - b);

  return members
    .map((member) => {
      const ownScores = new Map(
        scores.filter((row) => row.memberId === member.id).map((row) => [row.round, row.points]),
      );

      const ownLedger = new Map<number, number>();
      for (const row of ledger) {
        if (row.memberId !== member.id) continue;
        ownLedger.set(row.round, (ownLedger.get(row.round) ?? 0) + row.amount);
      }

      let points = 0;
      let cap = 0;
      const series: StatsPoint[] = rounds.map((round) => {
        points += ownScores.get(round) ?? 0;
        cap += ownLedger.get(round) ?? 0;
        return { round, points, cap: Math.round(cap * 10) / 10 };
      });

      return {
        memberId: member.id,
        name: member.name,
        points: series,
        total: points,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** The span a panel has to cover, padded so the top line is not on the frame. */
export function domainOf(series: MemberSeries[], key: "points" | "cap"): [number, number] {
  const values = series.flatMap((member) => member.points.map((point) => point[key]));
  if (values.length === 0) return [0, 1];

  const low = Math.min(0, ...values);
  const high = Math.max(...values);
  // A flat series would otherwise divide by zero when scaled.
  return high === low ? [low, low + 1] : [low, high];
}
