import type { FinishClassification } from "./types";

/**
 * Fantasy scoring.
 *
 * The normal driver table follows the official F1 Fantasy game (see
 * docs/game-design-spec.md §10), which is already balanced against real
 * outcomes. The single deliberate deviation is overtakes — see
 * OVERTAKE_POINTS.
 *
 * Two slots do not score points at all and are handled separately: the
 * backmarker slot pays cost cap instead (see `backmarkerBudget`), and the
 * reverse-scored constructor pays on its per-race placing.
 */

/** Qualifying points for P1..P10; nothing below. Exported so the rules page
 * renders the real table rather than a copy that can drift from it. */
export const QUALIFYING_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

/** Race points for P1..P10, matching the real sport. Exported for the rules page. */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/**
 * Sprint points for P1..P8, matching the real sport's smaller table.
 *
 * Roughly a third of the win, which is the right weight: a sprint is a third
 * the distance and cannot be worth as much as the race it precedes.
 */
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

export const FASTEST_LAP_POINTS = 10;
export const DRIVER_OF_THE_DAY_POINTS = 10;

/** Scaled down from the race bonus in proportion to the sprint's points table. */
export const SPRINT_FASTEST_LAP_POINTS = 5;

/**
 * Half the race penalty, matching the official game's own reduction. A sprint
 * retirement costs less because there is less to lose.
 */
export const SPRINT_DNF_PENALTY = -10;

/**
 * Bonuses for surviving each qualifying cut.
 *
 * Reaching Q2 is the one that fills a real gap: it means roughly the top 15,
 * which earns nothing from the position table since that stops at P10. Q3
 * already earns position points, so its bonus is deliberately modest — the two
 * together should not rival a race result.
 */
export const REACHED_Q2_POINTS = 2;
export const REACHED_Q3_POINTS = 5;

/**
 * Beating the driver in the other side of your garage.
 *
 * Same car, same strategy calls, so it is the cleanest available measure of a
 * driver rather than their machinery — which is exactly what a midfield pick
 * needs to be worth something. Small on purpose: a win is worth
 * ${RACE_POINTS[0]}, and beating a teammate should never approach that.
 */
export const TEAMMATE_RACE_POINTS = 3;
export const TEAMMATE_QUALIFYING_POINTS = 2;

/** Applied for a DNF, a non-classification, or a race disqualification. */
export const DNF_PENALTY = -20;

/** Applied when a driver is disqualified from qualifying or sets no time. */
export const QUALIFYING_NO_TIME_PENALTY = -5;

/**
 * Overtakes are divided by this before scoring, rounded down.
 *
 * Every on-track pass is worth a point. Position changes made while the other
 * car was in the pits are already excluded at ingestion, so what is counted
 * here is overtaking done on the road.
 *
 * This is a deliberate choice to score what happened rather than a scaled
 * version of it, and it is a large lever: measured across 2026, a driver's
 * on-track passes run to a median of 9 in a race, 18 at the 90th percentile and
 * 43 at the maximum — so a busy race can out-earn the 25 points for winning
 * one. An earlier version divided by three to keep overtaking below a win.
 *
 * The feed is broader than the broadcast statistic, since it also sees passes
 * on lapped cars, and separating those would need lap-down data no source here
 * provides. If the reward proves too strong, the lever is a per-race cap rather
 * than a divisor, so that each pass still counts as one.
 */
export const OVERTAKE_POINTS = 1;

export interface DriverRaceInput {
  driverId: string;
  /** Final qualifying classification, or null if they did not qualify. */
  qualifyingPosition: number | null;
  /** True when the driver was disqualified from qualifying or set no time. */
  qualifyingNoTime: boolean;
  /** Grid slot actually started from; 0 denotes a pit-lane start. */
  gridPosition: number;
  /** Classified finishing position, or null when not classified. */
  finishPosition: number | null;
  classification: FinishClassification;
  fastestLap: boolean;
  driverOfTheDay: boolean;
  /** On-track overtakes, already filtered for pit-driven position changes. */
  overtakes: number;
  /** Furthest qualifying session reached. Undefined when no qualifying ran. */
  qualifyingReached?: "Q1" | "Q2" | "Q3";
  /**
   * Sprint result, present only on sprint weekends. Absent means no sprint
   * happened — distinct from a sprint the driver failed to finish.
   */
  sprint?: {
    position: number | null;
    classification: FinishClassification;
    fastestLap: boolean;
  };
  /**
   * Teammate comparisons. Undefined when there is nobody to compare against —
   * a one-car entry, or a teammate who did not participate.
   */
  beatTeammateInRace?: boolean;
  beatTeammateInQualifying?: boolean;
}

