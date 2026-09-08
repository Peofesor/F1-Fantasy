"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";

import {
  MID_SLOTS,
  TOP_SLOTS,
  validateRoster,
  type RosterSelection,
} from "@/lib/f1/roster";
import type { Tier } from "@/lib/f1/tiers";
import type { ChipRow } from "@/lib/f1/chips";
import { saveRoster, type SaveState } from "./actions";
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
  /** Six-digit hex without the hash. */
  colour?: string;
  /** Points over the rolling window — the signal behind price and tier. */
  form: number;
}

type SortField = "price" | "form" | "name";

const SORT_LABELS: Record<SortField, string> = {
  price: "Price",
  form: "Form",
  name: "Name",
};

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
 * Slots that can carry the weekly 2x nomination.
 *
 * The backmarker pays cost cap rather than points, so doubling it would double
 * nothing; the reverse-scored team is excluded for the same reason its scoring
 * is inverted in the first place.
 */
const BOOSTABLE_KINDS: SlotKind[] = ["top", "mid", "constructorTop", "constructorMid"];

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
  /** The weekly 2x nominations, picked here rather than played as chips. */
  turboDriverId: string | null;
  boostConstructorId: string | null;
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
    turboDriverId: selection.turboDriverId,
    boostConstructorId: selection.boostConstructorId,
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
    turboDriverId: draft.turboDriverId,
    boostConstructorId: draft.boostConstructorId,
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
const ROWS: { title: string; hint: string; kinds: SlotKind[] }[] = [
  { title: "Top", hint: "3 drivers + 1 team", kinds: ["top", "top", "top", "constructorTop"] },
  { title: "Midfield", hint: "3 drivers + 1 team", kinds: ["mid", "mid", "mid", "constructorMid"] },
  { title: "Back of the grid", hint: "scores in reverse", kinds: ["backmarker", "reverse"] },
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
}: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialSelection));
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [chipsOpen, setChipsOpen] = useState(false);
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

  const slots = slotsOf(draft);
  const bySlot = new Map(slots.map((slot) => [slot.kind + "-" + slot.index, slot]));
  const empty = slots.filter((slot) => !slot.occupantId).length;
  const freeRemaining = Math.max(0, freeTransfers - transfersUsed);
  const playedThisRound = chips.filter((chip) => chip.playedThisRound).length;
  const overBudget = validation.remaining < 0;

  function setSlot(slot: Slot, id: string | null) {
    setDraft((current) => {
      const replaceAt = (list: (string | null)[], index: number) =>
        list.map((existing, position) => (position === index ? id : existing));

      // A nomination follows its holder: swapping a nominated pick moves the 2x
      // onto whoever takes the slot, so the boost is never silently dropped.
      // Clearing the slot, or swapping into one that cannot be boosted, drops
      // it and the roster reads as incomplete until it is set again.
      const held = slot.occupantId;
      const isDriverSlot = DRIVER_KINDS.includes(slot.kind);
      const canBoost = BOOSTABLE_KINDS.includes(slot.kind);
      const nominations = {
        turboDriverId:
          isDriverSlot && current.turboDriverId === held
            ? (canBoost ? id : null)
            : current.turboDriverId,
        boostConstructorId:
          !isDriverSlot && current.boostConstructorId === held
            ? (canBoost ? id : null)
            : current.boostConstructorId,
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

  /** Moves the 2x nomination onto a slot's occupant. */
  function nominate(slot: Slot) {
    const id = slot.occupantId;
    if (!id || !BOOSTABLE_KINDS.includes(slot.kind)) return;
    setDraft((current) =>
      DRIVER_KINDS.includes(slot.kind)
        ? { ...current, turboDriverId: id }
        : { ...current, boostConstructorId: id },
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
            className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, (validation.cost / costCap) * 100)}%` }}
          />
        </div>

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={() => setChipsOpen(true)}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium dark:border-zinc-700"
          >
            Chips
            {playedThisRound > 0 && (
              <span className="ml-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {playedThisRound}
              </span>
            )}
          </button>

          <form action={formAction} className="flex-1">
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
          <input type="hidden" name="turboDriverId" value={selection.turboDriverId ?? ""} />
          <input
            type="hidden"
            name="boostConstructorId"
            value={selection.boostConstructorId ?? ""}
          />
          <button
            disabled={!validation.valid || saving || locked}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
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

        {state && "error" in state && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.error}
          </p>
        )}
        {state && "ok" in state && (
          <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            Roster saved.
          </p>
        )}
      </section>

      {ROWS.map((row) => {
        // A kind can appear several times in a row, so each occurrence takes the
        // next index of that kind.
        const counts = new Map<SlotKind, number>();

        return (
          <section key={row.title}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{row.title}</h2>
              <span className="text-xs text-zinc-500">{row.hint}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {row.kinds.map((kind) => {
                const index = counts.get(kind) ?? 0;
                counts.set(kind, index + 1);
                const slot = bySlot.get(kind + "-" + index)!;
                return (
                  <SlotCard
                    key={kind + "-" + index}
                    slot={slot}
                    option={slot.occupantId ? byId.get(slot.occupantId) : undefined}
                    locked={locked}
                    boostable={BOOSTABLE_KINDS.includes(slot.kind)}
                    boosted={
                      slot.occupantId !== null &&
                      (slot.occupantId === draft.turboDriverId ||
                        slot.occupantId === draft.boostConstructorId)
                    }
                    onOpen={() => setOpenSlot(slot)}
                    onClear={() => setSlot(slot, null)}
                    onBoost={() => nominate(slot)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {validation.complete && !validation.valid && (
        <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}

      {chipsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
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
              balance={balance}
              driverOptions={chipDriverOptions}
              constructorOptions={chipConstructorOptions}
              locked={locked}
            />
          </div>
        </div>
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
  const box = { height: size, width: size };

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
      <span className="flex shrink-0 items-center" style={{ height: size }}>
        {option.lineup.slice(0, 2).map((driver, index) => {
          const seat = {
            height: size,
            width: size * 0.78,
            marginLeft: index === 0 ? 0 : -size * 0.3,
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
              style={{ ...seat, backgroundColor: accent, fontSize: size * 0.28 }}
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

function SlotCard({
  slot,
  option,
  locked,
  boostable,
  boosted,
  onOpen,
  onClear,
  onBoost,
}: {
  slot: Slot;
  option?: PickOption;
  locked: boolean;
  boostable: boolean;
  boosted: boolean;
  onOpen: () => void;
  onClear: () => void;
  onBoost: () => void;
}) {
  const accent = option?.colour ? `#${option.colour}` : "#a1a1aa";

  if (!option) {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={onOpen}
        className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 px-1 text-zinc-400 transition active:border-zinc-500 disabled:opacity-50 dark:border-zinc-700"
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
      className={`relative flex aspect-[3/4] flex-col overflow-hidden rounded-xl border ${
        boosted ? "border-amber-400 ring-1 ring-amber-400" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <span className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />

      <button
        type="button"
        disabled={locked}
        onClick={onOpen}
        className="flex min-h-0 flex-1 flex-col items-center justify-start p-1 text-center"
      >
        <Avatar option={option} size={44} />
        <span className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight">
          {option.name}
        </span>
        <span className="mt-auto text-[11px] tabular-nums text-zinc-500">
          {option.price.toFixed(1)}
        </span>
      </button>

      {!locked && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Remove ${option.name}`}
          className="absolute right-1 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/70 text-xs text-white"
        >
          ×
        </button>
      )}

      {boostable && (
        <button
          type="button"
          disabled={locked || boosted}
          onClick={onBoost}
          aria-pressed={boosted}
          aria-label={boosted ? `${option.name} scores double` : `Double ${option.name}`}
          className={`absolute left-1 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            boosted ? "bg-amber-400 text-zinc-900" : "bg-zinc-900/70 text-white disabled:opacity-40"
          }`}
        >
          2x
        </button>
      )}
    </div>
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
    return [...options].sort((a, b) => {
      if (sortField === "name") return direction * a.name.localeCompare(b.name);
      const delta = sortField === "price" ? a.price - b.price : a.form - b.form;
      // Ties fall back to name so the order never depends on input order.
      return delta === 0 ? a.name.localeCompare(b.name) : direction * delta;
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
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

        <div className="mt-3 flex gap-1.5">
          {(Object.keys(SORT_LABELS) as SortField[]).map((field) => {
            const active = field === sortField;
            return (
              <button
                key={field}
                type="button"
                onClick={() => chooseSort(field)}
                aria-pressed={active}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs transition ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
                }`}
              >
                {SORT_LABELS[field]}
                {active && <span aria-hidden>{descending ? "↓" : "↑"}</span>}
              </button>
            );
          })}
        </div>
      </header>

      <ul className="flex-1 overflow-y-auto p-2">
        {sorted.map((option) => {
          const affordable = option.price <= budget;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onPick(option.id)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left disabled:opacity-40"
              >
                <Avatar option={option} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.name}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {option.subtitle}
                    {option.subtitle ? " · " : ""}
                    {option.form.toFixed(0)} pts last 5
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-sm">{option.price.toFixed(1)}</span>
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
    </div>
  );
}
