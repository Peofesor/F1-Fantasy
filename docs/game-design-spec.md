# F1 Fantasy — Game Design Spec

Status: design settled, not yet implemented. Derived from handwritten idea notes (transcribed 2026-09-07) plus a design-review session that resolved every open question and ambiguity from those notes.

## 1. Scope & audience

- Built for private friend league(s) first. A public, multi-tenant product (many independent leagues) is a long-term goal but is explicitly **not** being designed for yet — no multi-tenancy, no per-league-class chip slot counts. Revisit when the private version is proven.
- No real money anywhere in the game. All purchases, stakes, and rewards run on a single in-game currency (see §2).

## 2. Core economy — "cost cap"

There is exactly one currency: **cost cap**. It serves as:

- Your driver/constructor roster budget.
- Your betting stake and payout currency.
- Your chip-store currency.

Cost cap is not a static pool you're handed once — it moves with your roster's value:

- **Grows** when a driver/constructor you own increases in price, when you win a bet, or (implicitly) whenever your roster's market value rises.
- **Shrinks symmetrically** when a driver/constructor you own drops in price. This is a real "team value" mechanic (as in the official F1 Fantasy game) — bad picks cost you, not just in points but in future spending power.

Spending cost cap on a chip genuinely reduces what you have available for drivers (and vice versa) — it's one pool, not separate currencies. This is intentional: it creates a real trade-off between a stronger roster and chip advantages, rather than "free" bonus spending.

Betting stakes are drawn from your **spare** (uncommitted) cost cap, not your total — and are capped per bet (e.g. a max percentage of spare cap) so a single bet can't swing a season.

## 3. Game modes

Chosen per league, locked in for the whole season at season start (no mid-season switching or mixing).

### Duell mode (default)
- Every league member is paired against a rival for a weekly head-to-head.
- Rival pairings are generated **once, for the whole season, at season start** — a pre-set schedule (like an NFL fantasy football schedule), not redrawn live each week.
- Winning your weekly matchup earns +1 toward a season-long standings table (win/loss record style), separate from your raw weekly fantasy score.

### Free-for-All mode
- Identical rules to Duell in every other respect (roster, budget, chips, betting).
- No rival pairing — league members are ranked by cumulative fantasy points on a leaderboard.

Roster/budget mode: **Budget only.** Draft mode is fully out of scope — no draft-pick mechanics, no "each driver pickable Nx" rules.

## 4. Roster structure

Total roster: **7 drivers + 3 constructors.**

### Drivers (7 total)
- **3 "top" slots** — must be filled by drivers currently ranked in the top bracket of the individual driver championship standings.
- **3 "mid" slots** — must be filled by drivers currently ranked in the middle bracket of the standings.
- **1 backmarker slot** — a free pick, any driver, no tier restriction. Scored via **reverse points** (worse finishing position = more points, e.g. mirroring "20 points for P20").

Tiers (top/mid) are based on **individual driver championship standings**, not constructor/team standings — this was a deliberate choice to make automatic tier-tracking (below) unambiguous, since team-based tiers would require an arbitrary rule for which of a team's two drivers to use on a swap.

#### Tier dynamics (top/mid slots only)
- Driver prices and standings-based tier membership recalculate **after every race**.
- The top and mid slots are true "buckets": if a driver you own falls out of their bucket, they are **automatically swapped 1-for-1** with whoever displaced them into that bucket. No player action needed, and the roster is never left in an "invalid" state.
- The backmarker slot has no bucket and is exempt from auto-swap — it's simply a free, standing choice. Reverse scoring already discourages picking a genuinely strong driver here, so no tier restriction is needed to keep the slot meaningful.

### Constructors (3 total)
- **2 normal slots** — scored normally, budget-costed like driver picks.
- **1 reverse-scored slot** — a free pick (any constructor, no tier/rank restriction), scored via reverse points (last place in constructor standings = most points). Budget-costed the same as a normal pick — not free. Not auto-tracked to "whoever is currently last"; it's a standing player choice, same treatment as the backmarker driver slot.

### Explicitly dropped from the original roster ideas
- Draft mode and everything tied to it (each-driver-pickable-2x rule, bench/reserve slots).
- "Turbo Driver" and "Underdog" as roster-slot concepts (both repurposed/removed — see §6 for the surviving Turbo Driver chip).
- Rookie slot.
- A driver locked for the whole season (or every 5 races).
- "P1 not pickable" restriction — superseded by the tier system, which already prevents an all-top-driver roster.
- Standalone "Negativ-Fahrer" (2 free extra reverse-scoring picks) — fully replaced by the single backmarker slot.

## 5. Driver & constructor pricing

