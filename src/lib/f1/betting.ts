/**
 * Betting.
 *
 * Stakes and payouts are in cost cap, drawn from the bank — the uncommitted
 * part of the balance, not the value tied up in a roster (spec §8). A member
 * cannot bet money that is currently a driver.
 *
 * Every market settles against facts already ingested, so settlement is
 * deterministic and re-runnable rather than a judgement call.
 */

export type MarketId =
  | "race_winner"
  | "podium"
  | "top_six"
  | "top_ten"
  | "fastest_lap"
  | "reached_q3"
  | "eliminated_q1"
  | "dnf"
  | "fastest_pit_stop"
  | "winner_nationality"
  | "most_overtakes"
  | "safety_car"
  | "lap_one_leader"
  | "sprint_winner"
  | "sprint_points"
  | "reached_q2"
  | "beats_teammate_race"
  | "beats_teammate_qualifying";

export type BetTiming = "pre_qualifying" | "pre_race";

export interface MarketDefinition {
  id: MarketId;
  name: string;
  /** What the selection refers to. */
  selection: "driver" | "constructor" | "nationality" | "yes_no";
  /** Multiplier applied to the stake on a win, before the timing bonus. */
  odds: number;
  description: string;
  /**
   * False when no ingested source can settle the market. Such a market is
   * hidden rather than offered: a bet that always voids and refunds is
   * confusing, and looks broken rather than generous.
   */
  available: boolean;
}

/**
 * Odds are round numbers reflecting roughly how likely each outcome is with a
 * ~20 car field, deliberately shaded below true odds so betting is not a better
 * expected return than picking a good roster.
 *
 * Picking one winner from twenty is nominally 20:1, but the field is not
 * uniform — a handful of drivers win almost everything — so the payout sits far
 * below that. Wider markets (top six, top ten) pay close to even because a
 * favourite landing there is close to a certainty.
 */
export const MARKETS: Record<MarketId, MarketDefinition> = {
  race_winner: { id: "race_winner", name: "Race winner", selection: "driver", odds: 4, description: "Names the winner.", available: true },
  podium: { id: "podium", name: "Podium finish", selection: "driver", odds: 2, description: "Finishes in the top 3.", available: true },
  top_six: { id: "top_six", name: "Top six", selection: "driver", odds: 1.5, description: "Finishes in the top 6.", available: true },
  top_ten: { id: "top_ten", name: "Points finish", selection: "driver", odds: 1.3, description: "Finishes in the top 10.", available: true },
  fastest_lap: { id: "fastest_lap", name: "Fastest lap", selection: "driver", odds: 5, description: "Sets the fastest lap.", available: true },
  reached_q3: { id: "reached_q3", name: "Reaches Q3", selection: "driver", odds: 1.6, description: "Makes the top-10 shootout.", available: true },
  eliminated_q1: { id: "eliminated_q1", name: "Out in Q1", selection: "driver", odds: 2.5, description: "Eliminated in the first session.", available: true },
  dnf: { id: "dnf", name: "Does not finish", selection: "driver", odds: 4, description: "Retires, is disqualified, or does not start.", available: true },
  fastest_pit_stop: { id: "fastest_pit_stop", name: "Fastest pit stop", selection: "constructor", odds: 5, description: "Team records the quickest pit-lane time.", available: true },
  winner_nationality: { id: "winner_nationality", name: "Winner's nationality", selection: "nationality", odds: 3, description: "Nationality of the race winner.", available: true },
  most_overtakes: { id: "most_overtakes", name: "Most overtakes", selection: "driver", odds: 5, description: "Makes the most on-track passes (house count).", available: true },
  safety_car: { id: "safety_car", name: "Safety car", selection: "yes_no", odds: 1.6, description: "A safety car is deployed.", available: true },
  sprint_winner: { id: "sprint_winner", name: "Sprint winner", selection: "driver", odds: 4, description: "Wins the sprint. Sprint weekends only.", available: true },
  sprint_points: { id: "sprint_points", name: "Sprint points", selection: "driver", odds: 1.5, description: "Finishes the sprint in the top 8. Sprint weekends only.", available: true },
  reached_q2: { id: "reached_q2", name: "Reaches Q2", selection: "driver", odds: 1.4, description: "Survives the first qualifying cut.", available: true },
  beats_teammate_race: { id: "beats_teammate_race", name: "Beats teammate (race)", selection: "driver", odds: 1.8, description: "Finishes ahead of the other car in their garage.", available: true },
  beats_teammate_qualifying: { id: "beats_teammate_qualifying", name: "Beats teammate (qualifying)", selection: "driver", odds: 1.8, description: "Out-qualifies the other car in their garage.", available: true },
  lap_one_leader: {
    id: "lap_one_leader",
    name: "Leader after lap 1",
    selection: "driver",
    odds: 3.5,
    description: "Leads at the end of the opening lap.",
    // jolpica publishes lap-by-lap timing, but it is not ingested yet, so this
    // market cannot be settled and stays hidden until it can be.
    available: false,
  },
};

