/**
 * Fills a league with members and a season's history.
 *
 *   npm run seed-league -- <league-id> [season]
 *
 * For trying out standings, the stats card and duel fixtures without waiting a
 * season to accumulate. Everything it writes is real: rosters are legal under
 * that round's brackets, and the points come from the same scoring engine the
 * live job uses, run against the actual results. Made-up numbers would look
 * fine and hide exactly the bugs this is meant to surface.
 *
 * Re-running is safe. Members are matched by email and rounds already scored
 * are skipped, so it tops up rather than duplicating. Pass --reset to wipe the
 * seeded members' history first.
 *
 * A seeded member buys their team like anyone else. Handing them a roster
 * without charging for it left them holding the full opening budget all season
 * while a real player was down the cost of eleven picks, which made the cost
 * cap chart nonsense.
 */

import { loadRoundFacts } from "../src/lib/f1/score-job";
import { scoreRoster } from "../src/lib/f1/round-scoring";
import { rosterSlotRows } from "../src/lib/f1/roster-slots";
import { loadRoundContext } from "../src/lib/f1/round-context";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";
import type { RosterSelection } from "../src/lib/f1/roster";

loadLocalEnv();

/** Test members. The email domain is reserved by RFC 2606 and goes nowhere. */
const MEMBERS = [
  { email: "mika@example.com", name: "Mika" },
  { email: "jules@example.com", name: "Jules" },
  { email: "nina@example.com", name: "Nina" },
];

/**
 * A deterministic shuffle, so a member's taste in drivers is consistent across
 * rounds and re-runs rather than a different team every time.
 */
function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

/**
 * A legal team that fits the budget.
 *
 * Built up rather than corrected down: start from the cheapest legal eleven,
 * then spend what is left on random upgrades. Picking at random and repairing
 * afterwards left a member holding a team they could not afford, which drew a
 * cost cap line into the negative for the whole season — something the real
 * game cannot produce, and exactly the kind of impossible state seeded data
 * should never teach you to expect.
 */
function pickTeam(
  seed: number,
  top: string[],
  mid: string[],
  constructorsTop: string[],
  constructorsMid: string[],
  driverPrices: ReadonlyMap<string, number>,
  constructorPrices: ReadonlyMap<string, number>,
  budget: number,
): RosterSelection {
  const random = seeded(seed);
  const priceOf = (id: string) => driverPrices.get(id) ?? constructorPrices.get(id) ?? 0;
  const byPrice = (pool: string[]) => [...pool].sort((a, b) => priceOf(a) - priceOf(b));

  // Cheapest legal team: three top drivers, three mid, a backmarker, and the
  // three constructor slots.
  const picks = {
    top: byPrice(top).slice(0, 3),
    mid: byPrice(mid).slice(0, 4),
    cTop: byPrice(constructorsTop).slice(0, 1),
    cMid: byPrice(constructorsMid).slice(0, 2),
  };

  const spend = () =>
    [...picks.top, ...picks.mid, ...picks.cTop, ...picks.cMid].reduce(
      (total, id) => total + priceOf(id),
      0,
    );

  // Spend the difference on upgrades, one swap at a time, keeping every pick
  // inside its own bracket so the roster stays legal.
  const brackets: { held: string[]; pool: string[] }[] = [
    { held: picks.top, pool: top },
    { held: picks.mid, pool: mid },
    { held: picks.cTop, pool: constructorsTop },
    { held: picks.cMid, pool: constructorsMid },
  ];

  for (let attempt = 0; attempt < 60; attempt++) {
    const bracket = brackets[Math.floor(random() * brackets.length)];
    const slot = Math.floor(random() * bracket.held.length);
    const candidates = bracket.pool.filter((id) => !bracket.held.includes(id));
    if (candidates.length === 0) continue;

    const candidate = candidates[Math.floor(random() * candidates.length)];
    const difference = priceOf(candidate) - priceOf(bracket.held[slot]);
    if (spend() + difference <= budget) bracket.held[slot] = candidate;
  }

  return {
    top: picks.top,
    mid: picks.mid.slice(0, 3),
    backmarker: picks.mid[3],
    constructors: [picks.cTop[0], picks.cMid[0]],
    reverseConstructor: picks.cMid[1] ?? picks.cMid[0],
    topCaptainId: picks.top[0],
    midCaptainId: picks.mid[0],
  };
}


