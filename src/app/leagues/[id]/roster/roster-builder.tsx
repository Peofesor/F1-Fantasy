"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  MID_SLOTS,
  TOP_SLOTS,
  validateRoster,
  type RosterSelection,
} from "@/lib/f1/roster";
import type { Tier } from "@/lib/f1/tiers";
import type { ChipRow } from "@/lib/f1/chips";
import { saveRoster, type SaveState } from "./actions";
import { driverSeason, type DriverSeasonState } from "./driver-actions";
import { ChipsPanel } from "./chips-panel";

export interface PickOption {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  tier: Tier;
  headshotUrl?: string;
  /**
   * A team's current line-up. Constructors have no image of their own, so a
   * team is shown as the drivers it fields — recognisable at a glance, and
   * drawn from media already stored for the drivers. A driver with no portrait
   * upstream (Lindblad, at time of writing) still takes a seat on the badge, so
   * a team never renders as a single face and reads as a driver card.
   */
  lineup?: { name: string; headshotUrl?: string }[];
  /**
   * What the slot card shows. A three-part name wrapped to three lines and ran
   * into the price; the surname alone is also how the sport names drivers.
   * Teams keep their full name, which is already short.
   */
  shortName: string;
  /** Six-digit hex without the hash. */
  colour?: string;
  /** Points over the rolling window — the signal behind price and tier. */
  form: number;
}

type SortField = "price" | "form" | "name";

/** Column headings, which double as the sort controls. */
const SORT_LABELS: Record<SortField, string> = {
  name: "Name",
  price: "Price",
  form: "Form",
};

/** The second line under a heading, where one is needed to explain the figure. */
const SORT_SUBLABELS: Partial<Record<SortField, string>> = {
  form: "Pts last 5 races",
};

/**
 * Column widths, shared by the heading row and every option row so the two line
 * up. A plain list let each row size its own columns, which put the headings
 * over nothing in particular.
 */
const TABLE_COLUMNS = "grid-cols-[1fr_3.25rem_4.25rem]";

/**
 * Default direction per field.
 *
 * Price and form open descending because the expensive and in-form options are
 * what you scan for first; name opens ascending because a reverse alphabet is
 * never what anyone wants.
 */
const DEFAULT_DESCENDING: Record<SortField, boolean> = {
  price: true,
  form: true,
  name: false,
};

interface Props {
  leagueId: string;
  costCap: number;
  transfersUsed: number;
  freeTransfers: number;
  drivers: PickOption[];
  constructors: PickOption[];
  initialSelection: RosterSelection;
  locked: boolean;
  round: number;
  /** Spare cap — what a chip is bought with. */
  balance: number;
  chips: ChipRow[];
  chipDriverOptions: { id: string; name: string }[];
  chipConstructorOptions: { id: string; name: string }[];
  /** Open bets for this round, shown as a count on the Bets button. */
  betsPlaced: number;
}

/**
 * Which roster position a card represents.
 *
 * Slots are addressed individually rather than as "the next free one" so that
 * tapping a specific empty card opens a chooser filtered to what may legally go
 * there — the bracket rules become visible in the UI instead of being enforced
 * only after the fact.
 */
type SlotKind = "top" | "mid" | "backmarker" | "constructorTop" | "constructorMid" | "reverse";

const DRIVER_KINDS: SlotKind[] = ["top", "mid", "backmarker"];

/**
 * Slots that can carry a captaincy.
 *
 * One captain per driver bracket. The backmarker is excluded because it pays
 * cost cap rather than points, so doubling it would double nothing, and
 * constructors are excluded because one already scores its two drivers
 * combined — doubling that on top let a single slot decide the round.
 */
const CAPTAINABLE_KINDS: SlotKind[] = ["top", "mid"];

interface Slot {
  kind: SlotKind;
  index: number;
  label: string;
  occupantId: string | null;
}

const SLOT_LABELS: Record<SlotKind, string> = {
  top: "Top driver",
  mid: "Mid driver",
  backmarker: "Backmarker",
  constructorTop: "Top team",
  constructorMid: "Mid team",
  reverse: "Reverse team",
};

/**
 * The picker's working copy of a roster.
 *
 * Positions are held open with nulls rather than compacted, because position
 * carries meaning: the first constructor fills the top-bracket slot and the
 * second the mid one. A plain array would collapse when the top slot is emptied
 * and silently move the mid team into a bracket it does not belong to.
 */
interface Draft {
  top: (string | null)[];
  mid: (string | null)[];
  backmarker: string | null;
  constructorTop: string | null;
  constructorMid: string | null;
  reverseConstructor: string | null;
  /** One captain per driver bracket, picked here rather than played as chips. */
  topCaptainId: string | null;
  midCaptainId: string | null;
}

function padded(ids: readonly string[], length: number): (string | null)[] {
  return Array.from({ length }, (_, index) => ids[index] ?? null);
}

