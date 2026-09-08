# F1 Fantasy — Game Design Spec

Status: **implemented**. Derived from handwritten idea notes (transcribed 2026-09-07), a design-review session that resolved every open question in them, and a build that validated each mechanic against four real ingested seasons (2023-2026).

Balance numbers throughout were chosen with reasoning recorded alongside them. They are single constants and are expected to change once the game is actually played; where a run against real data suggested one might be wrong, that is noted at the point of the decision.

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
- **3 "top" slots** — must be filled by drivers in the top bracket.
- **3 "mid" slots** — must be filled by drivers in the mid bracket.
- **1 backmarker slot** — a free pick, any driver, no tier restriction. It **scores no points at all**: instead it generates **cost cap**, scaled by finishing position, so a worse finish pays more. It is still budget-costed to fill, which is what makes choosing *which* backmarker a real decision rather than free upside.

#### Bracket definition

- **Top bracket: the top 8 drivers** by the tier ordering below. **Mid bracket: everyone else.** The backmarker slot is unrestricted, so only these two brackets are enforced.
- Tiers are based on **individual driver points**, not constructor standings. Two reasons, both measured against 2023–2026 data:
  - "Drivers of the top 4 teams" is not reliably 8 people — it was **9 in 2026**, because a top-4 team ran three different drivers across the season. Mid-season driver swaps are routine, so a team-based bracket has a wobbling size, which breaks a roster rule requiring exactly 3 from it.
  - Team-based tiers make 1-for-1 auto-swap ambiguous: when a team leaves the top 4 and another enters, there is no principled answer to *which* of the incoming team's two drivers replaces yours.
  - The two definitions agree on 7–8 of 8 drivers anyway (identical in 2024 and 2026), so little intuition is lost.

#### Tier ordering: rolling 5-race window

Tier position comes from **points scored in the last 5 race weekends**, carried across the season boundary — not from current-season championship standings.

This exists because current-season standings cannot rank anyone at round one: every driver is on zero points and formally unranked (jolpica omits `position` entirely for them). Measured on 2025, current-season standings are also near-noise early — the top 6 after round 1 matched the season-final top 6 only **3/6**, reaching 6/6 only by round 8. Recomputing tiers from that would churn rosters on noise, and with auto-swap it would do so without player consent.

The rolling window removes the round-one special case rather than patching it, weights recent form, and is explainable in a line: *your tier reflects the last 5 race weekends.*

