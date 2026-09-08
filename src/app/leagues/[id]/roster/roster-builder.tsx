"use client";

import Image from "next/image";
import { useActionState, useMemo, useState } from "react";

import {
  CONSTRUCTOR_SLOTS,
  MID_SLOTS,
  TOP_SLOTS,
  validateRoster,
  type RosterSelection,
} from "@/lib/f1/roster";
import type { Tier } from "@/lib/f1/tiers";
import { saveRoster, type SaveState } from "./actions";

export interface PickOption {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  tier: Tier;
  headshotUrl?: string;
  /** Six-digit hex without the hash. */
  colour?: string;
}

interface Props {
  leagueId: string;
  costCap: number;
  transfersUsed: number;
  freeTransfers: number;
  drivers: PickOption[];
  constructors: PickOption[];
  initialSelection: RosterSelection;
  locked: boolean;
}

/**
 * Which roster position a card represents.
 *
 * Slots are addressed individually rather than as "the next free one" so that
 * tapping a specific empty card opens a chooser filtered to what may legally go
 * there — the bracket rules become visible in the UI instead of being enforced
 * only after the fact.
 */
type SlotKind = "top" | "mid" | "backmarker" | "constructor" | "reverse";

interface Slot {
  kind: SlotKind;
  index: number;
  label: string;
  occupantId: string | null;
}

const SLOT_LABELS: Record<SlotKind, string> = {
  top: "Top",
  mid: "Mid",
  backmarker: "Backmarker",
  constructor: "Team",
  reverse: "Reverse team",
};

function buildSlots(selection: RosterSelection): Slot[] {
  const slot = (kind: SlotKind, index: number, occupantId: string | null): Slot => ({
    kind,
    index,
    label: SLOT_LABELS[kind],
    occupantId,
  });

  return [
    ...Array.from({ length: TOP_SLOTS }, (_, i) => slot("top", i, selection.top[i] ?? null)),
    ...Array.from({ length: MID_SLOTS }, (_, i) => slot("mid", i, selection.mid[i] ?? null)),
    slot("backmarker", 0, selection.backmarker),
    ...Array.from({ length: CONSTRUCTOR_SLOTS }, (_, i) =>
      slot("constructor", i, selection.constructors[i] ?? null),
    ),
    slot("reverse", 0, selection.reverseConstructor),
  ];
}

