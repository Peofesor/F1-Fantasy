/**
 * Dry run for the blended-pricing migration. WRITES NOTHING.
 *
 *   npx tsx scripts/reprice-dry-run.ts
 *
 * Recomputes every 2026 price under the blended signal, replays the value-drift
 * ledger entries the score job would rewrite, and reports the cap each member
 * would end up with against the one they have now.
 */
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";
import { pricesForRound } from "../src/lib/f1/price-job";
import { formPoints, type RoundPoints } from "../src/lib/f1/tiers";
import { priceDriftEntries, ledgerBalance, spendableCap } from "../src/lib/f1/ledger";

loadLocalEnv();

const SEASON = 2026;

async function main(): Promise<void> {
  const supabase = createAdminClient();

  const [{ data: results }, { data: roundRows }, { data: members }] = await Promise.all([
    supabase.from("race_results").select("season, round, driver_id, constructor_id, position").in("season", [SEASON - 1, SEASON]),
    supabase.from("rounds").select("round").eq("season", SEASON).order("round"),
    supabase.from("league_members").select("id, league_id, profiles(display_name)"),
  ]);

  const who = new Map(
    (members ?? []).map((m) => [m.id, (m.profiles as unknown as { display_name: string } | null)?.display_name ?? "?"]),
  );
  const memberIds = [...who.keys()];

  const driverPoints: RoundPoints[] = (results ?? []).map((r) => ({
    season: r.season, round: r.round, driverId: r.driver_id,
    points: formPoints(r.position === null ? null : Number(r.position)),
  }));
  const constructorPoints: RoundPoints[] = (results ?? []).map((r) => ({
    season: r.season, round: r.round, driverId: r.constructor_id,
    points: formPoints(r.position === null ? null : Number(r.position)),
  }));

  const seasonRows = (results ?? []).filter((r) => r.season === SEASON);
  const driverIds = [...new Set(seasonRows.map((r) => r.driver_id))];
  const constructorIds = [...new Set(seasonRows.map((r) => r.constructor_id))];

  // New price lists, round by round, exactly as populatePrices would write them.
  const newDriver = new Map<number, Map<string, number>>();
  const newCons = new Map<number, Map<string, number>>();
  for (const { round } of roundRows ?? []) {
    const priced = pricesForRound(driverPoints, constructorPoints, { season: SEASON, round }, driverIds, constructorIds);
    newDriver.set(round, priced.driverPrices);
    newCons.set(round, priced.constructorPrices);
  }

  // What is stored today.
  const [{ data: oldD }, { data: oldC }] = await Promise.all([
    supabase.from("driver_prices").select("round, driver_id, price").eq("season", SEASON),
    supabase.from("constructor_prices").select("round, constructor_id, price").eq("season", SEASON),
  ]);

  const oldDriver = new Map<number, Map<string, number>>();
  for (const r of oldD ?? []) {
    const m = oldDriver.get(r.round) ?? new Map();
    m.set(r.driver_id, Number(r.price));
    oldDriver.set(r.round, m);
  }
  const oldConsMap = new Map<number, Map<string, number>>();
  for (const r of oldC ?? []) {
    const m = oldConsMap.get(r.round) ?? new Map();
    m.set(r.constructor_id, Number(r.price));
    oldConsMap.set(r.round, m);
  }

  let changed = 0, unchanged = 0, biggest = { who: "", round: 0, from: 0, to: 0 };
  for (const [round, prices] of newDriver) {
    for (const [id, price] of prices) {
      const before = oldDriver.get(round)?.get(id);
      if (before === undefined) continue;
      if (Math.abs(price - before) < 0.05) { unchanged++; continue; }
      changed++;
      if (Math.abs(price - before) > Math.abs(biggest.to - biggest.from)) {
        biggest = { who: id, round, from: before, to: price };
      }
    }
  }
  console.log(`Driver price rows: ${changed} would change, ${unchanged} identical`);
  console.log(`  biggest single move: ${biggest.who} R${biggest.round} ${biggest.from.toFixed(1)} -> ${biggest.to.toFixed(1)}`);

  // Replay the drift entries the score job rewrites, per scored round.
  const { data: rosters } = await supabase
    .from("rosters")
    .select("member_id, round, roster_slots(slot_type, driver_id, constructor_id)")
    .in("member_id", memberIds)
    .eq("season", SEASON);

  const { data: scores } = await supabase
    .from("round_scores").select("round").eq("season", SEASON);
  const scoredRounds = [...new Set((scores ?? []).map((s) => s.round))].sort((a, b) => a - b);
  console.log(`\nScored rounds that would be re-scored: ${scoredRounds.join(", ") || "(none)"}`);

  const newDrift = new Map<string, number>();
  for (const round of scoredRounds) {
    for (const roster of (rosters ?? []).filter((r) => r.round === round)) {
      const slots = (roster.roster_slots ?? []) as { driver_id: string | null; constructor_id: string | null }[];
      const heldDrivers = slots.map((s) => s.driver_id).filter((x): x is string => Boolean(x));
      const heldCons = slots.map((s) => s.constructor_id).filter((x): x is string => Boolean(x));
      const entries = [
        ...priceDriftEntries(roster.member_id, SEASON, round, heldDrivers, newDriver.get(round - 1) ?? new Map(), newDriver.get(round) ?? new Map()),
        ...priceDriftEntries(roster.member_id, SEASON, round, heldCons, newCons.get(round - 1) ?? new Map(), newCons.get(round) ?? new Map()),
      ];
      for (const e of entries) newDrift.set(e.memberId, (newDrift.get(e.memberId) ?? 0) + e.amount);
    }
  }

  // Today's ledger, split into the part that survives and the part rewritten.
  const { data: entries } = await supabase
    .from("cost_cap_entries").select("member_id, round, amount, reason").in("member_id", memberIds).eq("season", SEASON);

  console.log("\nplayer         cap now    cap after     shift");
  for (const id of memberIds) {
    const mine = (entries ?? []).filter((e) => e.member_id === id);
    if (!mine.length) continue;

    // Only the rounds actually replayed have their drift replaced. Rounds the
    // score job will not touch — no roster behind them, usually because
    // clear-early-rounds removed it — keep the drift they already have. Ignoring
    // that discarded a season of orphaned entries and invented a loss that was
    // never going to happen.
    const replayed = new Set(scoredRounds);
    const survives = mine.filter(
      (e) => e.reason !== "price_change" || !replayed.has(e.round),
    );
    const oldDriftTotal = ledgerBalance(
      mine.filter((e) => e.reason === "price_change" && replayed.has(e.round)),
    );

    const balanceNow = ledgerBalance(mine);
    const balanceAfter = ledgerBalance(survives) + (newDrift.get(id) ?? 0);

    const latest = (rosters ?? []).filter((r) => r.member_id === id).sort((a, b) => b.round - a.round)[0];
    const slots = (latest?.roster_slots ?? []) as { driver_id: string | null; constructor_id: string | null }[];
    const round = latest?.round ?? 0;

    const value = (d: Map<number, Map<string, number>>, c: Map<number, Map<string, number>>) =>
      slots.reduce((t, s) => t + (s.driver_id ? (d.get(round)?.get(s.driver_id) ?? 0) : 0) + (s.constructor_id ? (c.get(round)?.get(s.constructor_id) ?? 0) : 0), 0);

    const capNow = spendableCap(balanceNow, value(oldDriver, oldConsMap));
    const capAfter = spendableCap(balanceAfter, value(newDriver, newCons));

    console.log(
      `${(who.get(id) ?? "?").padEnd(13)} ${capNow.toFixed(1).padStart(8)} ${capAfter.toFixed(1).padStart(11)} ` +
        `${((capAfter - capNow) >= 0 ? "+" : "") + (capAfter - capNow).toFixed(1)}`.padStart(10) +
        `   (drift ${oldDriftTotal.toFixed(1)} -> ${(newDrift.get(id) ?? 0).toFixed(1)})`,
    );
  }

  console.log("\nNOTHING WAS WRITTEN.");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
