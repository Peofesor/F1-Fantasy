"use client";

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

function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs dark:bg-zinc-800">
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ×
        </button>
      )}
    </span>
  );
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
  const [state, formAction, saving] = useActionState<SaveState, FormData>(saveRoster, null);

  const { tiers, driverPrices, constructorPrices } = useMemo(() => {
    const tiers = new Map<string, Tier>(drivers.map((d) => [d.id, d.tier]));
    const driverPrices = new Map(drivers.map((d) => [d.id, d.price]));
    const constructorPrices = new Map(constructors.map((c) => [c.id, c.price]));
    return { tiers, driverPrices, constructorPrices };
  }, [drivers, constructors]);

  // The same validator the Server Action runs, so what you see while picking
  // matches what the server will accept.
  const validation = useMemo(
    () => validateRoster(selection, { tiers, driverPrices, constructorPrices, costCap }),
    [selection, tiers, driverPrices, constructorPrices, costCap],
  );

  const chosenDrivers = new Set([
    ...selection.top,
    ...selection.mid,
    ...(selection.backmarker ? [selection.backmarker] : []),
  ]);
  const chosenConstructors = new Set([
    ...selection.constructors,
    ...(selection.reverseConstructor ? [selection.reverseConstructor] : []),
  ]);

  function toggleDriver(option: PickOption) {
    if (locked) return;
    setSelection((current) => {
      if (current.top.includes(option.id))
        return { ...current, top: current.top.filter((id) => id !== option.id) };
      if (current.mid.includes(option.id))
        return { ...current, mid: current.mid.filter((id) => id !== option.id) };
      if (current.backmarker === option.id) return { ...current, backmarker: null };

      if (option.tier === "top" && current.top.length < TOP_SLOTS)
        return { ...current, top: [...current.top, option.id] };
      if (option.tier === "mid" && current.mid.length < MID_SLOTS)
        return { ...current, mid: [...current.mid, option.id] };
      if (current.backmarker === null) return { ...current, backmarker: option.id };
      return current;
    });
  }

  function toggleConstructor(option: PickOption) {
    if (locked) return;
    setSelection((current) => {
      if (current.constructors.includes(option.id))
        return { ...current, constructors: current.constructors.filter((id) => id !== option.id) };
      if (current.reverseConstructor === option.id)
        return { ...current, reverseConstructor: null };
      if (current.constructors.length < CONSTRUCTOR_SLOTS)
        return { ...current, constructors: [...current.constructors, option.id] };
      if (current.reverseConstructor === null)
        return { ...current, reverseConstructor: option.id };
      return current;
    });
  }

  function slotLabel(id: string): string | null {
    if (selection.top.includes(id)) return "TOP";
    if (selection.mid.includes(id)) return "MID";
    if (selection.backmarker === id) return "BACK";
    if (selection.constructors.includes(id)) return "TEAM";
    if (selection.reverseConstructor === id) return "REV";
    return null;
  }

  // Transfers already used this round consume the free allowance, so a second
  // edit does not silently get a fresh one.
  const freeRemaining = Math.max(0, freeTransfers - transfersUsed);

  const overBudget = validation.remaining < 0;

  return (
    <div className="space-y-4">
      <section className="sticky top-0 z-10 rounded-xl border border-zinc-200 bg-white/95 p-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
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

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-zinc-500">
          <span>
            Top {selection.top.length}/{TOP_SLOTS}
          </span>
          <span>·</span>
          <span>
            Mid {selection.mid.length}/{MID_SLOTS}
          </span>
          <span>·</span>
          <span>Backmarker {selection.backmarker ? 1 : 0}/1</span>
          <span>·</span>
          <span>
            Teams {selection.constructors.length}/{CONSTRUCTOR_SLOTS}
          </span>
          <span>·</span>
          <span>Reverse {selection.reverseConstructor ? 1 : 0}/1</span>
        </div>

        {(selection.top.length > 0 || selection.mid.length > 0 || selection.backmarker) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...selection.top, ...selection.mid, ...(selection.backmarker ? [selection.backmarker] : [])].map(
              (id) => (
                <Chip
                  key={id}
                  label={drivers.find((d) => d.id === id)?.name ?? id}
                  onRemove={locked ? undefined : () => toggleDriver(drivers.find((d) => d.id === id)!)}
                />
              ),
            )}
          </div>
        )}

        {!validation.valid && validation.complete && (
          <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-400">
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
          <input
            type="hidden"
            name="reverseConstructor"
            value={selection.reverseConstructor ?? ""}
          />
          <button
            disabled={!validation.valid || saving || locked}
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {locked ? "Round locked" : saving ? "Saving…" : "Save roster"}
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

      <PickList
        title="Drivers"
        note={`Top bracket fills ${TOP_SLOTS} slots, mid ${MID_SLOTS}, plus 1 backmarker (any driver).`}
        options={drivers}
        chosen={chosenDrivers}
        slotLabel={slotLabel}
        onToggle={toggleDriver}
        showTier
        disabled={locked}
      />

      <PickList
        title="Constructors"
        note={`${CONSTRUCTOR_SLOTS} scored normally, plus 1 reverse-scored.`}
        options={constructors}
        chosen={chosenConstructors}
        slotLabel={slotLabel}
        onToggle={toggleConstructor}
        disabled={locked}
      />
    </div>
  );
}

function PickList({
  title,
  note,
  options,
  chosen,
  slotLabel,
  onToggle,
  showTier = false,
  disabled = false,
}: {
  title: string;
  note: string;
  options: PickOption[];
  chosen: Set<string>;
  slotLabel: (id: string) => string | null;
  onToggle: (option: PickOption) => void;
  showTier?: boolean;
  disabled?: boolean;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-zinc-500">{note}</p>
      <ul className="mt-3 space-y-1">
        {options.map((option) => {
          const picked = chosen.has(option.id);
          const label = slotLabel(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onToggle(option)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
                  picked
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                    : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.name}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {showTier ? `${option.tier === "top" ? "Top bracket" : "Mid bracket"}` : ""}
                    {option.subtitle ? `${showTier ? " · " : ""}${option.subtitle}` : ""}
                  </span>
                </span>
                {label && (
                  <span className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
                    {label}
                  </span>
                )}
                <span className="w-12 shrink-0 text-right tabular-nums">
                  {option.price.toFixed(1)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
