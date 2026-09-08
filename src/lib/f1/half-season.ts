/**
 * Splitting a season at the summer break.
 *
 * Chip allowances are granted per half so a member cannot spend a season's
 * worth of chips in the opening months and coast; the break is where the sport
 * itself draws the line, so it is the line players already have in their heads.
 *
 * Found from the calendar rather than hard-coded to a month. The break moves
 * year to year, and a fixed date would silently misplace it the first season it
 * shifted — which is exactly the kind of error nobody notices until an
 * allowance resets a fortnight early.
 */

export interface SeasonRound {
  round: number;
  /** ISO date of the race. */
  raceDate: string;
}

export type SeasonHalf = "first" | "second";

/** How much of a season at each end is too early or late to be the break. */
const EDGE_FRACTION = 0.2;

/**
 * The first round after the longest mid-season gap.
 *
 * The longest gap in the whole calendar is not reliably the summer break. The
 * real 2026 season opens with a 35-day wait before Miami — a flyaway transfer
 * in May — while the actual break is the 28 days before Zandvoort in round 12.
 * Taking the longest gap outright put the split in round 4 and would have
 * granted a season's second allowance before May.
 *
 * So the search skips the outer fifth at each end, where a long wait is a
 * shipping gap rather than a shutdown. Returning the round *after* the gap
 * means the second half opens with a race rather than with the wait.
 *
 * Null when there is nothing to split: a season not yet published, or one whose
 * gaps are all alike, which is not a season with a break in it.
 */
export function summerBreakRound(rounds: readonly SeasonRound[]): number | null {
  const ordered = [...rounds].sort((a, b) => a.round - b.round);
  if (ordered.length < 6) return null;

  const edge = Math.max(1, Math.floor(ordered.length * EDGE_FRACTION));
  let widest = { gapDays: 0, round: null as number | null };

  for (let index = edge; index < ordered.length - edge + 1; index++) {
    const gapDays =
      (Date.parse(ordered[index].raceDate) - Date.parse(ordered[index - 1].raceDate)) / 86_400_000;
    if (!Number.isFinite(gapDays)) continue;
    if (gapDays > widest.gapDays) widest = { gapDays, round: ordered[index].round };
  }

  // A break is a break because it stands out. Under three weeks this is just
  // the calendar breathing, and splitting there would be arbitrary.
  return widest.gapDays >= 21 ? widest.round : null;
}

/** Which half of the season a round belongs to. */
export function halfOf(round: number, breakRound: number | null): SeasonHalf {
  if (breakRound === null) return "first";
  return round < breakRound ? "first" : "second";
}