/** Only markets that can actually be settled are offered. */
export const MARKET_LIST = Object.values(MARKETS).filter((market) => market.available);

/** Every market, including unavailable ones, for settling historical bets. */
export const ALL_MARKETS = Object.values(MARKETS);

/**
 * Pre-qualifying bets pay more, because they are placed before the grid is
 * known and therefore carry genuinely more risk (spec §8).
 */
export const PRE_QUALIFYING_BONUS = 1.5;

/**
 * The most of the bank a single bet may risk.
 *
 * Without a ceiling one all-in bet could decide a season, which would make the
 * roster — the actual game — irrelevant. A fifth is enough to matter and
 * survivable when it loses.
 */
export const MAX_STAKE_FRACTION = 0.2;

/** Smallest stake worth recording. */
export const MIN_STAKE = 1;

export function maxStake(bank: number): number {
  return Math.floor(bank * MAX_STAKE_FRACTION * 10) / 10;
}

export interface StakeCheck {
  allowed: boolean;
  max: number;
  reason?: string;
}

export function checkStake(stake: number, bank: number): StakeCheck {
  const max = maxStake(bank);
  if (!Number.isFinite(stake) || stake < MIN_STAKE) {
    return { allowed: false, max, reason: `Minimum stake is ${MIN_STAKE}.` };
  }
  if (stake > bank) {
    return { allowed: false, max, reason: "You cannot stake more cap than you hold." };
  }
  if (stake > max) {
    return { allowed: false, max, reason: `Maximum stake is ${max.toFixed(1)} (a fifth of your bank).` };
  }
  return { allowed: true, max };
}

/** Total returned on a winning bet: the stake back plus winnings. */
export function payout(stake: number, marketId: MarketId, timing: BetTiming): number {
  const multiplier =
    MARKETS[marketId].odds * (timing === "pre_qualifying" ? PRE_QUALIFYING_BONUS : 1);
  return Math.round(stake * (1 + multiplier) * 10) / 10;
}

/** Everything settlement needs, all of it already ingested. */
export interface SettlementFacts {
  /** Finishing position by driver; null when unclassified. */
  finishPositions: ReadonlyMap<string, number | null>;
  /** Classification by driver, for DNF settlement. */
  classifications: ReadonlyMap<string, string>;
  fastestLapDriverId: string | null;
  /** Furthest qualifying session reached, by driver. */
  qualifyingReached: ReadonlyMap<string, "Q1" | "Q2" | "Q3">;
  fastestPitStopConstructorId: string | null;
  winnerNationality: string | null;
  mostOvertakesDriverId: string | null;
  safetyCarDeployed: boolean;
  lapOneLeaderDriverId: string | null;
  /**
   * Sprint finishing positions. An empty map means no sprint ran, which voids
   * the sprint markets rather than settling them as losses.
   */
  sprintPositions: ReadonlyMap<string, number | null>;
  /** Who beat their teammate. Absent when there was no valid comparison. */
  beatTeammateInRace: ReadonlyMap<string, boolean>;
  beatTeammateInQualifying: ReadonlyMap<string, boolean>;
}