function toDraft(selection: RosterSelection): Draft {
  return {
    top: padded(selection.top, TOP_SLOTS),
    mid: padded(selection.mid, MID_SLOTS),
    backmarker: selection.backmarker,
    constructorTop: selection.constructors[0] ?? null,
    constructorMid: selection.constructors[1] ?? null,
    reverseConstructor: selection.reverseConstructor,
    topCaptainId: selection.topCaptainId,
    midCaptainId: selection.midCaptainId,
  };
}

/**
 * Drops the empty positions so the shared validator sees the same shape the
 * server will store. A half-filled roster simply reads as incomplete.
 */
function toSelection(draft: Draft): RosterSelection {
  const filled = (ids: (string | null)[]) => ids.filter((id): id is string => Boolean(id));
  return {
    top: filled(draft.top),
    mid: filled(draft.mid),
    backmarker: draft.backmarker,
    constructors: filled([draft.constructorTop, draft.constructorMid]),
    reverseConstructor: draft.reverseConstructor,
    topCaptainId: draft.topCaptainId,
    midCaptainId: draft.midCaptainId,
  };
}

function slotsOf(draft: Draft): Slot[] {
  const slot = (kind: SlotKind, index: number, occupantId: string | null): Slot => ({
    kind,
    index,
    label: SLOT_LABELS[kind],
    occupantId,
  });

  return [
    ...draft.top.map((id, index) => slot("top", index, id)),
    ...draft.mid.map((id, index) => slot("mid", index, id)),
    slot("backmarker", 0, draft.backmarker),
    slot("constructorTop", 0, draft.constructorTop),
    slot("constructorMid", 0, draft.constructorMid),
    slot("reverse", 0, draft.reverseConstructor),
  ];
}

/**
 * The three rows the roster is picked in.
 *
 * Grouping by bracket rather than by drivers-then-teams makes the shape of the
 * rules visible: each row is a tier, and the team picked in it comes from the
 * same tier as the drivers beside it.
 */
/**
 * Each row is a tier, split into its drivers and its team.
 *
 * The two groups are set apart rather than sitting in one even strip, so the
 * team reads as a different kind of pick instead of a fourth driver. `filler`
 * holds the short last row to the same card width as the rows above it: without
 * it, two cards sharing a row would stretch to half the width each.
 */
const ROWS: {
  title: string;
  hint: string;
  /** Called out under the heading when the row does not score the usual way. */
  warning?: string;
  groups: SlotKind[][];
  filler?: number;
}[] = [
  {
    title: "Top",
    hint: "3 drivers + 1 team",
    groups: [["top", "top", "top"], ["constructorTop"]],
  },
  {
    title: "Midfield",
    hint: "3 drivers + 1 team",
    groups: [["mid", "mid", "mid"], ["constructorMid"]],
  },
  {
    title: "Back of the grid",
    hint: "1 driver + 1 team",
    // The one row that reverses the instinct the other two train, so it is
    // stated here rather than left to the rules page. Worded for both slots at
    // once: they reward a bad finish by different means — the driver pays cost
    // cap, the team scores points — and the header has room for the shared
    // half of that, not the mechanism.
    warning: "Reversed — a worse finish is worth more, but a retirement pays nothing",
    groups: [["backmarker"], ["reverse"]],
    filler: 2,
  },
];