- Prices are inspired by/based on the real official F1 Fantasy game's pricing as a sensible, pre-balanced starting point.
- Prices are **dynamic**, driven by current championship standings, recalculated after every race (same cadence as tier recalculation).
- A driver's price affects your cost cap (see §2): owning a driver whose price rises grows your cap; a price drop shrinks it.

## 6. Chips

Two chips are **unlimited-use, always available, weekly-repeatable**:

| Chip | Effect |
|---|---|
| **Turbo Driver** | 2x points for one week, applied to any driver in your top-3 or mid-3 slots (not the backmarker). One boost per week total (not one for top and one for mid simultaneously). |
| **Konstruktor-Boost** | Same as Turbo Driver, applied to one of your constructors instead. |

All other chips follow a shared rule: **1 free use per season by default; additional uses must be bought via the store** (spending cost cap), with a cap on total rebuys per season (e.g. ~3) to prevent a currency-rich player from spamming a strong effect.

| Chip | Effect |
|---|---|
| **SuperDriver** | 3x points for one week, on a driver of your choice. |
| **Final Fix** | Lets you change one roster spot **after** qualifying results are known (bypassing the normal pre-qualifying lock). |
| **Autopilot** | Retroactively applies your weekly 2x multiplier to whichever of your own drivers scored highest that week — a "can't pick wrong" safety net. |
| **No Negative** | For one week, blocks negative points across your **entire** roster (not just the reverse-scored slots). |
| **Wildcard** | Unlimited free roster changes for one transfer window/week only (see §7 for normal change costs). Does not turn off the cost permanently — only for that one week. |
| **Unlimited cost cap (one race)** | Removes the budget/cost-cap limit for a single race weekend. Does **not** bypass the 3-top/3-mid/1-backmarker tier structure — you still need a legal roster shape, just without a spending cap on it. (This is the same idea as the original notes' separately-listed "chip without budget restrictions" — one chip, not two.) |

### Explicitly dropped chips
- The opponent-hindering chip (halve/lock an opponent's driver) — dropped as unbalanced/unfun in a 1v1 duel context.
- The illegible tire-strategy/distraction-bonus chip from the original notes — dropped; the handwriting was unreadable and there was nothing concrete to design against.
- Chip-slot counts varying "per league class" — deferred to the eventual public-product phase (§1), not designed for now.

## 7. Roster changes (transfers)

- A small free-changes allowance applies each week (e.g. 1 free change), consistent with how real F1 Fantasy handles transfers.
- Changes beyond the free allowance cost a small amount of cost cap each.
- The Wildcard chip (§6) removes this cost entirely for one week when used.

## 8. Betting (Wetten)

- Stakes and payouts are in cost cap directly (drawn from spare/uncommitted cap), capped per bet.
- Two timing tiers, as in the original notes: pre-qualifying bets (higher payout, more risk) and pre-race bets (lower payout).
- All bet types from the original notes ship for v1 — none of them are structurally complex, they're all straightforward prediction markets against race outcomes:
  - Fastest lap
  - Q1 / Q2 / Q3 progression
  - Race winner / podium / top 6 / top 10
  - DNF
  - Fastest pit stop
  - Winner's nationality
  - Most overtakes
  - Safety car (yes/no)
  - Who leads after lap 1
### Settlement rules for the data-dependent markets

Three markets can't settle against the figures shown on the F1 broadcast, because the underlying stats aren't available from any free source. Each settles against a stated house definition instead (verified against real race data during pipeline development — see §11):

- **Most overtakes** — settles on our own ingested OpenF1 overtake feed, with position changes caused by the overtaken car pitting filtered out. This is stated in the UI when the bet is placed. Note the absolute count runs roughly an order of magnitude above the broadcast figure (OpenF1 logs every position change, and a multi-car pass counts once per car); the *ranking* of drivers is what the market settles on and that remains meaningful.
- **Fastest pit stop** — settles on pit *lane* time, not the ~2s stationary time quoted on TV. Neither jolpica nor OpenF1 exposes stationary time (OpenF1's `stop_duration` field is null across every session checked, 2024 and 2026 alike). Stops taken during a red-flag suspension legitimately record in the tens of minutes; since the market takes the minimum, those exclude themselves.
- **Safety car (yes/no)** — available only from OpenF1's race-control feed. Full and virtual safety cars are distinguished at ingestion.

- Lap-1 leader settles from jolpica's lap-1 timing data and matches the official record exactly.
- "Unlimited Roster Changes" is **not** a separate bet type — it was a miscategorized note; the actual mechanic is the Wildcard chip (§6).

## 9. Rivals

- In Duell mode, rival pairings for the whole season are generated once at season start (a fixed schedule), not redrawn week to week.
- "Beating your rival" is scored as your weekly head-to-head win/loss (§3) — there is no separate per-category (quali points, bet points, etc.) rival comparison; that extra complexity was considered and dropped for v1.

## 10. Reference: official F1 Fantasy scoring (research notes)

Gathered as background reference for designing the point-scoring model (particularly negative-point events and reverse scoring), not a spec for this game's exact numbers — those still need to be tuned during playtesting.

**Driver scoring**: Qualifying 10→1 pts for P1–P10 (0 below); race finish uses standard F1 points (25/18/15/12/10/8/6/4/2/1 for P1–P10, 0 below); ±1 point per position gained/lost during the race (uncapped); +1 per on-track overtake; +10 fastest lap; +10 Driver of the Day. Sprint weekends use a separate, smaller table (8/7/6/5/4/3/2/1 for P1–P8, +5 sprint fastest lap).

**Negative-point events**: DNF/Not Classified: -20 (main race; sprint DNF reduced to -10 as of 2026). Qualifying DSQ or no time set: -5. Full-race disqualification: reported as -20 to -25 depending on source/season (figures vary slightly year to year). Losing positions relative to grid start: -1 per position, uncapped. No official "caused a collision" penalty exists as its own line item — it only affects score indirectly via DNF or positions lost.

**Constructor scoring**: Sum of both drivers' points, plus constructor-only bonuses (a Q3-progression bonus, and graduated pit-stop-time bonuses).

**Notable quirks in the official game**: a "DRS Boost" chip doubles one driver's score and is always available (the direct inspiration for this spec's Turbo Driver); an official "No Negative" chip already exists and cancels a driver's negative points for the week, validating that mechanic as balanced; extra transfers beyond the free ones cost points, not currency, in the official game (this spec uses cost cap instead, per §7).

Sources (secondary, cross-checked): Motor Sport Magazine's F1 Fantasy scoring guide, F1 Pitwall's 2026 scoring guide, Fanamp's 2026 rules-changes article. The official rules page (fantasy.formula1.com/en/game-rules) is JS-rendered and wasn't directly fetchable at research time.

## 11. Technical architecture

**Stack**: Next.js 16 + TypeScript, Supabase (Postgres, auth, `pg_cron`), Tailwind. Deployed as a web app; mobile is not a target.

**Build order**: data pipeline first, then game logic. The 2026 season is a live test bed — standing the pipeline up now means the remaining races bank verified real data, so 2027 (the real target) starts with months of ingestion history rather than cold.

### Data sources

| Source | Role | Constraints |
|---|---|---|
| **jolpica-f1** (`api.jolpi.ca`) | Source of record: qualifying (with Q1/Q2/Q3 derivation), race results, DNF/DSQ status, grid positions, lap timings, pit-lane times, driver + constructor standings per round | Free. **4 req/s, 500 req/hour**, and their docs warn limits may tighten. **Requires a descriptive User-Agent** or traffic risks being blocked. Volunteer-funded — ingest into our own store, never proxy user traffic to it |
| **OpenF1** (`api.openf1.org`) | Only source for overtakes, safety-car events, and session-keyed pit timing | Free tier: **3 req/s but only 30/min** — the per-minute figure binds. History starts **2023**. Live data is paid (€9.90/mo); we only need post-session data. **Licensed CC BY-NC-SA 4.0 — non-commercial** |

Ergast is dead (shut down end of 2024, returns 404). Do not build against it.

**Known blocker for a public launch**: OpenF1's non-commercial licence covers the three markets above. A private friends' league is fine; monetising would require their permission or dropping those markets. Recorded per the decision in §1 to accept this rather than design around a speculative future.

Backfill target is **2023 onward** — where both sources overlap. Pre-2026 races are useful for testing the scoring engine mechanically, but the 2026 regulation overhaul makes them less representative for balancing prices.

### Ingestion design

- Scheduled via Supabase `pg_cron`, polling daily. Results land within ~24h of a race, so daily is sufficient; running it next to the database avoids Vercel's free-tier cron restrictions.
- **Raw payloads are stored verbatim alongside normalised tables.** Since every balancing number in §12 is still open, scoring rules will change — and replaying a rule change against already-ingested races is only possible if the original payloads are kept. Re-fetching is not a reliable fallback given jolpica's request budget and OpenF1's 2023 floor.
- The two APIs share no identifier: jolpica keys drivers by slug (`max_verstappen`), OpenF1 by car number. They're joined on the car number actually raced, taken from jolpica's per-race results.
- Transform logic is pure and dependency-free, so it is unit-testable offline and reusable from either a Next.js route or a Supabase Edge Function.

## 12. Open items for later (not blocking, explicitly deferred)

- Multi-league/public-product infrastructure (§1).
- Per-league-class chip slot counts (§1, §6).
- Exact numeric balancing: cost cap starting amount, bet stake cap percentage, free-transfer count per week, cost-per-extra-transfer, chip rebuy cap count and price. These need playtesting, not more design discussion.
