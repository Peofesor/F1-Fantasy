"use client";

import Image from "next/image";
import { useState } from "react";

export interface Pick {
  slotType: string;
  name: string;
  headshotUrl?: string;
  colour?: string;
  captain: boolean;
  price: number | null;
}

export interface Squad {
  round: number;
  raceName: string;
  points: number | null;
  picks: Pick[];
}

const BRACKETS: { label: string; types: string[] }[] = [
  { label: "Top", types: ["driver_top", "constructor"] },
  { label: "Midfield", types: ["driver_mid"] },
  { label: "Back of the grid", types: ["driver_backmarker", "constructor_reverse"] },
];

function Face({ pick }: { pick: Pick }) {
  const accent = pick.colour ? `#${pick.colour}` : "#a1a1aa";

  return (
    <span className="flex w-16 flex-col items-center gap-1 text-center">
      <span className="relative">
        {pick.headshotUrl ? (
          <Image
            src={pick.headshotUrl}
            alt=""
            width={96}
            height={96}
            className="h-12 w-12 rounded-full object-cover"
            style={{ outline: `2px solid ${accent}` }}
            unoptimized
          />
        ) : (
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {pick.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {pick.captain && (
          <span
            aria-label="captain, scores double"
            className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[9px] font-bold leading-4 text-zinc-900"
          >
            2x
          </span>
        )}
      </span>
      <span className="w-full truncate text-[10px] leading-tight">{pick.name}</span>
      {pick.price !== null && (
        <span className="text-[10px] tabular-nums text-zinc-500">{pick.price.toFixed(1)}</span>
      )}
    </span>
  );
}

/**
 * One squad at a time, chosen from a list of races.
 *
 * Every round stacked down the page made a fourteen-race season an enormous
 * scroll to answer a question that is always about one race: what did they
 * field at Monza. A picker turns that into one choice and one team.
 *
 * All the rounds are sent with the page rather than fetched per choice. A
 * season is a couple of dozen small squads, so switching is instant and the
 * list works with no further round trips.
 */
export function RosterHistory({ squads, name }: { squads: Squad[]; name: string }) {
  const [round, setRound] = useState(squads[0]?.round ?? 0);
  const squad = squads.find((entry) => entry.round === round) ?? squads[0];

  if (!squad) {
    return (
      <section className="rounded-xl border border-dashed border-zinc-300 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] p-6 text-center dark:border-zinc-700">
        <p className="text-sm text-zinc-500">{name} has no team to show yet.</p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))] dark:border-zinc-800">
      <div className="flex items-center gap-3 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <select
          value={round}
          onChange={(event) => setRound(Number(event.target.value))}
          aria-label="Race"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {squads.map((entry) => (
            <option key={entry.round} value={entry.round}>
              R{entry.round} · {entry.raceName}
            </option>
          ))}
        </select>

        {squad.points !== null && (
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {squad.points.toFixed(0)} pts
          </span>
        )}
      </div>

      <div className="space-y-3 p-4">
        {BRACKETS.map((bracket) => {
          const inBracket = squad.picks.filter((pick) => bracket.types.includes(pick.slotType));
          if (inBracket.length === 0) return null;
          return (
            <div key={bracket.label}>
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                {bracket.label}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {inBracket.map((pick) => (
                  <Face key={`${pick.slotType}-${pick.name}`} pick={pick} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