export function RosterBuilder({
  leagueId,
  costCap,
  transfersUsed,
  freeTransfers,
  drivers,
  constructors,
  initialSelection,
  locked,
  round,
  balance,
  chips,
  chipDriverOptions,
  chipConstructorOptions,
  betsPlaced,
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialSelection));
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [detailSlot, setDetailSlot] = useState<Slot | null>(null);
  const [chipsOpen, setChipsOpen] = useState(false);
  const [askingCaptains, setAskingCaptains] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  // Where a blocked navigation was heading, held while the player decides.
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  // What was last sent to the server, so a saved roster is not called unsaved.
  // State rather than a ref because it is read while rendering.
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [state, formAction, saving] = useActionState<SaveState, FormData>(saveRoster, null);

  const { tiers, constructorTiers, driverPrices, constructorPrices, byId } = useMemo(() => {
    const tiers = new Map<string, Tier>(drivers.map((d) => [d.id, d.tier]));
    const constructorTiers = new Map<string, Tier>(constructors.map((c) => [c.id, c.tier]));
    const driverPrices = new Map(drivers.map((d) => [d.id, d.price]));
    const constructorPrices = new Map(constructors.map((c) => [c.id, c.price]));
    const byId = new Map([...drivers, ...constructors].map((o) => [o.id, o]));
    return { tiers, constructorTiers, driverPrices, constructorPrices, byId };
  }, [drivers, constructors]);

  const selection = useMemo(() => toSelection(draft), [draft]);

  // The same validator the Server Action runs, so what you see while picking
  // matches what the server will accept.
  const validation = useMemo(
    () =>
      validateRoster(selection, {
        tiers,
        constructorTiers,
        driverPrices,
        constructorPrices,
        costCap,
      }),
    [selection, tiers, constructorTiers, driverPrices, constructorPrices, costCap],
  );

  // Unsaved means: different from what the page loaded, and different from
  // whatever the last successful save sent. Comparing the normalised selection
  // rather than the draft keeps a slot cleared and refilled with the same pick
  // from counting as a change.
  const currentSnapshot = JSON.stringify(selection);
  const savedSnapshot = state && "ok" in state ? submitted : null;
  const unsaved =
    !locked &&
    currentSnapshot !== JSON.stringify(initialSelection) &&
    currentSnapshot !== savedSnapshot;

  useEffect(() => {
    if (!unsaved) return;

    // Covers reloads, closing the tab and typing another address. The browser
    // shows its own wording here; nothing can change that.
    const warnOnUnload = (event: BeforeUnloadEvent) => event.preventDefault();

    /**
     * Catches in-app navigation, which never reaches beforeunload.
     *
     * Captured on the document rather than wired into each link, because the
     * links that lead away from here — the league tabs, the scoring link — are
     * rendered by components this one does not own.
     */
    const warnOnLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as HTMLElement | null)?.closest("a");
      const href = link?.getAttribute("href");
      if (!link || !href || link.target === "_blank") return;
      // Same-page anchors and external links are not our problem.
      if (!href.startsWith("/")) return;

      event.preventDefault();
      setLeavingTo(href);
    };

    window.addEventListener("beforeunload", warnOnUnload);
    document.addEventListener("click", warnOnLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", warnOnUnload);
      document.removeEventListener("click", warnOnLinkClick, true);
    };
  }, [unsaved]);

  const slots = slotsOf(draft);
  const bySlot = new Map(slots.map((slot) => [slot.kind + "-" + slot.index, slot]));

  /** How many picks a tier takes, and how many of them are made. */
  const rowSlots = (row: (typeof ROWS)[number]) =>
    row.groups.reduce((total, group) => total + group.length, 0);

  const rowFilled = (row: (typeof ROWS)[number]) => {
    // Walks the row the same way the render does, since a kind repeats within
    // a row and each occurrence takes the next index of that kind.
    const seen = new Map<SlotKind, number>();
    let filled = 0;
    for (const group of row.groups) {
      for (const kind of group) {
        const index = seen.get(kind) ?? 0;
        seen.set(kind, index + 1);
        if (bySlot.get(kind + "-" + index)?.occupantId) filled += 1;
      }
    }
    return filled;
  };
  const empty = slots.filter((slot) => !slot.occupantId).length;
  const needsCaptains = !draft.topCaptainId || !draft.midCaptainId;
  // Captains are collected at save time, so they do not hold the button back.
  const readyToSave = empty === 0 && validation.remaining >= 0;
  const freeRemaining = Math.max(0, freeTransfers - transfersUsed);
  const playedThisRound = chips.filter((chip) => chip.playedThisRound).length;
  const overBudget = validation.remaining < 0;

  function setSlot(slot: Slot, id: string | null) {
    setDraft((current) => {
      const replaceAt = (list: (string | null)[], index: number) =>
        list.map((existing, position) => (position === index ? id : existing));

      // A captaincy follows its holder: swapping the captain moves the armband
      // onto whoever takes the slot, so it is never silently dropped. Clearing
      // the slot drops it, and the roster reads as incomplete until it is set
      // again.
      const held = slot.occupantId;
      const nominations = {
        topCaptainId:
          slot.kind === "top" && current.topCaptainId === held ? id : current.topCaptainId,
        midCaptainId:
          slot.kind === "mid" && current.midCaptainId === held ? id : current.midCaptainId,
      };

      switch (slot.kind) {
        case "top":
          return { ...current, ...nominations, top: replaceAt(current.top, slot.index) };
        case "mid":
          return { ...current, ...nominations, mid: replaceAt(current.mid, slot.index) };
        case "backmarker":
          return { ...current, ...nominations, backmarker: id };
        case "constructorTop":
          return { ...current, ...nominations, constructorTop: id };
        case "constructorMid":
          return { ...current, ...nominations, constructorMid: id };
        case "reverse":
          return { ...current, ...nominations, reverseConstructor: id };
      }
    });
  }

  /** Hands the armband to a slot's occupant, within its own bracket. */
  function nominate(slot: Slot) {
    const id = slot.occupantId;
    if (!id || !CAPTAINABLE_KINDS.includes(slot.kind)) return;
    setDraft((current) =>
      slot.kind === "top" ? { ...current, topCaptainId: id } : { ...current, midCaptainId: id },
    );
  }

  /** Options legally allowed in a slot, excluding anyone already on the roster. */
  function optionsFor(slot: Slot): PickOption[] {
    if (DRIVER_KINDS.includes(slot.kind)) {
      const taken = new Set<string | null>([
        ...selection.top,
        ...selection.mid,
        selection.backmarker,
      ]);
      return drivers.filter((driver) => {
        if (taken.has(driver.id) && driver.id !== slot.occupantId) return false;
        // The backmarker slot is deliberately unrestricted.
        if (slot.kind === "backmarker") return true;
        return driver.tier === slot.kind;
      });
    }

    const taken = new Set<string | null>([
      ...selection.constructors,
      selection.reverseConstructor,
    ]);
    return constructors.filter((entry) => {
      if (taken.has(entry.id) && entry.id !== slot.occupantId) return false;
      if (slot.kind === "constructorTop") return entry.tier === "top";
      if (slot.kind === "constructorMid") return entry.tier === "mid";
      // The reverse slot scores on placing, so any team may fill it.
      return true;
    });
  }

  return (
    <div className="space-y-4">
      <section className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-500">
            {freeRemaining > 0
              ? `${freeRemaining} free transfer${freeRemaining === 1 ? "" : "s"}`
              : "Transfers cost cap"}
          </span>
          <span className="tabular-nums">
            <strong className={overBudget ? "text-red-600 dark:text-red-400" : ""}>
              {validation.cost.toFixed(1)}
            </strong>
            <span className="text-zinc-500"> / {costCap.toFixed(1)}</span>
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-[var(--accent)]"}`}
            style={{ width: `${Math.min(100, (validation.cost / costCap) * 100)}%` }}
          />
        </div>

        {/* The two places you leave the picker for, above the cards rather
            than below them: both are things you do *while* choosing a team,
            and saving is what you do after. */}
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setChipsOpen(true)}
            className="relative rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium dark:border-zinc-700"
          >
            Chips
            {playedThisRound > 0 && <Badge count={playedThisRound} label="played" />}
          </button>

          <Link
            href={`/leagues/${leagueId}/bets`}
            className="relative rounded-lg border border-zinc-300 px-3 py-2.5 text-center text-sm font-medium dark:border-zinc-700"
          >
            Bets
            {betsPlaced > 0 && <Badge count={betsPlaced} label="placed" />}
          </Link>
        </div>
      </section>

      {ROWS.map((row) => {
        // A kind can appear several times in a row, so each occurrence takes the
        // next index of that kind.
        const counts = new Map<SlotKind, number>();

        return (
          <section key={row.title}>
            <div className="mb-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="flex items-baseline gap-2 text-sm font-semibold">
                  {row.title}
                  {/* The slot count sits beside the name rather than in grey on
                      the far side, because how many picks a tier takes is part
                      of what the tier is — and a filled count doubles as
                      progress through the roster. */}
                  <span className="rounded-full bg-[color-mix(in_oklab,var(--accent)_22%,var(--background))] px-2 py-0.5 text-[11px] font-medium tabular-nums">
                    {rowFilled(row)}/{rowSlots(row)}
                  </span>
                </h2>
                <span className="shrink-0 text-xs text-zinc-500">{row.hint}</span>
              </div>
              {row.warning && (
                <p className="mt-0.5 text-xs font-medium text-amber-600 dark:text-amber-500">
                  {row.warning}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {row.groups.map((group, groupIndex) => (
                <div
                  key={groupIndex}
                  // Grown in proportion to how many cards it holds, so every
                  // card keeps the same width across all three rows.
                  style={{
                    flex: group.length + " 1 0%",
                    gridTemplateColumns: "repeat(" + group.length + ", minmax(0, 1fr))",
                  }}
                  className={groupIndex > 0 ? "ml-3 grid gap-2" : "grid gap-2"}
                >
                  {group.map((kind) => {
                    const index = counts.get(kind) ?? 0;
                    counts.set(kind, index + 1);
                    const slot = bySlot.get(kind + "-" + index)!;
                    return (
                      <SlotCard
                        key={kind + "-" + index}
                        slot={slot}
                        option={slot.occupantId ? byId.get(slot.occupantId) : undefined}
                        locked={locked}
                        captain={
                          slot.occupantId !== null &&
                          (slot.occupantId === draft.topCaptainId ||
                            slot.occupantId === draft.midCaptainId)
                        }
                        onOpen={() =>
                          slot.occupantId ? setDetailSlot(slot) : setOpenSlot(slot)
                        }
                      />
                    );
                  })}
                </div>
              ))}
              {row.filler ? (
                <div aria-hidden style={{ flex: row.filler + " 1 0%" }} />
              ) : null}
            </div>
          </section>
        );
      })}

      {/* Saving sits at the bottom: it is the last thing you do, and on a
          phone the bottom of the screen is where a thumb rests. */}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        {state && "error" in state && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        {state && "ok" in state && (
          <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Roster saved.
          </p>
        )}

        <form
          action={formAction}
          ref={formRef}
          onSubmit={() => setSubmitted(JSON.stringify(selection))}
        >
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="top" value={selection.top.join(",")} />
          <input type="hidden" name="mid" value={selection.mid.join(",")} />
          <input type="hidden" name="backmarker" value={selection.backmarker ?? ""} />
          <input type="hidden" name="constructors" value={selection.constructors.join(",")} />
          <input
            type="hidden"
            name="reverseConstructor"
            value={selection.reverseConstructor ?? ""}
          />
          <input type="hidden" name="topCaptainId" value={selection.topCaptainId ?? ""} />
          <input type="hidden" name="midCaptainId" value={selection.midCaptainId ?? ""} />
          {/* A full roster with no captains is savable — the prompt collects
              them on the way through, rather than the picker guessing. */}
          <button
            type={needsCaptains ? "button" : "submit"}
            onClick={needsCaptains ? () => setAskingCaptains(true) : undefined}
            disabled={!readyToSave || saving || locked}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-40"
          >
            {locked
              ? "Round locked"
              : saving
                ? "Saving…"
                : empty > 0
                  ? `Pick ${empty} more`
                  : overBudget
                    ? `Over by ${Math.abs(validation.remaining).toFixed(1)}`
                    : "Save roster"}
          </button>
        </form>
      </div>

      {validation.complete && !validation.valid && (
        <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {leavingTo && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900">
            <h3 className="text-sm font-semibold">Leave without saving?</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Your roster changes have not been saved. Leaving this page discards them.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setLeavingTo(null)}
                className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  const href = leavingTo;
                  setLeavingTo(null);
                  router.push(href);
                }}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {chipsOpen && (
        <SheetShell>
          <header className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <h2 className="text-sm font-semibold">Chips</h2>
              <p className="text-xs text-zinc-500">
                Round {round} · {balance.toFixed(1)} spare cap
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChipsOpen(false)}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-500"
            >
              Done
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3">
            <ChipsPanel
              leagueId={leagueId}
              round={round}
              chips={chips}
              driverOptions={chipDriverOptions}
              constructorOptions={chipConstructorOptions}
              locked={locked}
            />
          </div>
        </SheetShell>
      )}

      {detailSlot?.occupantId && (
        <DetailSheet
          key={detailSlot.occupantId}
          leagueId={leagueId}
          slot={detailSlot}
          option={byId.get(detailSlot.occupantId)!}
          captain={
            detailSlot.occupantId === draft.topCaptainId ||
            detailSlot.occupantId === draft.midCaptainId
          }
          captainable={CAPTAINABLE_KINDS.includes(detailSlot.kind)}
          locked={locked}
          onClose={() => setDetailSlot(null)}
          onRemoveCaptain={() => {
            setDraft((current) =>
              detailSlot.kind === "top"
                ? { ...current, topCaptainId: null }
                : { ...current, midCaptainId: null },
            );
          }}
          onMakeCaptain={() => {
            nominate(detailSlot);
          }}
          onRemove={() => {
            setSlot(detailSlot, null);
            setDetailSlot(null);
          }}
          onReplace={() => {
            setDetailSlot(null);
            setOpenSlot(detailSlot);
          }}
        />
      )}

      {askingCaptains && (
        <CaptainPrompt
          topOptions={draft.top.filter(Boolean).map((id) => byId.get(id as string)!)}
          midOptions={draft.mid.filter(Boolean).map((id) => byId.get(id as string)!)}
          topCaptainId={draft.topCaptainId}
          midCaptainId={draft.midCaptainId}
          onPick={(bracket, id) =>
            setDraft((current) =>
              bracket === "top"
                ? { ...current, topCaptainId: id }
                : { ...current, midCaptainId: id },
            )
          }
          onCancel={() => setAskingCaptains(false)}
          onConfirm={() => {
            // Both captains are already in the draft — the confirm button only
            // enables once they are — so the hidden fields carry them and the
            // form can go straight out.
            setAskingCaptains(false);
            formRef.current?.requestSubmit();
          }}
        />
      )}

      {openSlot && (
        <ChooserSheet
          slot={openSlot}
          options={optionsFor(openSlot)}
          remaining={validation.remaining}
          currentPrice={openSlot.occupantId ? (byId.get(openSlot.occupantId)?.price ?? 0) : 0}
          onPick={(id) => {
            setSlot(openSlot, id);
            setOpenSlot(null);
          }}
          onClose={() => setOpenSlot(null)}
        />
      )}
    </div>
  );
}