export interface ScoreBreakdown {
  qualifying: number;
  qualifyingProgress: number;
  race: number;
  sprint: number;
  positionsGained: number;
  overtakes: number;
  fastestLap: number;
  driverOfTheDay: number;
  teammate: number;
  penalties: number;
  total: number;
}

function pointsForPosition(table: readonly number[], position: number | null): number {
  if (position === null || position < 1) return 0;
  return table[position - 1] ?? 0;
}

export function qualifyingPoints(position: number | null): number {
  return pointsForPosition(QUALIFYING_POINTS, position);
}

export function racePoints(position: number | null): number {
  return pointsForPosition(RACE_POINTS, position);
}

/**
 * One point per position gained against the grid, minus one per position lost.
 *
 * Uncapped, matching the official game. Scores nothing for a pit-lane start
 * (grid 0) or an unclassified finish, since neither yields a meaningful delta —
 * a pit-lane start would otherwise read as an enormous gain.
 */
export function positionChangePoints(
  gridPosition: number,
  finishPosition: number | null,
): number {
  if (finishPosition === null || gridPosition < 1) return 0;
  return gridPosition - finishPosition;
}

export function overtakePoints(overtakes: number): number {
  return Math.max(0, overtakes) * OVERTAKE_POINTS;
}

/** True when the driver's race ended in a way the official game penalises. */
function isPenalisedFinish(classification: FinishClassification): boolean {
  return (
    classification === "retired" ||
    classification === "disqualified" ||
    classification === "did-not-start"
  );
}

/**
 * Whether the car actually completed the race as a classified runner.
 *
 * This cannot be inferred from `finishPosition` alone: jolpica assigns a
 * classification number to retirements too (a car that stopped on lap 1 still
 * appears as, say, 22nd). Keying off the position would hand a retiring driver
 * a large "positions lost" penalty on top of the DNF penalty — Leclerc at Monza
 * 2026 scored -19 for places he never lost, plus -20 for the retirement.
 */
function isClassified(classification: FinishClassification): boolean {
  return classification === "finished" || classification === "lapped";
}

/** Points for surviving the qualifying cuts, by the furthest session reached. */
export function qualifyingProgressPoints(
  reached: "Q1" | "Q2" | "Q3" | undefined,
): number {
  if (reached === "Q3") return REACHED_Q3_POINTS;
  if (reached === "Q2") return REACHED_Q2_POINTS;
  return 0;
}

/** Sprint contribution: its own points table, fastest lap and retirement penalty. */
export function sprintScore(sprint: DriverRaceInput["sprint"]): number {
  if (!sprint) return 0;

  const classified = isClassified(sprint.classification);
  const points = classified ? pointsForPosition(SPRINT_POINTS, sprint.position) : 0;
  const fastestLap = sprint.fastestLap ? SPRINT_FASTEST_LAP_POINTS : 0;
  const penalty = isPenalisedFinish(sprint.classification) ? SPRINT_DNF_PENALTY : 0;

  return points + fastestLap + penalty;
}

export function teammatePoints(input: DriverRaceInput): number {
  return (
    (input.beatTeammateInRace ? TEAMMATE_RACE_POINTS : 0) +
    (input.beatTeammateInQualifying ? TEAMMATE_QUALIFYING_POINTS : 0)
  );
}