async function main(): Promise<void> {
  const leagueId = process.argv[2];
  if (!leagueId) throw new Error("Usage: npm run seed-league -- <league-id> [season]");

  const supabase = createAdminClient();

  const { data: league } = await supabase
    .from("leagues")
    .select("id, name, season, mode, starting_cost_cap")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) throw new Error(`No league ${leagueId}`);

  const season = Number(process.argv.find((arg) => /^\d{4}$/.test(arg)) ?? league.season);
  const reset = process.argv.includes("--reset");
  console.log(`Seeding "${league.name}" (${season})`);

  // --- members -------------------------------------------------------------
  const { data: existingUsers } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const byEmail = new Map((existingUsers?.users ?? []).map((u) => [u.email, u.id]));

  const memberIds: { id: string; name: string; seed: number }[] = [];

  for (const [index, member] of MEMBERS.entries()) {
    let userId = byEmail.get(member.email);

    if (!userId) {
      // A random password nobody is told: these accounts hold data, they are
      // not meant to be signed into.
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: member.email,
        password: crypto.randomUUID(),
        email_confirm: true,
      });
      if (error) throw new Error(`Could not create ${member.email}: ${error.message}`);
      userId = created.user.id;
      console.log(`  created ${member.email}`);
    }

    await supabase
      .from("profiles")
      .upsert({ id: userId, display_name: member.name }, { onConflict: "id" });

    const { data: membership } = await supabase
      .from("league_members")
      .select("id")
      .eq("league_id", leagueId)
      .eq("profile_id", userId)
      .maybeSingle();

    let membershipId = membership?.id;
    if (!membershipId) {
      const { data: joined, error } = await supabase
        .from("league_members")
        .insert({ league_id: leagueId, profile_id: userId })
        .select("id")
        .single();
      if (error) throw new Error(`Could not join ${member.name}: ${error.message}`);
      membershipId = joined.id;
      console.log(`  joined ${member.name}`);
    }

    memberIds.push({ id: membershipId, name: member.name, seed: (index + 1) * 7919 });
  }

  // Anyone already in the league plays too, so the owner is not left out.
  const { data: allMembers } = await supabase
    .from("league_members")
    .select("id, profiles(display_name)")
    .eq("league_id", leagueId);

  const players = (allMembers ?? []).map((row, index) => ({
    id: row.id,
    name: (row.profiles as unknown as { display_name: string } | null)?.display_name ?? "Unknown",
    seed: (index + 1) * 104729,
  }));

  if (reset) {
    // Only the seeded members: a real player's history is theirs.
    const seededIds = memberIds.map((member) => member.id);
    if (seededIds.length) {
      await supabase.from("round_scores").delete().in("member_id", seededIds);
      await supabase.from("rosters").delete().in("member_id", seededIds);
      await supabase
        .from("cost_cap_entries")
        .delete()
        .in("member_id", seededIds)
        .in("reason", ["backmarker_payout", "driver_purchase", "constructor_purchase"]);
      console.log(`  reset history for ${seededIds.length} seeded members`);
    }
  }

  // --- history -------------------------------------------------------------
  const context = await loadRoundContext(supabase, season);
  if (!context) throw new Error(`No round context for ${season}`);

  const byTier = (tier: string) =>
    [...context.tiers.entries()].filter(([, value]) => value === tier).map(([id]) => id);
  const consByTier = (tier: string) =>
    [...context.constructorTiers.entries()].filter(([, value]) => value === tier).map(([id]) => id);

  const top = byTier("top");
  const mid = byTier("mid");
  const cTop = consByTier("top");
  const cMid = consByTier("mid");

  const { data: rounds } = await supabase
    .from("rounds")
    .select("round")
    .eq("season", season)
    .lt("round", context.round)
    .order("round");

  // One team per player for the whole season. Re-drafting every round would
  // mean a transfer fee and a fresh purchase each week, and real members do not
  // rebuild from scratch weekly either — the points move because the results
  // do, not because the team does.
  const teams = new Map(
    players.map((player) => [
      player.id,
      pickTeam(
        player.seed,
        top,
        mid,
        cTop,
        cMid,
        context.driverPrices,
        context.constructorPrices,
        Number(league.starting_cost_cap),
      ),
    ]),
  );

  // Charged once, at this round's prices, for anyone who has not paid yet.
  for (const player of players) {
    const { data: paid } = await supabase
      .from("cost_cap_entries")
      .select("member_id")
      .eq("member_id", player.id)
      .eq("reason", "driver_purchase")
      .limit(1)
      .maybeSingle();
    if (paid) continue;

    const selection = teams.get(player.id)!;
    const drivers = [...selection.top, ...selection.mid, selection.backmarker].filter(
      (id): id is string => Boolean(id),
    );
    const constructorPicks = [...selection.constructors, selection.reverseConstructor].filter(
      (id): id is string => Boolean(id),
    );

    const driverCost = drivers.reduce((t, id) => t + (context.driverPrices.get(id) ?? 0), 0);
    const constructorCost = constructorPicks.reduce(
      (t, id) => t + (context.constructorPrices.get(id) ?? 0),
      0,
    );

    await supabase.from("cost_cap_entries").insert([
      {
        member_id: player.id,
        season,
        round: 1,
        amount: -Math.round(driverCost * 10) / 10,
        reason: "driver_purchase",
        note: `${drivers.length} drivers`,
      },
      {
        member_id: player.id,
        season,
        round: 1,
        amount: -Math.round(constructorCost * 10) / 10,
        reason: "constructor_purchase",
        note: `${constructorPicks.length} constructors`,
      },
    ]);
  }

  let scored = 0;
  let skipped = 0;

  for (const { round } of rounds ?? []) {
    const facts = await loadRoundFacts(supabase, season, round);
    if (!facts) {
      skipped++;
      continue;
    }

    for (const player of players) {
      const { data: already } = await supabase
        .from("round_scores")
        .select("member_id")
        .eq("member_id", player.id)
        .eq("season", season)
        .eq("round", round)
        .maybeSingle();
      if (already) continue;

      const selection = teams.get(player.id)!;

      const { data: roster } = await supabase
        .from("rosters")
        .upsert(
          { member_id: player.id, season, round, top_captain_id: selection.topCaptainId, mid_captain_id: selection.midCaptainId },
          { onConflict: "member_id,season,round" },
        )
        .select("id")
        .single();
      if (!roster) continue;

      await supabase.from("roster_slots").delete().eq("roster_id", roster.id);
      await supabase
        .from("roster_slots")
        .insert(
          rosterSlotRows(roster.id, selection, context.driverPrices, context.constructorPrices),
        );

      // The real scorer, on the real results, with the captains applied.
      const score = scoreRoster(selection, facts, {
        captainIds: [selection.topCaptainId, selection.midCaptainId].filter(
          (id): id is string => Boolean(id),
        ),
      });

      await supabase.from("round_scores").upsert(
        { member_id: player.id, season, round, points: score.points, duel_points: 0 },
        { onConflict: "member_id,season,round" },
      );

      // Cost cap moves with results: the backmarker slot pays out, so the
      // ledger has something to plot beyond a flat opening balance.
      if (score.budget) {
        await supabase.from("cost_cap_entries").insert({
          member_id: player.id,
          season,
          round,
          amount: score.budget,
          reason: "backmarker_payout",
          note: `Round ${round}`,
        });
      }

      scored++;
    }
  }

  console.log(`\n${players.length} players, ${scored} round scores written, ${skipped} rounds without results`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