export function RosterBuilder({
  leagueId,
  costCap,
  transfersUsed,
  freeTransfers,
  drivers,
  constructors,
  initialSelection,
  locked,
}: Props) {
  const [selection, setSelection] = useState<RosterSelection>(initialSelection);
  const [openSlot, setOpenSlot] = useState<Slot | null>(null);
  const [state, formAction, saving] = useActionState<SaveState, FormData>(saveRoster, null);

  const { tiers, driverPrices, constructorPrices, byId } = useMemo(() => {
    const tiers = new Map<string, Tier>(drivers.map((d) => [d.id, d.tier]));
    const driverPrices = new Map(drivers.map((d) => [d.id, d.price]));
    const constructorPrices = new Map(constructors.map((c) => [c.id, c.price]));
    const byId = new Map([...drivers, ...constructors].map((o) => [o.id, o]));
    return { tiers, driverPrices, constructorPrices, byId };
  }, [drivers, constructors]);

  // The same validator the Server Action runs, so what you see while picking
  // matches what the server will accept.
  const validation = useMemo(
    () => validateRoster(selection, { tiers, driverPrices, constructorPrices, costCap }),
    [selection, tiers, driverPrices, constructorPrices, costCap],
  );

  const slots = buildSlots(selection);
  const freeRemaining = Math.max(0, freeTransfers - transfersUsed);
  const overBudget = validation.remaining < 0;

  function setSlot(slot: Slot, id: string | null) {
    setSelection((current) => {
      const replaceAt = (list: readonly string[], index: number) => {
        const next = [...list];
        if (id === null) next.splice(index, 1);
        else next[index] = id;
        return next.filter(Boolean);
      };

      switch (slot.kind) {
        case "top":
          return { ...current, top: replaceAt(current.top, slot.index) };
        case "mid":
          return { ...current, mid: replaceAt(current.mid, slot.index) };
        case "backmarker":
          return { ...current, backmarker: id };
        case "constructor":
          return { ...current, constructors: replaceAt(current.constructors, slot.index) };
        case "reverse":
          return { ...current, reverseConstructor: id };
      }
    });
  }

  /** Options legally allowed in a slot, excluding anyone already on the roster. */
  function optionsFor(slot: Slot): PickOption[] {
    const takenDrivers = new Set([
      ...selection.top,
      ...selection.mid,
      ...(selection.backmarker ? [selection.backmarker] : []),
    ]);
    const takenConstructors = new Set([
      ...selection.constructors,
      ...(selection.reverseConstructor ? [selection.reverseConstructor] : []),
    ]);

    if (slot.kind === "constructor" || slot.kind === "reverse") {
      return constructors
        .filter((c) => !takenConstructors.has(c.id) || c.id === slot.occupantId)
        .sort((a, b) => b.price - a.price);
    }

    return drivers
      .filter((d) => {
        if (takenDrivers.has(d.id) && d.id !== slot.occupantId) return false;
        // The backmarker slot is deliberately unrestricted.
        if (slot.kind === "backmarker") return true;
        return d.tier === slot.kind;
      })
      .sort((a, b) => b.price - a.price);
  }

  return (
    <div className="space-y-4">
      <section className="sticky top-0 z-20 rounded-xl border border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-zinc-500">Spent</span>
          <span className="tabular-nums text-sm">
            <strong className={overBudget ? "text-red-600 dark:text-red-400" : ""}>
              {validation.cost.toFixed(1)}
            </strong>{" "}
            / {costCap.toFixed(1)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, (validation.cost / costCap) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          {freeRemaining > 0
            ? `${freeRemaining} free transfer${freeRemaining === 1 ? "" : "s"} left this round`
            : "Free transfers used — further changes cost cap"}
        </p>

        {validation.complete && !validation.valid && (
          <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
            {validation.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <form action={formAction} className="mt-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="top" value={selection.top.join(",")} />
          <input type="hidden" name="mid" value={selection.mid.join(",")} />
          <input type="hidden" name="backmarker" value={selection.backmarker ?? ""} />
          <input type="hidden" name="constructors" value={selection.constructors.join(",")} />
          <input type="hidden" name="reverseConstructor" value={selection.reverseConstructor ?? ""} />
          <button
            disabled={!validation.valid || saving || locked}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {locked
              ? "Round locked"
              : saving
                ? "Saving…"
                : validation.complete
                  ? "Save roster"
                  : `Pick ${slots.filter((s) => !s.occupantId).length} more`}
          </button>
        </form>

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

      <section>
        <h2 className="mb-2 text-sm font-semibold">Drivers</h2>
        <div className="grid grid-cols-3 gap-2">
          {slots
            .filter((slot) => slot.kind !== "constructor" && slot.kind !== "reverse")
            .map((slot) => (
              <SlotCard
                key={`${slot.kind}-${slot.index}`}
                slot={slot}
                option={slot.occupantId ? byId.get(slot.occupantId) : undefined}
                locked={locked}
                onOpen={() => setOpenSlot(slot)}
                onClear={() => setSlot(slot, null)}
              />
            ))}
        </div>

        <h2 className="mb-2 mt-4 text-sm font-semibold">Constructors</h2>
        <div className="grid grid-cols-3 gap-2">
          {slots
            .filter((slot) => slot.kind === "constructor" || slot.kind === "reverse")
            .map((slot) => (
              <SlotCard
                key={`${slot.kind}-${slot.index}`}
                slot={slot}
                option={slot.occupantId ? byId.get(slot.occupantId) : undefined}
                locked={locked}
                onOpen={() => setOpenSlot(slot)}
                onClear={() => setSlot(slot, null)}
              />
            ))}
        </div>
      </section>

      {openSlot && (
        <ChooserSheet
          slot={openSlot}
          options={optionsFor(openSlot)}
          remaining={validation.remaining}
          currentPrice={
            openSlot.occupantId ? (byId.get(openSlot.occupantId)?.price ?? 0) : 0
          }
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

function SlotCard({
  slot,
  option,
  locked,
  onOpen,
  onClear,
}: {
  slot: Slot;
  option?: PickOption;
  locked: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  const accent = option?.colour ? `#${option.colour}` : "#a1a1aa";

  if (!option) {
    return (
      <button
        type="button"
        disabled={locked}
        onClick={onOpen}
        className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:hover:border-zinc-500"
      >
        <span className="text-2xl leading-none">+</span>
        <span className="text-[10px] font-medium uppercase tracking-wide">{slot.label}</span>
      </button>
    );
  }

  return (
    <div className="relative flex aspect-[3/4] flex-col overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <span className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />

      <button
        type="button"
        disabled={locked}
        onClick={onOpen}
        className="flex min-h-0 flex-1 flex-col items-center justify-start p-1 text-center"
      >
        {option.headshotUrl ? (
          <Image
            src={option.headshotUrl}
            alt=""
            width={64}
            height={64}
            className="h-12 w-12 rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {option.name.slice(0, 2).toUpperCase()}
          </span>
        )}
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold">Choose a {slot.label.toLowerCase()}</h2>
          <p className="text-xs text-zinc-500">{budget.toFixed(1)} available for this slot</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          Cancel
        </button>
      </header>

      <ul className="flex-1 overflow-y-auto p-2">
        {options.map((option) => {
          const affordable = option.price <= budget;
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onPick(option.id)}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition enabled:hover:bg-zinc-100 disabled:opacity-40 dark:enabled:hover:bg-zinc-900"
              >
                {option.headshotUrl ? (
                  <Image
                    src={option.headshotUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: option.colour ? `#${option.colour}` : "#a1a1aa" }}
                  >
                    {option.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{option.subtitle}</span>
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
