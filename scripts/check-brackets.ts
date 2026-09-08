import { loadRoundContext } from "../src/lib/f1/round-context";
import { validateRoster } from "../src/lib/f1/roster";
import { createAdminClient, loadLocalEnv } from "../src/lib/supabase/admin";

loadLocalEnv();

async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? 2026);
  const context = await loadRoundContext(createAdminClient(), season);
  if (!context) {
    console.log(`no rounds for ${season}`);
    return;
  }

  const byTier = (tiers: Map<string, string>, names: Map<string, string>, tier: string) =>
    [...tiers.entries()]
      .filter(([, value]) => value === tier)
      .map(([id]) => names.get(id) ?? id)
      .sort();

  console.log(`${season} round ${context.round} — ${context.raceName}`);
  console.log("top drivers:", byTier(context.tiers, context.driverNames, "top").length);
  console.log("mid drivers:", byTier(context.tiers, context.driverNames, "mid").length);
  console.log("top teams:", byTier(context.constructorTiers, context.constructorNames, "top"));
  console.log("mid teams:", byTier(context.constructorTiers, context.constructorNames, "mid"));

  // The cheapest legal roster the real field allows, so the check proves the
  // bracket layout is fillable rather than just well-shaped on paper.
  const cheapest = (ids: string[], prices: Map<string, number>, count: number) =>
    [...ids].sort((a, b) => (prices.get(a) ?? 0) - (prices.get(b) ?? 0)).slice(0, count);

  const ofTier = (tiers: Map<string, string>, tier: string) =>
    [...tiers.entries()].filter(([, value]) => value === tier).map(([id]) => id);

  const topDrivers = cheapest(ofTier(context.tiers, "top"), context.driverPrices, 3);
  const midDrivers = cheapest(ofTier(context.tiers, "mid"), context.driverPrices, 4);
  const topTeam = cheapest(ofTier(context.constructorTiers, "top"), context.constructorPrices, 1);
  const midTeams = cheapest(ofTier(context.constructorTiers, "mid"), context.constructorPrices, 2);

  const selection = {
    top: topDrivers,
    mid: midDrivers.slice(0, 3),
    backmarker: midDrivers[3],
    constructors: [topTeam[0], midTeams[0]],
    reverseConstructor: midTeams[1],
  };

  const result = validateRoster(selection, {
    tiers: context.tiers,
    constructorTiers: context.constructorTiers,
    driverPrices: context.driverPrices,
    constructorPrices: context.constructorPrices,
    costCap: 130,
  });

  console.log("cheapest legal roster costs", result.cost, "of 130 —", result.errors);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