/**
 * Settles one bet.
 *
 * Returns null when the outcome cannot be determined — a market whose source
 * data is missing for that round. Such a bet is voided and the stake returned
 * rather than being graded as a loss, since the member did nothing wrong.
 */
export function settleBet(
  marketId: MarketId,
  selection: string,
  facts: SettlementFacts,
): boolean | null {
  const position = facts.finishPositions.get(selection) ?? null;
  const inTop = (n: number) => (position === null ? false : position <= n);

  switch (marketId) {
    case "race_winner":
      return position === 1;
    case "podium":
      return inTop(3);
    case "top_six":
      return inTop(6);
    case "top_ten":
      return inTop(10);

    case "fastest_lap":
      return facts.fastestLapDriverId === null ? null : facts.fastestLapDriverId === selection;

    case "reached_q3": {
      const reached = facts.qualifyingReached.get(selection);
      return reached === undefined ? null : reached === "Q3";
    }
    case "eliminated_q1": {
      const reached = facts.qualifyingReached.get(selection);
      return reached === undefined ? null : reached === "Q1";
    }

    case "dnf": {
      const classification = facts.classifications.get(selection);
      if (classification === undefined) return null;
      return (
        classification === "retired" ||
        classification === "disqualified" ||
        classification === "did-not-start"
      );
    }

    case "fastest_pit_stop":
      return facts.fastestPitStopConstructorId === null
        ? null
        : facts.fastestPitStopConstructorId === selection;

    case "winner_nationality":
      return facts.winnerNationality === null
        ? null
        : facts.winnerNationality.toLowerCase() === selection.toLowerCase();

    case "most_overtakes":
      return facts.mostOvertakesDriverId === null
        ? null
        : facts.mostOvertakesDriverId === selection;

    case "sprint_winner":
    case "sprint_points": {
      // No sprint that weekend: void rather than lose. Backing a driver in a
      // session that never happened is not a losing bet.
      if (facts.sprintPositions.size === 0) return null;
      const sprintPosition = facts.sprintPositions.get(selection) ?? null;
      if (sprintPosition === null) return false;
      return marketId === "sprint_winner" ? sprintPosition === 1 : sprintPosition <= 8;
    }

    case "reached_q2": {
      const reached = facts.qualifyingReached.get(selection);
      return reached === undefined ? null : reached !== "Q1";
    }

    case "beats_teammate_race": {
      const beat = facts.beatTeammateInRace.get(selection);
      return beat === undefined ? null : beat;
    }

    case "beats_teammate_qualifying": {
      const beat = facts.beatTeammateInQualifying.get(selection);
      return beat === undefined ? null : beat;
    }

    case "safety_car":
      return (selection === "yes") === facts.safetyCarDeployed;

    case "lap_one_leader":
      return facts.lapOneLeaderDriverId === null
        ? null
        : facts.lapOneLeaderDriverId === selection;
  }
}

export type BetOutcome = "won" | "lost" | "void";

export interface SettledBet {
  outcome: BetOutcome;
  /** Cost cap returned: winnings plus stake, the stake alone if void, or nothing. */
  returned: number;
}

export function settle(
  marketId: MarketId,
  selection: string,
  stake: number,
  timing: BetTiming,
  facts: SettlementFacts,
): SettledBet {
  const result = settleBet(marketId, selection, facts);

  // A market with no data is voided and the stake refunded: the member cannot
  // be blamed for a source that did not publish.
  if (result === null) return { outcome: "void", returned: stake };
  if (!result) return { outcome: "lost", returned: 0 };
  return { outcome: "won", returned: payout(stake, marketId, timing) };
}
