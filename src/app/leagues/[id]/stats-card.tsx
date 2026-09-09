"use client";

import { useState } from "react";

import { domainOf, type MemberSeries } from "@/lib/f1/league-stats";

/**
 * The league's season as two panels sharing an x-axis.
 *
 * Two panels rather than one chart with two y-axes. Points run to thousands and
 * a bank sits under a hundred; on shared axes every crossing would look like an
 * event when it is only an artefact of the scaling. Stacked, the same round
 * lines up vertically, so "she pulled ahead the week she spent her bank" is
 * visible without either measure distorting the other.
 *
 * Colour identifies the member and nothing else — it stays with them across
 * both panels and does not move when the order changes.
 */

/** Categorical slots 1–4, validated against both surfaces. */
const SERIES = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
];

const WIDTH = 320;
const HEIGHT = 104;
const PAD = { left: 4, right: 34, top: 8, bottom: 4 };

interface PanelProps {
  series: MemberSeries[];
  metric: "points" | "cap";
  label: string;
  hovered: number | null;
  onHover: (round: number | null) => void;
}

function Panel({ series, metric, label, hovered, onHover }: PanelProps) {
  const [low, high] = domainOf(series, metric);
  const rounds = series[0]?.points.map((point) => point.round) ?? [];
  if (rounds.length === 0) return null;

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  const x = (round: number) => {
    const index = rounds.indexOf(round);
    const span = Math.max(1, rounds.length - 1);
    return PAD.left + (index / span) * plotWidth;
  };
  const y = (value: number) =>
    PAD.top + plotHeight - ((value - low) / (high - low)) * plotHeight;

  // Two members finishing on similar numbers put their labels on top of each
  // other. Nudge them apart from the top down, keeping the reading order.
  const LABEL_GAP = 8;
  const labelY = new Map<string, number>();
  [...series]
    .map((member) => ({
      id: member.memberId,
      at: y(member.points[member.points.length - 1][metric]),
    }))
    .sort((a, b) => a.at - b.at)
    .forEach((entry, index, list) => {
      const previous = index === 0 ? -Infinity : labelY.get(list[index - 1].id)!;
      labelY.set(entry.id, Math.max(entry.at, previous + LABEL_GAP));
    });

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums">
          {metric === "cap" ? high.toFixed(1) : Math.round(high)} max
        </span>
      </figcaption>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`${label} by round for each member`}
        onMouseLeave={() => onHover(null)}
      >
        {hovered !== null && (
          <line
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            className="stroke-zinc-300 dark:stroke-zinc-700"
            strokeWidth={1}
          />
        )}

        {series.map((member, index) => {
          const path = member.points
            .map((point, i) => `${i === 0 ? "M" : "L"}${x(point.round)},${y(point[metric])}`)
            .join(" ");
          const last = member.points[member.points.length - 1];

          return (
            <g key={member.memberId}>
              <path
                d={path}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: `var(--series-${index + 1})` }}
              />
              {/* Direct labels, which is also what the contrast check requires
                  of these hues on a light surface. */}
              <text
                x={x(last.round) + 4}
                y={(labelY.get(member.memberId) ?? y(last[metric])) + 3}
                className="fill-zinc-500 text-[8px]"
                style={{ fontSize: 8 }}
              >
                {member.name.slice(0, 5)}
              </text>
              {hovered !== null && (
                <circle
                  cx={x(hovered)}
                  cy={y(member.points.find((p) => p.round === hovered)?.[metric] ?? 0)}
                  r={3}
                  style={{ fill: `var(--series-${index + 1})` }}
                  className="stroke-white dark:stroke-zinc-950"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

        {/* Invisible hit strips, wider than the marks they select. */}
        {rounds.map((round) => (
          <rect
            key={round}
            x={x(round) - plotWidth / rounds.length / 2}
            y={0}
            width={plotWidth / rounds.length}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => onHover(round)}
          />
        ))}
      </svg>
    </figure>
  );
}

export function StatsCard({ series }: { series: MemberSeries[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0 || series[0].points.length < 2) {
    return (
      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
        <h2 className="text-sm font-semibold">Season so far</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Nothing to plot yet — this needs at least two scored rounds.
        </p>
      </section>
    );
  }

  const reading = hovered === null ? null : series.map((member) => ({
    name: member.name,
    point: member.points.find((p) => p.round === hovered),
  }));

  return (
    <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800 bg-[color-mix(in_oklab,var(--accent)_10%,var(--background))]">
      {/* Both modes are chosen steps from the same ramps, not an automatic
          flip: the dark values were validated against the dark surface. */}
      <style>{`
        .league-stats {
          ${SERIES.map((c, i) => `--series-${i + 1}: ${c.light};`).join(" ")}
        }
        @media (prefers-color-scheme: dark) {
          .league-stats {
            ${SERIES.map((c, i) => `--series-${i + 1}: ${c.dark};`).join(" ")}
          }
        }
      `}</style>

      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Season so far</h2>
        <span className="text-xs text-zinc-500">
          {hovered === null ? `${series[0].points.length} rounds` : `Round ${hovered}`}
        </span>
      </div>

      {/* Legend first: identity is never carried by colour alone. */}
      <ul className="league-stats mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((member, index) => {
          const line = reading?.[index]?.point;
          return (
            <li key={member.memberId} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--series-${index + 1})` }}
              />
              <span>{member.name}</span>
              <span className="tabular-nums text-zinc-500">
                {line ? `${Math.round(line.points)} · ${line.cap.toFixed(1)}` : member.total}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="league-stats mt-3 space-y-3">
        <Panel
          series={series}
          metric="points"
          label="Points"
          hovered={hovered}
          onHover={setHovered}
        />
        <Panel
          series={series}
          metric="cap"
          label="Cost cap"
          hovered={hovered}
          onHover={setHovered}
        />
      </div>

      <p className="mt-2 text-[11px] text-zinc-500">
        Two panels, not two axes: a season total runs to thousands and a bank to tens, so one
        pair of axes would make every crossing look like something happened.
      </p>
    </section>
  );
}
