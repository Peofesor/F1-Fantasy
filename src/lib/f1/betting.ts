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

import { payoutAt } from "./bet-odds";
import { OPENF1_SUPPORTS, sourceEnabled } from "./data-sources";

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
  /**
   * True for a market that only exists on a sprint weekend.
   *
   * Separate from `available`, which is a property of the market itself and the
   * same every round. This one depends on which round is being bet on, so it is
   * a flag here and a filter at the point of offering.
   */
  sprintOnly?: boolean;
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
  sprint_winner: { id: "sprint_winner", name: "Sprint winner", selection: "driver", odds: 4, description: "Wins the sprint.", available: true, sprintOnly: true },
  sprint_points: { id: "sprint_points", name: "Sprint points", selection: "driver", odds: 1.5, description: "Finishes the sprint in the top 8.", available: true, sprintOnly: true },
  reached_q2: {
    id: "reached_q2",
    name: "Reaches Q2",
    selection: "driver",
    odds: 1.4,
    description: "Survives the first qualifying cut.",
    // Withdrawn, for two reasons that point the same way.
    //
    // It is the exact complement of "Out in Q1" — a driver reaches Q2 if and
    // only if they are not eliminated in Q1 — so the board carried the same bet
    // twice, and this was the dull side of it.
    //
    // And it is the side nobody can price. Ten of the last ten for half the
    // grid: twelve of twenty-three drivers were above the house margin and had
    // no offerable price at all, which is what a player saw as a market full of
    // blanks. Keeping a market whose only bettable selections are the four
    // drivers in trouble is worse than not having it.
    available: false,
  },
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

/**
 * Only markets that can actually be settled are offered.
 *
 * Settleable covers two things. `available` is the market's own answer — is
 * there any source for it at all. The source check is the second: three markets
 * settle from OpenF1, and if that feed is switched off they have nothing behind
 * them. A market with no feed behaves exactly like a market with no ingestion,
 * so it is withdrawn the same way rather than offered and voided later.
 */
export const MARKET_LIST = Object.values(MARKETS).filter(
  (market) =>
    market.available &&
    (!(OPENF1_SUPPORTS.markets as readonly string[]).includes(market.id) ||
      sourceEnabled("openf1")),
);

/** Every market, including unavailable ones, for settling historical bets. */
export const ALL_MARKETS = Object.values(MARKETS);

/**
 * Pre-qualifying bets pay a little more, because they are placed before the
 * grid is known and therefore carry genuinely more risk (spec §8).
 *
 * It was 1.5, which quietly undid the house margin: prices are now derived from
 * how often a selection actually does the thing, so multiplying a fair price by
 * half again made every market profitable to somebody. At 1.1 the incentive to
 * commit early survives without turning betting into a way to print cost cap.
 */
export const PRE_QUALIFYING_BONUS = 1.1;

/**
 * The bank is the ceiling: a member may stake everything they are not already
 * holding as a roster.
 *
 * This used to be a fifth, to stop one all-in bet deciding a season while the
 * roster — the actual game — sat untouched. Two changes since removed the need.
 * A bet now requires a complete roster (§8), so the team is bought and paid for
 * before any of this is reachable, and the bank is genuinely spare. And odds
 * are priced per selection against a house margin, so betting big is a faster
 * way to lose, not a shortcut to winning.
 *
 * What the old ceiling did instead was break the form on a small bank: a
 * fifth of 2.0 is 0.4, below the 1.0 minimum, so the field asked for a number
 * between 1 and 0.4.
 */
export function maxStake(bank: number, leagueLimit: number | null = null): number {
  const ceiling = leagueLimit === null ? bank : Math.min(bank, leagueLimit);
  return roundStake(ceiling);
}

/**
 * Cost cap is counted in millions, and a tenth of one is a real amount to bet.
 *
 * The whole ledger already works to a tenth — prices, payouts and the bank are
 * all rounded there — so a whole million was a coarser step than anything else
 * in the game.
 */
export const STAKE_STEP = 0.1;

/** Smallest stake worth recording: one step. */
export const MIN_STAKE = STAKE_STEP;

/**
 * Rounds a stake to the step the rest of the ledger uses.
 *
 * Down, not to nearest: rounding a stake up would take cap the member did not
 * offer, and on an all-in bet it would take cap they do not have.
 */
export function roundStake(stake: number): number {
  if (!Number.isFinite(stake)) return NaN;
  return Math.floor(stake / STAKE_STEP + 1e-9) * STAKE_STEP;
}

export interface StakeCheck {
  allowed: boolean;
  max: number;
  reason?: string;
}

export function checkStake(
  stake: number,
  bank: number,
  leagueLimit: number | null = null,
): StakeCheck {
  const max = maxStake(bank, leagueLimit);
  if (!Number.isFinite(stake) || stake < MIN_STAKE) {
    return { allowed: false, max, reason: `Minimum stake is ${MIN_STAKE.toFixed(1)}.` };
  }
  if (stake > max) {
    // Which limit bit is worth saying: "your bank" and "the house rule" call
    // for different fixes.
    const reason =
      leagueLimit !== null && leagueLimit < bank
        ? `This league caps a bet at ${leagueLimit.toFixed(1)}.`
        : "You cannot stake more cap than your bank holds.";
    return { allowed: false, max, reason };
  }
  return { allowed: true, max };
}

/**
 * Total returned on a winning bet at a market's listed price.
 *
 * Prices are per selection now (see ./bet-odds.ts), so this is the fallback for
 * a selection with no history rather than the usual path.
 */
export function payout(stake: number, marketId: MarketId, timing: BetTiming): number {
  const bonus = timing === "pre_qualifying" ? PRE_QUALIFYING_BONUS : 1;
  return payoutAt(stake, MARKETS[marketId].odds, bonus);
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
  /**
   * The odds struck when the bet was placed. Null for bets from before prices
   * were per-selection, which settle at the market's listed price.
   */
  agreedOdds: number | null = null,
): SettledBet {
  const result = settleBet(marketId, selection, facts);

  // A market with no data is voided and the stake refunded: the member cannot
  // be blamed for a source that did not publish.
  if (result === null) return { outcome: "void", returned: stake };
  if (!result) return { outcome: "lost", returned: 0 };

  const odds = agreedOdds ?? MARKETS[marketId].odds;
  const bonus = timing === "pre_qualifying" ? PRE_QUALIFYING_BONUS : 1;
  return { outcome: "won", returned: payoutAt(stake, odds, bonus) };
}