/**
 * The image on a card: a portrait for a driver, a paired line-up for a team,
 * initials on the team colour when no media has been ingested yet.
 */
function Avatar({ option, size }: { option: PickOption; size: number }) {
  const accent = option.colour ? `#${option.colour}` : "#a1a1aa";
  // Rendered size comes from --avatar, set by whoever places the badge, so a
  // card that grows on a wider screen grows its portrait with it. size stays
  // the intrinsic pixel size handed to the image, which only has to be large
  // enough for the biggest --avatar ever used.
  const box = { height: "var(--avatar)", width: "var(--avatar)" };

  if (option.headshotUrl) {
    return (
      <Image
        src={option.headshotUrl}
        alt=""
        width={size * 2}
        height={size * 2}
        style={box}
        className="shrink-0 rounded-full object-cover"
        unoptimized
      />
    );
  }

  if (option.lineup?.length) {
    // Overlapped so two seats still read as one badge at card size. The outline
    // separates them in the team's own colour.
    return (
      <span className="flex shrink-0 items-center" style={{ height: "var(--avatar)" }}>
        {option.lineup.slice(0, 2).map((driver, index) => {
          const seat = {
            height: "var(--avatar)",
            width: "calc(var(--avatar) * 0.78)",
            marginLeft: index === 0 ? 0 : "calc(var(--avatar) * -0.3)",
            outline: `2px solid ${accent}`,
          };
          return driver.headshotUrl ? (
            <Image
              key={driver.name}
              src={driver.headshotUrl}
              alt=""
              width={size * 2}
              height={size * 2}
              style={seat}
              className="rounded-full object-cover"
              unoptimized
            />
          ) : (
            <span
              key={driver.name}
              style={{ ...seat, backgroundColor: accent, fontSize: "calc(var(--avatar) * 0.28)" }}
              className="flex items-center justify-center rounded-full font-semibold text-white"
            >
              {driver.name.slice(0, 2).toUpperCase()}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ ...box, backgroundColor: accent }}
    >
      {option.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * The frame both overlays sit in.
 *
 * Full-screen on a phone, where that is the whole point; a centred panel from
 * the small breakpoint up, because a picker stretched across a desktop monitor
 * puts a driver's name and their price at opposite ends of the screen.
 */
function SheetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40 sm:p-6">
      <div className="flex h-full w-full max-w-md flex-col overflow-hidden bg-white dark:bg-zinc-950 sm:rounded-2xl sm:shadow-2xl">
        {children}
      </div>
    </div>
  );
}

/**
 * A count on the corner of a button.
 *
 * Carries a label for screen readers, since a bare number beside "Bets" does
 * not say what it counts.
 */
function Badge({ count, label }: { count: number; label: string }) {
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--accent-ink)]">
      {count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function SlotCard({
  slot,
  option,
  locked,
  captain,
  onOpen,
}: {
  slot: Slot;
  option?: PickOption;
  locked: boolean;
  captain: boolean;
  onOpen: () => void;
}) {
  const accent = option?.colour ? `#${option.colour}` : "#a1a1aa";

  if (!option) {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={onOpen}
        className="flex aspect-[3/4] min-h-[5.75rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 px-1 text-zinc-400 transition active:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-center text-[9px] font-medium uppercase leading-tight tracking-wide">
          {slot.label}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`@container relative flex aspect-[3/4] min-h-[5.75rem] flex-col overflow-hidden rounded-xl border ${
        captain ? "border-amber-400 ring-1 ring-amber-400" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <span className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />

      <button
        type="button"
        disabled={locked}
        onClick={onOpen}
        className="flex min-h-0 flex-1 flex-col items-center justify-start p-1 text-center [--avatar:min(68cqw,7rem)]"
      >
        <Avatar option={option} size={80} />
        <span className="mt-1 w-full shrink-0 truncate text-[11px] font-medium leading-tight">
          {option.shortName}
        </span>
        <span className="mt-auto shrink-0 text-[11px] tabular-nums text-zinc-500">
          {option.price.toFixed(1)}
        </span>
      </button>

      {/* Only the captain is marked. Showing the badge on every eligible card
          made it look as though the whole roster scored double. */}
      {captain && (
        <span
          aria-label={`${option.name} is captain, scoring double`}
          className="absolute left-1 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-zinc-900"
        >
          2x
        </span>
      )}
    </div>
  );
}

/**
 * Asks who wears the armband, on the way to saving.
 *
 * The captaincies are not pre-filled: a default would be an invisible decision
 * made for the player on a slot that doubles their score. Asking once, at the
 * moment they commit the roster, is the only point where they are certain to
 * see it.
 */
function CaptainPrompt({
  topOptions,
  midOptions,
  topCaptainId,
  midCaptainId,
  onPick,
  onCancel,
  onConfirm,
}: {
  topOptions: PickOption[];
  midOptions: PickOption[];
  topCaptainId: string | null;
  midCaptainId: string | null;
  onPick: (bracket: "top" | "mid", id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rows: { bracket: "top" | "mid"; title: string; options: PickOption[]; chosen: string | null }[] = [
    { bracket: "top", title: "Top captain", options: topOptions, chosen: topCaptainId },
    { bracket: "mid", title: "Midfield captain", options: midOptions, chosen: midCaptainId },
  ];

  return (
    <SheetShell>
      <header className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold">Who scores double?</h2>
          <p className="text-xs text-zinc-500">One captain per bracket</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500">
          Cancel
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        {rows.map((row) => (
          <section key={row.bracket} className="mb-4">
            <h3 className="mb-1.5 text-xs font-semibold text-zinc-500">{row.title}</h3>
            <div className="grid grid-cols-3 gap-2">
              {row.options.map((option) => {
                const chosen = option.id === row.chosen;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onPick(row.bracket, option.id)}
                    aria-pressed={chosen}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 text-center ${
                      chosen
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40"
                        : "border-zinc-200 dark:border-zinc-800"
                    }`}
                  >
                    <span className="contents [--avatar:2.5rem]">
                      <Avatar option={option} size={80} />
                    </span>
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                      {option.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
        <button
          type="button"
          disabled={!topCaptainId || !midCaptainId}
          onClick={onConfirm}
          className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-40"
        >
          {topCaptainId && midCaptainId ? "Save roster" : "Pick both captains"}
        </button>
      </div>
    </SheetShell>
  );
}

/**
 * One pick's season, and what can be done with the slot holding them.
 *
 * The season is fetched when the sheet opens rather than shipped with the page:
 * it is every round for every driver in the field, which most visits never look
 * at. Results are kept per driver for the life of the sheet, so re-opening the
 * same card is instant.
 */
function DetailSheet({
  leagueId,
  slot,
  option,
  captain,
  captainable,
  locked,
  onClose,
  onRemoveCaptain,
  onMakeCaptain,
  onRemove,
  onReplace,
}: {
  leagueId: string;
  slot: Slot;
  option: PickOption;
  captain: boolean;
  captainable: boolean;
  locked: boolean;
  onClose: () => void;
  onRemoveCaptain: () => void;
  onMakeCaptain: () => void;
  onRemove: () => void;
  onReplace: () => void;
}) {
  const [season, setSeason] = useState<DriverSeasonState | null>(null);
  const isDriver = DRIVER_KINDS.includes(slot.kind);

  // The sheet is keyed on the pick, so opening a different card mounts a fresh
  // one and this starts from null without having to reset it here.
  useEffect(() => {
    let live = true;
    // Constructors have no per-driver breakdown to show.
    if (!isDriver) return;
    driverSeason(leagueId, option.id).then((result) => {
      if (live) setSeason(result);
    });
    return () => {
      live = false;
    };
  }, [leagueId, option.id, isDriver]);

  const rounds = season && !("error" in season) ? season.rounds : [];

  return (
    <SheetShell>
      <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-3">
          <span className="contents [--avatar:2.75rem]">
            <Avatar option={option} size={88} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{option.name}</h2>
            <p className="truncate text-xs text-zinc-500">
              {option.subtitle}
              {option.subtitle ? " · " : ""}
              {slot.label}
              {captain ? " · captain" : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-zinc-500"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
            <span className="block text-xs text-zinc-500">Price</span>
            <span className="tabular-nums text-lg font-semibold">{option.price.toFixed(1)}</span>
          </div>
          <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
            <span className="block text-xs text-zinc-500">Season points</span>
            <span className="tabular-nums text-lg font-semibold">
              {season === null
                ? "…"
                : "error" in season
                  ? "—"
                  : season.seasonPoints.toFixed(0)}
            </span>
          </div>
        </div>

        {!isDriver && (
          <p className="text-sm text-zinc-500">
            A team scores its two drivers combined — open either of them for a round-by-round
            breakdown.
          </p>
        )}

        {isDriver && season === null && (
          <p className="text-sm text-zinc-500">Loading this season…</p>
        )}

        {isDriver && season !== null && "error" in season && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {season.error}
          </p>
        )}

        {rounds.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
            <div className="grid grid-cols-[1fr_2.75rem_2.75rem_2.75rem] gap-1 border-b border-zinc-200 px-3 py-2 text-[10px] font-medium text-zinc-500 dark:border-zinc-800">
              {/* "Race" twice — once for the name, once for the points — read
                  as a repeated column. The points columns say what they are. */}
              <span>Round</span>
              <span className="text-right">Quali</span>
              <span className="text-right">Race</span>
              <span className="text-right">Total</span>
            </div>
            {rounds.map((line) => (
              <div
                key={line.round}
                className="grid grid-cols-[1fr_2.75rem_2.75rem_2.75rem] gap-1 border-b border-zinc-100 px-3 py-1.5 text-sm last:border-0 dark:border-zinc-900"
              >
                <span className="min-w-0">
                  <span className="block truncate">{line.raceName}</span>
                  <span className="block text-[10px] text-zinc-500">
                    {/* Not "Q1". In Formula 1 that names the first knockout
                        session — and this app uses it that way itself, in the
                        "Out in Q1" and "Reaches Q3" markets. Written as a grid
                        slot, "Q1 · P1" said a driver was knocked out early and
                        then won the race. */}
                    {line.qualifyingPosition === null
                      ? "—"
                      : `Grid ${line.qualifyingPosition}`}{" "}
                    ·{" "}
                    {line.finishPosition === null ? "DNF" : `P${line.finishPosition}`}
                  </span>
                </span>
                <span className="text-right tabular-nums text-zinc-500">
                  {line.qualifyingPoints.toFixed(0)}
                </span>
                <span className="text-right tabular-nums text-zinc-500">
                  {line.racePoints.toFixed(0)}
                </span>
                <span className="text-right tabular-nums font-medium">
                  {line.total.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!locked && (
        <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {captainable &&
            (captain ? (
              <button
                type="button"
                onClick={onRemoveCaptain}
                className="flex-1 rounded-lg border border-amber-400 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-400"
              >
                Remove 2x
              </button>
            ) : (
              <button
                type="button"
                onClick={onMakeCaptain}
                className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium dark:border-zinc-700"
              >
                Make 2x
              </button>
            ))}
          <button
            type="button"
            onClick={onReplace}
            className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-medium dark:border-zinc-700"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white"
          >
            Remove
          </button>
        </div>
      )}
    </SheetShell>
  );
}

/**
 * Full-screen chooser.
 *
 * Only shows what may legally fill the slot, so a bracket rule is never a
 * surprise after picking. Options that cannot be afforded are still listed but
 * disabled, since knowing what is out of reach is part of the decision.
 */
function ChooserSheet({
  slot,
  options,
  remaining,
  currentPrice,
  onPick,
  onClose,
}: {
  slot: Slot;
  options: PickOption[];
  remaining: number;
  currentPrice: number;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  // Swapping refunds the outgoing pick, so affordability is judged against
  // what is left plus whatever this slot currently holds.
  const budget = remaining + currentPrice;

  const [sortField, setSortField] = useState<SortField>("price");
  const [descending, setDescending] = useState(DEFAULT_DESCENDING.price);

  const sorted = useMemo(() => {
    const direction = descending ? -1 : 1;
    // Sorted on the short name, which for a driver is the surname. Sorting the
    // full name ordered the grid by first name, so Lando Norris came before
    // Lewis Hamilton — and somebody scanning for Hamilton looks under H. Teams
    // are unaffected: their short name is their name.
    const byName = (a: PickOption, b: PickOption) =>
      a.shortName.localeCompare(b.shortName);

    return [...options].sort((a, b) => {
      if (sortField === "name") return direction * byName(a, b);
      const delta = sortField === "price" ? a.price - b.price : a.form - b.form;
      // Ties fall back to name so the order never depends on input order.
      return delta === 0 ? byName(a, b) : direction * delta;
    });
  }, [options, sortField, descending]);

  /** Tapping the active field flips direction; tapping another switches to it. */
  function chooseSort(field: SortField) {
    if (field === sortField) setDescending((current) => !current);
    else {
      setSortField(field);
      setDescending(DEFAULT_DESCENDING[field]);
    }
  }

  return (
    <SheetShell>
      <header className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Choose a {slot.label.toLowerCase()}</h2>
            <p className="text-xs text-zinc-500">{budget.toFixed(1)} available for this slot</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-500"
          >
            Cancel
          </button>
        </div>

      </header>

      <div
        className={`grid ${TABLE_COLUMNS} items-end gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800`}
      >
        {(Object.keys(SORT_LABELS) as SortField[]).map((field) => {
          const active = field === sortField;
          const sublabel = SORT_SUBLABELS[field];
          return (
            <button
              key={field}
              type="button"
              onClick={() => chooseSort(field)}
              aria-label={
                active
                  ? `Sorted by ${SORT_LABELS[field].toLowerCase()}, ${descending ? "highest" : "lowest"} first. Tap to reverse.`
                  : `Sort by ${SORT_LABELS[field].toLowerCase()}`
              }
              className={`text-[11px] font-medium leading-tight ${
                field === "name" ? "text-left" : "text-right"
              } ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
            >
              <span>
                {SORT_LABELS[field]}
                {active && <span aria-hidden> {descending ? "↓" : "↑"}</span>}
              </span>
              {sublabel && (
                <span className="block text-[9px] font-normal text-zinc-500">{sublabel}</span>
              )}
            </button>
          );
        })}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {sorted.map((option) => {
          const affordable = option.price <= budget;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onPick(option.id)}
                className={`grid w-full ${TABLE_COLUMNS} items-center gap-2 px-3 py-2 text-left disabled:opacity-40`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="contents [--avatar:2.125rem]">
                    <Avatar option={option} size={68} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{option.name}</span>
                    {option.subtitle && (
                      <span className="block truncate text-xs text-zinc-500">
                        {option.subtitle}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-right tabular-nums text-sm">{option.price.toFixed(1)}</span>
                <span className="text-right tabular-nums text-sm text-zinc-500">
                  {option.form.toFixed(0)}
                </span>
              </button>
            </li>
          );
        })}
        {options.length === 0 && (
          <li className="p-4 text-center text-sm text-zinc-500">
            Nothing available for this slot.
          </li>
        )}
      </ul>
    </SheetShell>
  );
}
