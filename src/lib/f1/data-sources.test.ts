import { describe, expect, it } from "vitest";

import { ALL_MARKETS, MARKET_LIST } from "./betting";
import { OPENF1_SUPPORTS, SOURCES, sourceEnabled } from "./data-sources";

describe("data sources", () => {
  it("names a licence and a link for every feed", () => {
    // The attribution notice renders from this list, and a feed with no licence
    // recorded would be credited without saying under what terms — which is the
    // half of the requirement that is easy to forget.
    for (const source of SOURCES) {
      expect(source.licence, source.id).toBeTruthy();
      expect(source.licenceUrl, source.id).toMatch(/^https:\/\//);
      expect(source.url, source.id).toMatch(/^https:\/\//);
      expect(source.supplies, source.id).toBeTruthy();
    }
  });

  it("keeps both feeds on by default", () => {
    // The switch is for a licence answer that has not arrived. Until it does,
    // the game behaves as it always has — a flag that changed behaviour on an
    // unset variable would be worse than no flag.
    expect(process.env.F1_OPENF1).toBeUndefined();
    expect(sourceEnabled("openf1")).toBe(true);
    expect(sourceEnabled("jolpica")).toBe(true);
  });

  it("lists every market that OpenF1 settles", () => {
    // The list is what withdraws those markets when the feed goes off, so a
    // market added on OpenF1 data and left out here would be offered with
    // nothing behind it and void every time.
    const settledByOpenF1 = new Set<string>(OPENF1_SUPPORTS.markets);

    for (const id of settledByOpenF1) {
      expect(ALL_MARKETS.map((market) => market.id)).toContain(id);
    }

    // With the feed on, they are all on the board — so the withdrawal seen when
    // it is off is the flag working rather than the market being broken.
    for (const id of settledByOpenF1) {
      expect(MARKET_LIST.map((market) => market.id)).toContain(id);
    }
  });
});