export function scoreDriver(input: DriverRaceInput): ScoreBreakdown {
  const penalised = isPenalisedFinish(input.classification);
  const classified = isClassified(input.classification);

  const breakdown: ScoreBreakdown = {
    qualifying: qualifyingPoints(input.qualifyingPosition),
    qualifyingProgress: qualifyingProgressPoints(input.qualifyingReached),
    race: classified ? racePoints(input.finishPosition) : 0,
    sprint: sprintScore(input.sprint),
    positionsGained: classified
      ? positionChangePoints(input.gridPosition, input.finishPosition)
      : 0,
    overtakes: overtakePoints(input.overtakes),
    fastestLap: input.fastestLap ? FASTEST_LAP_POINTS : 0,
    driverOfTheDay: input.driverOfTheDay ? DRIVER_OF_THE_DAY_POINTS : 0,
    teammate: teammatePoints(input),
    penalties:
      (penalised ? DNF_PENALTY : 0) +
      (input.qualifyingNoTime ? QUALIFYING_NO_TIME_PENALTY : 0),
    total: 0,
  };

  breakdown.total =
    breakdown.qualifying +
    breakdown.qualifyingProgress +
    breakdown.race +
    breakdown.sprint +
    breakdown.positionsGained +
    breakdown.overtakes +
    breakdown.fastestLap +
    breakdown.driverOfTheDay +
    breakdown.teammate +
    breakdown.penalties;

  return breakdown;
}

/**
 * Cost cap generated by the backmarker slot.
 *
 * This slot scores no points; a worse finish pays more budget, which is what
 * keeps the reverse incentive alive while denominating it in the economy rather
 * than the scoreboard.
 *
 * A retirement pays the same as last place. It used to pay nothing, on the
 * argument that a full payout would make "whoever crashes most" the optimal
 * pick — but paying zero made the slot's own logic run backwards at the
 * bottom: the worse a car did, the more it paid, right up to the point where
 * it did worst of all and paid nothing. The player who picked the right
 * disaster was punished for being too right, and the slot's best outcome was a
 * limping finish rather than the failure it is there to reward.
 *
 * Capping it at the back of the field rather than beyond is what keeps it from
 * being degenerate: a retirement is worth exactly a last place and no more, so
 * a car that reliably finishes 20th is as good a pick as one that reliably
 * breaks, and neither runs away with the round.
 *
 * A disqualification still pays nothing. It is not a bad result, it is a
 * removal from the classification — and unlike a retirement it is usually the
 * team's own doing, so paying for it would put a bounty on a rule breach.
 */
export function backmarkerBudget(
  finishPosition: number | null,
  classification: FinishClassification,
  /** Cars entered this round, which is what "last place" is worth. */
  fieldSize: number,
): number {
  if (classification === "disqualified") return 0;
  if (!isClassified(classification)) return fieldSize;
  return finishPosition ?? fieldSize;
}

export interface ConstructorRaceEntry {
  constructorId: string;
  /** Each of the team's drivers this weekend. */
  finishes: { position: number | null; classification: FinishClassification }[];
}

/**
 * Ranks constructors by how their cars finished this weekend, best first.
 *
 * Ranking is by combined finishing position, with an unclassified car treated
 * as one place worse than the last classified finisher so that retirements hurt
 * without being infinitely bad.
 */
export function rankConstructorsForRace(
  entries: readonly ConstructorRaceEntry[],
  fieldSize: number,
): string[] {
  const unclassified = fieldSize + 1;

  return [...entries]
    .map((entry) => ({
      constructorId: entry.constructorId,
      combined: entry.finishes.reduce(
        (sum, finish) =>
          sum + (finish.position === null ? unclassified : finish.position),
        0,
      ),
    }))
    .sort((a, b) => a.combined - b.combined || (a.constructorId < b.constructorId ? -1 : 1))
    .map((entry) => entry.constructorId);
}

/**
 * Points for the reverse-scored constructor slot.
 *
 * Scored on the per-race ranking rather than championship standing: standings
 * barely move week to week, so a standings-based version would pay nearly the
 * same number every race, making the slot cost budget without involving any
 * live outcome. The worst-placed team pays the most.
 */
export function reverseConstructorPoints(
  constructorId: string,
  raceRanking: readonly string[],
): number {
  const index = raceRanking.indexOf(constructorId);
  return index === -1 ? 0 : index + 1;
}
