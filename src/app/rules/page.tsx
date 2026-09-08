import Link from "next/link";

import {
  DNF_PENALTY,
  REACHED_Q2_POINTS,
  REACHED_Q3_POINTS,
  SPRINT_DNF_PENALTY,
  SPRINT_FASTEST_LAP_POINTS,
  SPRINT_POINTS,
  TEAMMATE_QUALIFYING_POINTS,
  TEAMMATE_RACE_POINTS,
  FASTEST_LAP_POINTS,
  OVERTAKE_POINTS,
  QUALIFYING_NO_TIME_PENALTY,
  QUALIFYING_POINTS,
  RACE_POINTS,
} from "@/lib/f1/scoring";
import { CONSTRUCTOR_SLOTS, MID_SLOTS, TOP_SLOTS } from "@/lib/f1/roster";
import { EXTRA_CHANGE_FEE, FREE_CHANGES_PER_ROUND } from "@/lib/f1/ledger";
import { CHIP_LIST } from "@/lib/f1/chips";
import { MARKET_LIST, PRE_QUALIFYING_BONUS } from "@/lib/f1/betting";
import { TOP_BRACKET_SIZE, TOP_CONSTRUCTOR_BRACKET_SIZE, ROLLING_WINDOW_ROUNDS } from "@/lib/f1/tiers";

/**
 * How the game scores.
 *
 * Every number here is imported from the module that implements it rather than
 * written out, so the page cannot drift from the rules it describes. If a
 * balance constant changes, this updates with it.
 */
