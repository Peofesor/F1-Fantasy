/**
 * Domain types for ingested F1 data.
 *
 * These are deliberately independent of the shape either upstream API returns.
 * jolpica and OpenF1 disagree about identifiers (jolpica keys drivers by a
 * string `driverId` like "max_verstappen"; OpenF1 keys them by car number), so
 * the transforms in this directory are responsible for mapping both onto these
 * types.
 */

/** A single race weekend, identified the way jolpica identifies it. */
export interface RoundRef {
  season: number;
  /** 1-based round number within the season. */
  round: number;
}

export type QualifyingSession = "Q1" | "Q2" | "Q3";

export interface QualifyingEntry {
  driverId: string;
  constructorId: string;
  /** Final qualifying classification (1-based). */
  position: number;
  /** Lap times as reported, e.g. "1:21.786". Absent if the session wasn't reached. */
  q1: string | null;
  q2: string | null;
  q3: string | null;
  /**
   * Furthest session the driver took part in. Drivers eliminated in Q1 have
   * "Q1"; drivers who made the top-10 shootout have "Q3".
   */
  highestSessionReached: QualifyingSession;
  /**
   * True when the driver appeared in qualifying but set no lap time at all.
   * The official game penalises this (-5), so it needs to survive ingestion
   * rather than being flattened into "no Q1 time".
   */
  setNoTime: boolean;
}

/**
 * Why a driver's race ended. jolpica reports a wide range of free-text statuses
 * ("Finished", "+1 Lap", "Accident", "Disqualified", ...); we keep the raw
 * string and additionally classify it, because scoring only cares about the
 * classification while auditing wants the original.
 */
export type FinishClassification =
  | "finished"
  | "lapped"
  | "retired"
  | "did-not-start"
  | "disqualified";

export interface RaceResultEntry {
  driverId: string;
  constructorId: string;
  /** Classified finishing position (1-based). Null for a non-classified entry. */
  position: number | null;
  /** Grid slot the driver actually started from. 0 in jolpica means a pit-lane start. */
  gridPosition: number;
  /** Championship points awarded by the real sport (not fantasy points). */
  points: number;
  status: string;
  classification: FinishClassification;
  /** 1 when this driver set the fastest lap of the race. */
  fastestLapRank: number | null;
}

export interface StandingEntry {
  /** Set for driver standings, null for constructor standings. */
  driverId: string | null;
  /** Always set: a driver's constructor, or the constructor itself. */
  constructorId: string;
  /**
   * Championship position, or null when unranked.
   *
   * Anyone on zero points is unranked rather than being given a joint last
   * place. That is the whole field before the season's first points are scored,
   * which matters for tier assignment: standings cannot order drivers at round
   * one, so the previous season's final standings have to seed it.
   */
  position: number | null;
  points: number;
  wins: number;
}

export interface LapTiming {
  driverId: string;
  lap: number;
  position: number;
}

/**
 * One overtake as reported by OpenF1.
 *
 * Per the settlement rule agreed in the design spec (§8), overtakes are counted
 * from this feed with pit-stop-driven position changes filtered out, and the
 * resulting figure is the house definition — it is not expected to match the
 * number shown on the F1 broadcast.
 */
export interface Overtake {
  overtakingDriverNumber: number;
  overtakenDriverNumber: number;
  at: Date;
  /** Track position the overtaking driver held after the pass. */
  position: number;
}

export interface PitStop {
  driverId: string | null;
  driverNumber: number | null;
  lap: number;
  /**
   * When the stop was recorded. OpenF1 supplies a full timestamp; jolpica only
   * reports a local time-of-day with no date, so it leaves this null. The
   * overtake filter needs a real instant and therefore only works with
   * OpenF1-sourced stops.
   */
  at: Date | null;
  /**
   * Time spent in the pit lane, in seconds.
   *
   * Note: this is pit *lane* time, not the stationary "fastest pit stop" figure
   * quoted on broadcast — neither jolpica nor OpenF1 exposes the stationary time
   * (OpenF1's `stop_duration` is null across every session checked). Stops taken
   * during a red-flag suspension inflate this into the tens of minutes, which is
   * genuine data rather than corruption.
   */
  pitLaneSeconds: number;
}

export interface SafetyCarEvent {
  lap: number;
  at: Date;
  /** e.g. "SAFETY CAR DEPLOYED", "VIRTUAL SAFETY CAR DEPLOYED". */
  message: string;
  virtual: boolean;
}
