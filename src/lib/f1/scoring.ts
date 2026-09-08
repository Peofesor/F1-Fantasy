import type { FinishClassification } from "./types";

/**
 * Fantasy scoring.
 *
 * The normal driver table follows the official F1 Fantasy game (see
 * docs/game-design-spec.md §10), which is already balanced against real
 * outcomes. The single deliberate deviation is overtakes — see
 * OVERTAKE_DIVISOR.
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

export const FASTEST_LAP_POINTS = 10;
export const DRIVER_OF_THE_DAY_POINTS = 10;

/** Applied for a DNF, a non-classification, or a race disqualification. */
export const DNF_PENALTY = -20;

/** Applied when a driver is disqualified from qualifying or sets no time. */
export const QUALIFYING_NO_TIME_PENALTY = -5;

/**
 * Overtakes are divided by this before scoring, rounded down.
 *
 * Our overtake feed counts a broader class of events than the broadcast
 * statistic — passes on lapped cars, pit-cycle position changes, and moves the
 * official stat omits. Measured over 276 driver-races in 2026 the median driver
 * recorded 7 and the maximum 43, so scoring 1:1 would let one race out-earn the
 * 25 points for winning it. Filtering does not close the gap (a held-position
 * filter removes only 13-20%), so the correction is applied here instead.
 */
export const OVERTAKE_DIVISOR = 3;

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
}

export interface ScoreBreakdown {
  qualifying: number;
  race: number;
  positionsGained: number;
  overtakes: number;
  fastestLap: number;
  driverOfTheDay: number;
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
  return Math.floor(Math.max(0, overtakes) / OVERTAKE_DIVISOR);
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

export function scoreDriver(input: DriverRaceInput): ScoreBreakdown {
  const penalised = isPenalisedFinish(input.classification);
  const classified = isClassified(input.classification);

  const breakdown: ScoreBreakdown = {
    qualifying: qualifyingPoints(input.qualifyingPosition),
    race: classified ? racePoints(input.finishPosition) : 0,
    positionsGained: classified
      ? positionChangePoints(input.gridPosition, input.finishPosition)
      : 0,
    overtakes: overtakePoints(input.overtakes),
    fastestLap: input.fastestLap ? FASTEST_LAP_POINTS : 0,
    driverOfTheDay: input.driverOfTheDay ? DRIVER_OF_THE_DAY_POINTS : 0,
    penalties:
      (penalised ? DNF_PENALTY : 0) +
      (input.qualifyingNoTime ? QUALIFYING_NO_TIME_PENALTY : 0),
    total: 0,
  };

  breakdown.total =
    breakdown.qualifying +
    breakdown.race +
    breakdown.positionsGained +
    breakdown.overtakes +
    breakdown.fastestLap +
    breakdown.driverOfTheDay +
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
 * A retirement pays nothing. Paying maximum for a DNF would make "whoever
 * crashes most" the optimal pick, which is degenerate rather than fun.
 */
export function backmarkerBudget(
  finishPosition: number | null,
  classification: FinishClassification,
): number {
  if (finishPosition === null || !isClassified(classification)) return 0;
  return finishPosition;
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