- **Rookies and returning drivers** (no history in the window — about 3 per season, e.g. 2026's Lindblad, Bottas and Pérez) seed from **their team's previous constructor standing**. A rookie in a fast car is not a backmarker, and seeding them to the bottom would let players buy a quick car at backmarker prices.
- **Drivers on zero points** sort below all scoring drivers, tie-broken by their seed position.

#### Tier dynamics (top/mid slots only)
- Driver prices and tier membership recalculate **after every race**.
- The top and mid slots are true "buckets": if a driver you own falls out of their bucket, they are **automatically swapped 1-for-1** with whoever displaced them into that bucket. No player action needed, and the roster is never left in an "invalid" state.
- The backmarker slot has no bucket and is exempt from auto-swap — it's simply a free, standing choice. Reverse scoring already discourages picking a genuinely strong driver here, so no tier restriction is needed to keep the slot meaningful.

### Constructors (3 total)
- **1 top-bracket slot** — must be filled by a constructor in the top bracket.
- **1 mid-bracket slot** — must be filled by a constructor in the mid bracket.
- **1 reverse-scored slot** — a free pick (any constructor, no tier/rank restriction), scored via reverse points (last place in constructor standings = most points). Budget-costed the same as a normal pick — not free. Not auto-tracked to "whoever is currently last"; it's a standing player choice, same treatment as the backmarker driver slot.

#### Constructor bracket definition

- **Top bracket: the top 4 constructors** by the same rolling 5-race window used for drivers. **Mid bracket: everyone else.** On the real 2026 field at round 14 this splits Ferrari, McLaren, Mercedes and Red Bull from the other seven teams.
- **Why 4 of ~11:** it mirrors how the field actually divides — a handful of teams win, the rest race each other. Two unrestricted slots let a roster hold the two best teams outright, which removes the choice; one from each bracket forces a genuine trade-off, exactly as the driver slots do.
- Constructors are subject to the **same 1-for-1 auto-swap** as drivers when a team changes bracket. The reverse slot is exempt, since it is scored on placing rather than tier.

### Roster layout

The picker presents the roster in **three tiers**, not as a list of drivers followed by a list of teams:

| Row | Contents |
| --- | --- |
| Top | 3 top-bracket drivers + 1 top-bracket constructor |
| Midfield | 3 mid-bracket drivers + 1 mid-bracket constructor |
| Back of the grid | 1 backmarker driver + 1 reverse-scored constructor |

Grouping by bracket makes the composition rule legible at a glance: each row is a tier, and the team in it comes from the same tier as the drivers beside it. **Constructor slot order carries meaning** — the first stored constructor fills the top-bracket slot, the second the mid one — so the stored slot types name the brackets (`constructor_top`, `constructor_mid`, `constructor_reverse`) rather than relying on an index.

### Explicitly dropped from the original roster ideas
- Draft mode and everything tied to it (each-driver-pickable-2x rule, bench/reserve slots).
- "Turbo Driver" and "Underdog" as roster-slot concepts. Underdog is gone; Turbo Driver became a chip and then, in the end, the weekly 2× nomination on the roster (§4a).
- Rookie slot.
- A driver locked for the whole season (or every 5 races).
- "P1 not pickable" restriction — superseded by the tier system, which already prevents an all-top-driver roster.
- Standalone "Negativ-Fahrer" (2 free extra reverse-scoring picks) — fully replaced by the single backmarker slot.

## 4a. Bracket captains

Each week, alongside picking the team, you name **one captain per driver bracket** — one of your three top drivers and one of your three midfield drivers. Both score **double**, applied automatically when the round is scored.

These were originally the Turbo Driver and Konstruktor Boost chips. They were the only two chips that were free *and* unlimited, which meant playing them was never a decision — there was no reason not to, every single round. A choice with one correct answer is not a chip; it is a step you can forget to take, and forgetting cost you points for nothing. Making them part of the roster removes the trap and keeps the decision that actually mattered: *which* driver and *which* team.

- **Stored on `rosters`**, not as a flag on `roster_slots` — exactly one of each may exist, which a column enforces for free.
- **Required for a complete roster.** Both are free, so leaving one unset is never anything but worse; the picker asks for them rather than letting you forfeit them silently.
- **One per bracket, not one overall.** A single nomination had a dominant answer: the dearest top-bracket driver is almost always the highest scorer, so the pick made itself. A mid captain competes only against the other two mid drivers, which is a decision on its own terms.
- **Constructors cannot be captained.** A constructor already scores its two drivers combined, so it swings about twice as hard as a driver slot before any multiplier — doubling that again let one slot decide the round. An earlier draft had a constructor boost; it was dropped rather than moved.
- **The backmarker cannot be captained**, since it pays cost cap rather than points — doubling it would double nothing.
- **A captaincy follows its holder.** Swapping the captain moves the armband onto whoever takes the slot; clearing the slot drops it and the roster reads as incomplete until it is set again.
- **Never defaulted.** Nothing pre-fills a captaincy: a default is an invisible decision made on the player's behalf about a slot that doubles their score. The picker asks once, on the way through saving, which is the only point where they are certain to see it. The card badge therefore marks a captain rather than offering to make one — showing it on every eligible card made the whole roster look doubled.
- **Changed from the driver's page.** Tapping a filled slot opens that pick's detail sheet — price, season points, and a round-by-round breakdown of qualifying and race points — with Make 2x / Remove 2x, Replace and Remove pinned to the bottom. The breakdown is scored through the same `loadRoundFacts` + `scoreDriver` path the round scorer uses, not a second simpler formula, so it can never disagree with the points actually awarded.
- **It carries forward** with the rest of the roster, following an auto-swapped driver onto their replacement, so a member who never opens the app still fields two multipliers.

Both captains are active at once — they are separate roster fields, not competing chip plays. SuperDriver can still stack on top, since it is a bought chip and a genuine decision.

### Price and form sort alike

The picker's option table shows **Price** and **Form (pts last 5 races)** as separate sortable columns, but they are very nearly the same ordering: price is *derived* from form (§5), and `priceFromForm` is strictly increasing, so a higher form is always a higher price. Measured on the real 2026 round-14 field, the two orderings agree on 21 of 23 drivers and differ only where rounding to 0.1 ties two prices — Hamilton and Russell both cost 23.9, and form separates them at 57.00 against 57.04.

So form sorts as a tie-breaker on price rather than as an independent axis. Both columns are still shown because they answer different questions — what a driver costs, and what he actually returned — but no ordering built from price and form together can carry information that form alone does not, as long as price is a pure function of form.

## 5. Driver & constructor pricing

Prices are **derived from form**, not imported: no upstream source publishes F1 Fantasy prices, and hand-entered ones would go stale every week.

- The signal is the **same rolling 5-race window that drives tier assignment**. Using one signal for both is deliberate — computing them separately would let a driver be top-bracket while priced like a backmarker.
- The window values **finishing position, not championship points**. Championship points stop at tenth, and about a third of the grid finishes below it every weekend: at 2026 round 14, **seven of twenty-three drivers had scored nothing** in the window and were therefore priced identically at the floor — a player choosing between Sainz, Albon, Ocon and Bearman had no signal whatsoever. Positions are valued by the championship table, **extended below tenth** at half of tenth place (0.5) decaying by 0.8 per position, so eleventh is worth 0.5 and twentieth about 0.07.
  - **Why a tail rather than pure position:** a linear position score says a consistent P8 beats an inconsistent podium-getter. Tested on the real 2026 window it ranked Lindblad (13 championship points) above Verstappen (48), which is plainly wrong. The championship table already encodes that the sharp end is worth far more, and the tail only extends it.
  - **Why not our own fantasy points:** they would seem the natural choice — price should track what a driver actually earns you — but the −20 DNF penalty drives the back of the grid deeply negative (Stroll sat at **−88** over the same window). Clamping at zero priced *ten* drivers at the floor, worse than what it replaced.
  - **Bound on the tail:** a full window of eleventh places is worth 2.5 — enough to beat a single ninth place, not enough to beat an eighth. The tail breaks ties beneath the points; it never becomes a rival currency to them.
  - **Measured effect** on 2026 round 14: distinct prices went from 15/23 to 22/23, drivers at the floor from 7 to 1, and **no driver changed bracket** — the top 8 and the top-4 constructor split are identical.
- Form is normalised against the strongest competitor in the field, so a quiet run of races doesn't make everyone cheap.
- **Bands**: drivers 4–28, constructors 5–26.
- **Curve**: normalised form is raised to the power **0.5** before mapping onto the band. The points table is heavily top-weighted (25 for a win against 1 for tenth), so a linear map bunches everyone below the leader near the floor; the exponent compresses the top and spreads the midfield, which is where roster decisions are actually made.
- **Known interaction with the backmarker slot:** because price now tracks expected finishing position, and the backmarker slot pays out *more* for a worse finish, the cheapest driver is also the highest-paying backmarker. That makes the slot a weaker decision than intended and is worth revisiting — but it is a scoring-balance question, not a pricing one, and the flat floor it replaced was degenerate in its own way (seven identically-priced drivers).
- Recalculated after every race, same cadence as tiers. Owning a driver whose price rises grows your cost cap; a price drop shrinks it (§2).

### Starting cost cap: 160

Set from measured roster costs rather than picked. The original placeholder of 100 admitted **only the cheapest legal roster** — a budget permitting exactly one affordable team is a forced selection, not a choice — and was raised to 130 against prices at 2026 round 13, where the cheapest legal roster cost 88.6.

Moving prices onto finishing position (§5) lifted the cheap seats, because a driver who never scores is no longer pinned to the floor. Costed against real prices at 2026 round 14:

| Archetype | Cost | 130 | 145 | 160 |
|---|---|---|---|---|
| Cheapest legal | 116.9 | yes | yes | yes |
| 1 premium top driver | 122.7 | yes | yes | yes |
| 2 premium top drivers | 132.1 | no | yes | yes |
| 2 premium + best team | 137.2 | no | yes | yes |
| 3 premium top drivers | 139.9 | no | yes | yes |
| Balanced (median everywhere) | 143.6 | no | yes | yes |
| Dearest legal | 185.9 | no | no | no |

At 130 only the cheapest roster and a single premium driver are reachable — **a median team does not fit at all**, which is exactly the failure the cap was raised from 100 to avoid.

**An interim value of 145 was wrong and is superseded.** It came from assuming 130 had been calibrated so the cheapest roster sat at ~80% of the cap, but that ratio was measured at round 14 under the *new* prices; the actual calibration was done at round 13, where 88.6 / 130 is 68%. Scaling from a figure the design never used produced a cap that still only cleared the balanced roster by 1.4 — affording exactly one balanced team is the same failure wearing a larger number, and playing the game surfaced it immediately.

At **160** every archetype above is comfortably reachable while buying every premium pick stays 26 out of reach, so giving something up remains mandatory.

Leagues already under way were credited the difference as a `cap_adjustment` ledger entry rather than by rewriting their opening balance, so the ledger still explains how a member's balance got where it is.

Note that constructors are a larger lever than expected: a set of three ranges from 15.0 to 74.0, rivalling the driver spread, so "expensive drivers with cheap teams" is a genuine strategy.

## 5a. Scoring

Normal driver scoring **adopts the official F1 Fantasy table** documented in §10 — qualifying 10→1 for P1–P10, race points 25/18/15/12/10/8/6/4/2/1, ±1 per position gained or lost against the grid, +10 fastest lap, +10 Driver of the Day, −20 for a DNF, −5 for a qualifying disqualification or no time set. It is already balanced against real F1 outcomes and familiar to anyone who has played the official game.

**Overtakes score 1:1** — every on-track pass is a point. Position changes made while the other car was in the pits are excluded at ingestion, so what is counted is overtaking done on the road.

This was previously **divided by 3**, and the reasons for that divisor still hold as facts; what changed is the judgement about them. Per-driver on-track overtakes measured across 2026: **median 9, 90th percentile 18, maximum 43**. At a point each, a busy race out-earns the 25 for winning one, so overtaking is now a large axis rather than a supporting one — a driver who starts near the back and carves through can beat a driver who leads from pole.

That was accepted deliberately: the game should score what happened rather than a scaled version of it, and "each overtake is a point" is a rule a player can hold in their head, which "every third overtake is a point" is not.

Two things remain true and are worth revisiting if the reward proves too strong:

- The feed is broader than the broadcast statistic, since it also counts passes on lapped cars. Separating those needs lap-down data no source here publishes.
- A "position held" filter — discarding a pass where the overtaken car retakes the place shortly after — removes only **13% (10s window) to 20% (30s)**, so it cannot bring the numbers down on its own.

**If it needs correcting, the lever is a per-race cap, not a divisor**, so that each pass still counts as one and only the outliers are trimmed.

**The reverse-scored constructor is scored per race**, not on championship standing: constructors are ranked by their drivers' combined finishing positions that weekend, and the worst-placed team pays the most. Season standings barely move, so a standings-based version would pay nearly the same number every week — a slot that costs budget but involves no live outcome.

**The backmarker slot pays cost cap rather than points** (see §4). A DNF pays nothing, in either the backmarker or reverse-constructor slot: paying maximum for a retirement would make "whoever crashes most" the optimal pick.

**A constructor scores the sum of its two drivers' fantasy points.** This matches the official game. The official also adds constructor-only bonuses (Q3 progression, pit-stop times); those are deliberately omitted rather than half-implemented, since the pit-stop bonus depends on stationary times neither upstream source publishes.

Consequence worth watching in playtesting: because a constructor sums two drivers, its slots carry roughly **double a driver slot's variance**. Scoring the real 2026 Monza race — 7 retirements — produced constructor slots at −31 and −17, and a premium roster costing 114.0 scored *less* (34) than a cheaper one at 130.2 (41). Attrition races swing heavily on constructor picks.

### Standings

- **Duel leagues rank on match points**, with cumulative fantasy points as the tiebreak — a fairer split than an arbitrary one, and it needs no extra data.
- **Free-for-all leagues rank on cumulative fantasy points** directly.
- **Members who have not scored still appear**, on zero. A table that omits them hides who is actually in the league.

Measured over three real 2026 races (R11–R13) with three fixed rosters, totals came out at **353, 5 and −73**. Two things follow. Scores swing enormously between strategies over just three races, and a season total can go **deeply negative** — driven by the constructor variance noted above, since a poor pair of constructors compounds every attrition race. Worth watching in playtesting: if negative totals feel punishing rather than dramatic, the lever is a floor on constructor scores rather than a change to driver scoring.

### Decisions on scoring edge cases

- **A member who fields no roster scores zero.** No separate forfeit rule: zero already loses to anyone who picked, and a penalty on top would punish the same omission twice. They still get a `round_scores` row so the standings show the zero rather than the member vanishing from that round.
- **A drawn duel splits the point** — win 1, draw 0.5, loss 0, the standard convention. Voiding the point would discard a week that actually happened.

## 6. Chips

Turbo Driver and Konstruktor Boost began here as unlimited, always-available chips. They are **no longer chips at all** — being free *and* unlimited made playing them a non-decision, so they became the weekly 2× nominations on the roster (§4a).

Every remaining chip follows a shared rule: **1 free use per season; additional uses are bought from the store** with cost cap. There is **no cap on rebuys** — an earlier draft capped them at ~3 per season, but price already charges for repetition, and a hard limit on top removed a strategy rather than balancing one.

| Chip | Effect |
|---|---|
| **SuperDriver** | 3x points for one week, on a driver of your choice. |
| **Final Fix** | Lets you change one roster spot **after** qualifying results are known (bypassing the normal pre-qualifying lock). |
| **Autopilot** | Retroactively applies your weekly 2x multiplier to whichever of your own drivers scored highest that week — a "can't pick wrong" safety net. |
| **No Negative** | For one week, blocks negative points across your **entire** roster (not just the reverse-scored slots). |
| **Wildcard** | Unlimited free roster changes for one transfer window/week only (see §7 for normal change costs). Does not turn off the cost permanently — only for that one week. |
| **Unlimited cost cap (one race)** | Removes the budget/cost-cap limit for a single race weekend. Does **not** bypass the 3-top/3-mid/1-backmarker tier structure — you still need a legal roster shape, just without a spending cap on it. (This is the same idea as the original notes' separately-listed "chip without budget restrictions" — one chip, not two.) |

### Chip prices and limits

Prices run **1–3** against a 160 cost cap. A single chip is deliberately cheap: a chip you cannot afford to use is only a menu item. The brake is repetition, not the one-off — with no season limit, playing SuperDriver every remaining round of a 23-round season costs 22 × 3 = 66, over a third of the budget, which is the same as giving up a premium driver for the year. One chip is a small decision; a habit is a large one.

Within the range, strength sets the price: the 3× and the cap lift at 3, the ones that change what you may pick at 2, the safety net at 1.

| Chip | Price | Free uses |
|---|---|---|
| SuperDriver | 3 | 1 |
| Unlimited Cost Cap | 3 | 1 |
| Final Fix | 2 | 1 |
| Autopilot | 2 | 1 |
| Wildcard | 2 | 1 |
| No Negative | 1 | 1 |

Turbo Driver and Konstruktor Boost are **no longer chips**. Turbo Driver became the bracket captaincies (§4a); the constructor boost was dropped outright.

**There is no season limit on chip use.** The only limit is per race: one chip of a given kind per round, since stacking two multipliers on one result swings far beyond what the scoring model is balanced for.

Season caps of 2–3 were tried and removed. The argument for them was that a member banking cap by fielding a cheap roster could play the strongest chip every week — but that is a trade they already paid for. Chips are bought with the same currency that buys drivers, so playing SuperDriver every round means fielding a materially worse team all season. Price is the brake, and it is a brake the player chooses to press. A hard cap on top of it removed a strategy rather than balancing one.

**Ordering matters and is fixed**: multipliers apply first, then No Negative. The other way round, doubling a −20 after cancelling it would reintroduce the negative the chip was bought to prevent. Autopilot resolves last among the multipliers, since it targets whichever driver actually scored highest, and it skips a driver an explicit multiplier already covers so the two cannot compound.

Measured on the real 2026 Monza round against a roster scoring 193: Turbo +65, Konstruktor +94, No Negative +30, SuperDriver **+130**. Worth watching — SuperDriver returning 130 points for 20 cost cap is a very high return, and if it proves dominant the lever is its price rather than the multiplier itself.

### Explicitly dropped chips
- The opponent-hindering chip (halve/lock an opponent's driver) — dropped as unbalanced/unfun in a 1v1 duel context.
- The illegible tire-strategy/distraction-bonus chip from the original notes — dropped; the handwriting was unreadable and there was nothing concrete to design against.
- Chip-slot counts varying "per league class" — deferred to the eventual public-product phase (§1), not designed for now.

## 7. Roster changes (transfers)

- **2 free changes per round**, matching the official game. One would make any reaction to a price move or a mid-season driver swap punitive; unlimited would make the cap irrelevant, since you could always chase the best-value picks.
- **4.0 cost cap per change beyond the allowance** — the price of the cheapest possible driver, so an extra transfer costs about as much as a backmarker and three or four cost a real upgrade. The official game charges points; charging the cap keeps every cost in this game denominated in one currency (§2).
- A roster's first submission in a round is not a transfer — only later edits are.
- The Wildcard chip (§6) removes this cost entirely for one week when used.

### Ledger mechanics

Nine reasons move the cap, and each writes its own entry so the balance is always explainable:

- **Opening balance** is granted by a database trigger on joining, not by application code. It is atomic with the membership row, so a member can never exist without a balance, and the amount is read from the league rather than supplied by the caller. `cost_cap_entries` grants no INSERT to `authenticated` at all — a member who could write their own ledger could simply credit themselves.
- **A swap records a sale and a purchase**, not a single net figure, so the ledger reads like what happened rather than hiding which competitor each half belonged to.
- **A sale returns the competitor's current price**, not what was paid. This is what makes holding a riser profitable and dumping a faller costly.
- **Price drift is applied symmetrically** — rises credit, falls charge. A one-way ratchet would remove any downside to a pick whose value craters, which is most of what makes pricing a real decision. Only competitors held across both rounds drift; anything bought or sold is already accounted for by its own entry.
- **Drift and payouts are replaced on re-scoring**, not appended, so a stewards' correction cannot credit a backmarker payout twice. Verified against the real Monza round: re-scoring left the balance unchanged at 139.8.

### Bank versus spending power

The ledger balance is the **bank** — buying a roster deducts its cost. The roster itself remains an asset, since swapping a slot sells the outgoing pick back at its current price. So:

```
spending power = bank + value of what is currently held
```

Validating a roster against the bank alone double-counts the original purchase and makes every held roster look unaffordable the moment it is bought. This was a real bug, caught by simulating successive edits against live prices: a roster costing 94.5 bought from 130 left a bank of 35.5, and the next edit was then rejected as "over budget by 78.8" despite being perfectly affordable.

The resulting invariant is worth keeping: **swapping conserves total wealth; only fees consume it.** Verified across three successive edits at real prices — spending power held at exactly 130.0 through two free swaps and fell to exactly 126.0 after one 4.0 fee.

Note the free allowance is tracked on the roster (`transfers_used`), not derived from the ledger. Purchase entries cannot distinguish a first roster fill (not a transfer) from a later edit (which is one), and without the counter, saving twice would grant the allowance twice.

## 8. Betting (Wetten)

- Stakes and payouts are in cost cap directly (drawn from spare/uncommitted cap), capped per bet.
- **A bet requires a complete roster for that round.** Both come out of the same cap and the roster is the larger claim on it — at ~117 for the cheapest legal team against a 150 budget, a single maximum stake is enough to make fielding a team impossible. Betting is optional and fielding a team is not, so the team goes first. Enforced by an RLS policy (`has_complete_roster`), not only in the Server Action, since an action takes a direct POST and this is a rule about money.
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

- **Most overtakes** — settles on our own ingested OpenF1 overtake feed, with position changes caused by the overtaken car pitting filtered out. This is stated in the UI when the bet is placed.

  Measured across all 39 ingested races 2023–2026, on-track counts run at a median of **118–158 per race depending on season** (full range 66–430), against a broadcast figure that is typically 30–60. OpenF1 logs every position change and counts a multi-car pass once per car, so the count is consistently several times higher — this is systematic across every season, not a quirk of one chaotic race. The *ranking* of drivers is what the market settles on and that remains sound; the absolute number should not be presented to players as "the" overtake count without that caveat.
- **Fastest pit stop** — settles on pit *lane* time, not the ~2s stationary time quoted on TV. Neither jolpica nor OpenF1 exposes stationary time (OpenF1's `stop_duration` field is null across every session checked, 2024 and 2026 alike). Stops taken during a red-flag suspension legitimately record in the tens of minutes; since the market takes the minimum, those exclude themselves.
- **Safety car (yes/no)** — available only from OpenF1's race-control feed. Full and virtual safety cars are distinguished at ingestion.

- **Lap-1 leader is currently hidden.** jolpica publishes lap-by-lap timing, but it is not ingested, so the market cannot be settled. A market that always voids and refunds looks broken rather than generous, so it is withheld until the data exists.

### Betting balance numbers

- **Maximum stake: a fifth of the bank.** Without a ceiling, one all-in bet could decide a season and make the roster — the actual game — irrelevant. A fifth is enough to matter and survivable when it loses.
- **Stakes come from the bank**, the uncommitted balance, not from cap tied up in a roster. A member cannot stake money that is currently a driver.
- **Stakes are charged when the bet is placed**, not at settlement. Otherwise the same cap could be staked on every market at once.
- **One bet per market per round**, enforced by a unique constraint. Without it a member could back every driver in a market and profit regardless of the result.
- **A bet cannot be withdrawn or edited** — there is no update or delete policy on the table, which is the point of a bet.
- **Odds are shaded below true odds** so betting is not a better expected return than picking a good roster: naming one winner from twenty pays 4x, not 20x, because the field is not uniform. Pre-qualifying bets pay 1.5x the market odds, since they are placed before the grid is known.
- **A market with no data voids and refunds** rather than grading as a loss. The member cannot be blamed for a feed that did not publish.
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

### League and roster data model

- **Rosters are snapshotted per round**, not stored as one mutable row per player. Scoring a past race requires the roster exactly as it stood when that round locked, and rule changes during balancing mean history gets recomputed — which a mutable roster would make impossible.
- **Cost cap is an append-only ledger**, not a running balance column; the balance is the sum of entries. Slower to read, but it answers "why is my cap this number?" when the figure moves for nine different reasons (purchases, sales, price drift, transfer fees, chip purchases, bet stakes and payouts, backmarker payouts, and the opening balance).
- **Roster slot shape is enforced by database constraints**, not application code: a driver cannot occupy a constructor slot, the backmarker and reverse-constructor slots accept only index 1, normal constructors cap at 2, and the same driver cannot fill two slots. A malformed roster cannot reach the database by any path.
- **Rosters become visible to other league members only once the round locks**, so picks cannot be copied before the deadline. Enforced in row-level security, not in the UI.
- **The cost cap ledger is private to its owner.** A rival knowing your spare cap would reveal your betting capacity.
- **Deleting an account is blocked while it owns a league** (`on delete restrict` on `leagues.owner_id`). This is deliberate — cascading would destroy a shared league and every other member's history — but it means account deletion needs an ownership-transfer step, which does not exist yet.

Verified against the live database with 12 constraint tests covering occupant/slot-type mismatches, index bounds, duplicate picks, negative prices, duplicate rosters, self-duels, and invalid enum values.

**Prices are populated by a derived job** (`npm run prices`), which runs after ingestion in the daily workflow. Prices upsert on their key, so re-running after a results correction rewrites them.

Populated across all 83 ingested rounds: 1,863 driver prices and 843 constructor prices. Only 2023 R01 is priced entirely at the floor, which is correct — nothing precedes it, so no form exists to tell competitors apart. The job reports any other round in that state, since elsewhere it would mean a gap in results.

Measured behaviour: prices span the full 4.0–28.0 band, and the median round-to-round change is 0.9 with a maximum of 3.9 — so a member's cost cap drifts steadily rather than lurching.

### Your team persists between rounds

A roster carries into the next round automatically, and money does not move when it does: the drivers were bought when first picked, and price drift is credited separately by scoring, so re-recording a purchase would charge for them twice. The carried roster is revalued at the new round prices and gets a fresh transfer allowance.

This is what makes the transfer rules mean anything. Without it every round began with an empty grid — so nobody was transferring, they were rebuilding, the fee never triggered, and a member who did not open the app scored zero rather than fielding the team they already had.

**Auto-swap happens here.** If a carried driver has left their slot bracket, they are replaced by the cheapest eligible driver not already on the roster. Cheapest rather than best on purpose: the swap is involuntary, so it must not silently spend cap the member has not got.

### Chips that change what is permitted

Five chips change scoring; three change what a member may do, and are enforced when the roster is saved rather than when it is scored:

- **Wildcard** makes every change free for the round.
- **Unlimited Cost Cap** lifts the spending limit. Tier rules still apply — it buys budget, not a free hand.
- **Final Fix** permits exactly one slot change after the round has locked. A flag on the roster records that it has been spent, since the play record alone would let a member keep editing a locked roster one slot at a time.

### Roster picker

The picker is slot-first, not a list: seven driver cards and three constructor cards, each showing a plus when empty. Tapping one opens a chooser filtered to what may legally fill it, so the bracket rules are visible while picking rather than only enforced afterwards. Options that cannot be afforded are listed but disabled, since knowing what is out of reach is part of the decision.

Affordability inside a chooser is judged against remaining cap **plus whatever that slot currently holds**, because swapping refunds the outgoing pick — the same bank-plus-held-value rule as the cap itself.

The chooser sorts by price, form or name, ascending or descending; tapping the active field flips direction. Price and form default to descending because the expensive and in-form options are what gets scanned first. Form is points over the rolling 5-race window — the same signal behind price and tier, so sorting by it shows what the price is actually reacting to rather than a second opinion.

Driver portraits and team colours come from OpenF1 and are stored on the driver rather than fetched at render time: a page load must not depend on an API limited to 30 requests a minute. jolpica carries neither.

### Calendar versus results

Two separate ingestion paths, because they answer different questions.

**Results ingestion** refuses a round with no published results — correct, since a race that has not run has nothing to score. But on its own that means the database only ever holds *past* rounds, and every stored round has already locked. A fantasy game in that state has nothing to pick for: the roster builder lands on a finished race and the schedule generator reports that every round is over.

**Calendar ingestion** stores the schedule regardless — race names, dates and qualifying times for the whole season. Rounds that have run get updated in place by results ingestion afterwards; rounds still to come sit there with their lock deadline set. It deliberately does not touch `openf1_session_key`, which results ingestion owns — overwriting it would unlink rounds already matched to an OpenF1 session.

Relatedly, the round a roster is picked for is the **next round whose qualifying has not started**, not the most recently ingested one. The latter is always a race that has already run.

### Ingestion design

- Scheduled via Supabase `pg_cron`, polling daily. Results land within ~24h of a race, so daily is sufficient; running it next to the database avoids Vercel's free-tier cron restrictions.
- **Raw payloads are stored verbatim alongside normalised tables.** Since every balancing number in §12 is still open, scoring rules will change — and replaying a rule change against already-ingested races is only possible if the original payloads are kept. Re-fetching is not a reliable fallback given jolpica's request budget and OpenF1's 2023 floor.
- The two APIs share no identifier: jolpica keys drivers by slug (`max_verstappen`), OpenF1 by car number. They're joined on the car number actually raced, taken from jolpica's per-race results.
- Transform logic is pure and dependency-free, so it is unit-testable offline and reusable from either a Next.js route or a Supabase Edge Function.

## 12. Open items for later (not blocking, explicitly deferred)

- Multi-league/public-product infrastructure (§1).
- Per-league-class chip slot counts (§1, §6).
- Exact numeric balancing: cost cap starting amount, bet stake cap percentage, free-transfer count per week, cost-per-extra-transfer, chip rebuy cap count and price. These need playtesting, not more design discussion.