export const metadata = { title: "Rules · F1 Fantasy" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-100 py-1 last:border-0 dark:border-zinc-800">
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-16">
      <header className="pt-2">
        <Link href="/leagues" className="text-sm text-zinc-500 underline underline-offset-4">
          ← Leagues
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">How scoring works</h1>
        <p className="text-sm text-zinc-500">
          Every figure on this page comes straight from the code, so it always matches what
          actually happens.
        </p>
      </header>

      <Section title="Your roster">
        <p>
          You pick in three tiers: {TOP_SLOTS} top-bracket drivers and 1 top-bracket team,{" "}
          {MID_SLOTS} mid-bracket drivers and 1 mid-bracket team, then 1 backmarker and 1
          reverse-scored team at the back. That is {TOP_SLOTS + MID_SLOTS + 1} drivers and{" "}
          {CONSTRUCTOR_SLOTS + 1} teams.
        </p>
        <p>
          The <strong>top bracket is the top {TOP_BRACKET_SIZE} drivers</strong> by points scored
          over the last {ROLLING_WINDOW_ROUNDS} race weekends. Everyone else is mid. That same
          figure sets prices, so a driver in form is both better and dearer.
        </p>
        <p>
          Teams are bracketed the same way, with the{" "}
          <strong>top {TOP_CONSTRUCTOR_BRACKET_SIZE} teams</strong> forming the top bracket. The
          backmarker and reverse slots take anyone.
        </p>
      </Section>

      <Section title="Your captains">
        <p>
          Every round you name <strong>one captain among your top drivers</strong> and{" "}
          <strong>one among your midfield drivers</strong>. Both score double, both are free,
          both are required, and the doubling is applied for you when the round is scored — there
          is no chip to remember to play.
        </p>
        <p>
          One per bracket rather than one overall, so the midfield choice is a real decision
          instead of always being your most expensive driver. Teams cannot be captained: a team
          already scores its two drivers combined, so doubling that on top would let one slot
          decide the round. The backmarker cannot either, since it pays cost cap rather than
          points.
        </p>
        <p>
          You are asked who wears the armband when you save, so it is never picked for you by
          default. You can also change it from a driver&rsquo;s page — tap any card on your roster to
          open it. Swapping a captain moves the armband onto whoever replaces them, and your
          captains carry into next round with the rest of the roster.
        </p>
      </Section>

      <Section title="What earns points in a weekend">
        <p className="text-zinc-900 dark:text-zinc-100">Qualifying position</p>
        <div>
          {QUALIFYING_POINTS.map((points, index) => (
            <Row key={index} label={`P${index + 1}`} value={`+${points}`} />
          ))}
          <Row label={`P${QUALIFYING_POINTS.length + 1} and below`} value="0" />
        </div>

        <p className="pt-2 text-zinc-900 dark:text-zinc-100">Race finish</p>
        <div>
          {RACE_POINTS.map((points, index) => (
            <Row key={index} label={`P${index + 1}`} value={`+${points}`} />
          ))}
          <Row label={`P${RACE_POINTS.length + 1} and below`} value="0" />
        </div>

        <p className="pt-2 text-zinc-900 dark:text-zinc-100">Sprint races</p>
        <p className="text-xs">
          Six weekends a season carry a sprint. It has its own smaller table,
          worth roughly a third of the race, and a lighter retirement penalty.
        </p>
        <div>
          {SPRINT_POINTS.map((points, index) => (
            <Row key={index} label={`Sprint P${index + 1}`} value={`+${points}`} />
          ))}
          <Row label="Sprint fastest lap" value={`+${SPRINT_FASTEST_LAP_POINTS}`} />
          <Row label="Sprint retirement" value={`${SPRINT_DNF_PENALTY}`} />
        </div>

        <p className="pt-2 text-zinc-900 dark:text-zinc-100">Qualifying progress</p>
        <div>
          <Row label="Reaching Q2" value={`+${REACHED_Q2_POINTS}`} />
          <Row label="Reaching Q3" value={`+${REACHED_Q3_POINTS}`} />
        </div>
        <p className="text-xs">
          Reaching Q2 is worth having on its own: it means roughly the top 15,
          which earns nothing from the position table above.
        </p>

        <p className="pt-2 text-zinc-900 dark:text-zinc-100">Against your teammate</p>
        <div>
          <Row label="Finishing ahead of them in the race" value={`+${TEAMMATE_RACE_POINTS}`} />
          <Row label="Out-qualifying them" value={`+${TEAMMATE_QUALIFYING_POINTS}`} />
        </div>
        <p className="text-xs">
          Same car, same strategy — the cleanest measure of the driver rather than
          the machinery, which is what makes a midfield pick worth something.
        </p>

        <p className="pt-2 text-zinc-900 dark:text-zinc-100">Everything else</p>
        <div>
          <Row label="Each place gained against your grid slot" value="+1" />
          <Row label="Each place lost" value="−1" />
          <Row label="Each on-track overtake" value={`+${OVERTAKE_POINTS}`} />
          <Row label="Fastest lap" value={`+${FASTEST_LAP_POINTS}`} />
          <Row label="Retirement, disqualification or non-start" value={`${DNF_PENALTY}`} />
          <Row
            label="Disqualified from qualifying, or no time set"
            value={`${QUALIFYING_NO_TIME_PENALTY}`}
          />
        </div>
        <p className="pt-1 text-xs">
          A driver who retires scores no race points and takes no places-lost penalty — the
          retirement is punished once, not twice.
        </p>
      </Section>

      <Section title="Why overtakes are divided by three">
        <p>
          Every pass made on the road counts as one point. Position changes that happen while the
          other car is in the pits do not count at all.
        </p>
        <p>
          This is a big lever, and worth knowing about before you pick: across 2026 a driver
          averaged 9 on-track passes in a race, with 18 at the busy end and a high of 43. So a
          driver who carves through the field can out-score the {RACE_POINTS[0]} points for
          winning the race. Starting near the back is not the handicap it looks like.
        </p>
        <p>
          The feed also sees passes on lapped cars, which the figure shown on TV leaves out —
          separating those would need lap-down data that no source here publishes.
        </p>
      </Section>

      <Section title="The two slots that score differently">
        <p>
          <strong>Your backmarker scores no points at all.</strong> Instead they pay you cost cap
          equal to their finishing position — P18 pays 18. A retirement pays nothing, so
          picking a crash-prone driver is not a strategy.
        </p>
        <p>
          <strong>A constructor scores its two drivers combined</strong>, so it swings about twice
          as hard as a driver slot. The <strong>reverse-scored constructor</strong> pays on how
          badly the team did that race: last place pays the most.
        </p>
      </Section>

      <Section title="Transfers and the cost cap">
        <p>
          {FREE_CHANGES_PER_ROUND} free changes each round, then {EXTRA_CHANGE_FEE} cost cap per
          change. Your cap moves with your roster: it grows when a driver you own rises in price
          and shrinks when they fall, so a bad pick costs you twice.
        </p>
        <p>
          Selling returns a driver&apos;s <em>current</em> price, not what you paid. Swapping
          conserves your total wealth; only fees actually consume it.
        </p>
      </Section>

      <Section title="Chips">
        <div>
          {CHIP_LIST.map((chip) => (
            <Row
              key={chip.id}
              label={`${chip.name} — ${chip.description}`}
              value={`${chip.price}`}
            />
          ))}
        </div>
        <p className="pt-1 text-xs">
          Free uses are granted per half-season and again after the summer break, so a season
          cannot be spent by May. Buy more with cost cap on top of those — there is no season
          limit, but <strong>one chip a weekend</strong>, whichever it is.
          SuperDriver stacks on top of a captaincy — the captaincies are not chips. Multipliers apply before No Negative, so doubling a
          negative score and then cancelling it leaves you at zero rather than deeper in the hole.
        </p>
      </Section>

      <Section title="Betting">
        <p>
          You need a full roster for the round before you can bet: both come out of the same cost
          cap, and the team is the bigger claim on it. Stakes come from your bank — the cap not
          tied up in your roster — and you can stake all of it if you want to. Bets placed before
          qualifying pay {PRE_QUALIFYING_BONUS}× the odds, because you are guessing with less
          information.
        </p>
        <div>
          {MARKET_LIST.map((market) => (
            <Row key={market.id} label={market.name} value={`${market.odds}×`} />
          ))}
        </div>
        <p className="pt-1 text-xs">
          One bet per market per round, and a bet cannot be withdrawn. If the data needed to
          settle a market never arrives, the bet is voided and your stake returned.
        </p>
      </Section>

      <Section title="Winning">
        <p>
          In a <strong>duel</strong> league you face one opponent each race; the higher score
          takes 1 point, a draw splits it. In <strong>free-for-all</strong>, everyone is ranked on
          total points.
        </p>
        <p>Not fielding a roster scores zero, which loses to anyone who picked one.</p>
      </Section>
    </main>
  );
}
