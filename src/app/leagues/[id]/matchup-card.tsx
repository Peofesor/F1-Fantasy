import Image from "next/image";
import Link from "next/link";

export interface MatchupPick {
  name: string;
  headshotUrl?: string;
  /** A team has no portrait of its own, so it is drawn as its two drivers. */
  lineup?: { name: string; headshotUrl?: string }[];
  colour?: string;
  /**
   * What this pick's points are multiplied by — "2x" for the armband, "3x" for
   * SuperDriver — or null when nothing boosts it. The number rather than the
   * name of the chip: on a card comparing two squads, what matters is how much
   * a slot is worth, not which purchase made it so.
   */
  boost: string | null;
  /** Teams are drawn as two overlapping faces rather than one. */
  isTeam: boolean;
}

/**
 * The rows a squad is laid out in, and the order they are read in.
 *
 * Fixed and shared by both sides, which is the whole point: the left and right
 * of a row are the same slot, so the comparison is "my top captain against
 * theirs" rather than "my fourth pick against their first". An unfilled slot is
 * a null in the array rather than a missing entry, so the two columns never
 * drift out of step.
 *
 * The captain leads its bracket. It is the slot that decides the most and the
 * one both players chose most deliberately, so it reads first rather than
 * wherever the database happened to store it.
 */
export const LINEUP_ROWS: { label: string }[] = [
  { label: "Top" },
  { label: "Top" },
  { label: "Top" },
  { label: "Top team" },
  { label: "Mid" },
  { label: "Mid" },
  { label: "Mid" },
  { label: "Mid team" },
  { label: "Backmarker" },
  { label: "Reverse team" },
];

export interface Side {
  memberId: string;
  name: string;
  /**
   * Wins, draws and losses across the season, or null in a league that does not
   * play head to head — where there is no record to have.
   */
  record: { wins: number; draws: number; losses: number } | null;
  /** Cumulative fantasy points, which is the standing a free-for-all has. */
  seasonPoints: number;
  /** One entry per LINEUP_ROWS row, null where the slot is empty or hidden. */
  slots: (MatchupPick | null)[];
  /**
   * Whether they have a team at all, which is knowable even when the picks are
   * not. Without it an empty side cannot say which kind of empty it is, and
   * "hidden until qualifying" and "has not picked yet" are opposite messages —
   * one is worth waiting for, the other is worth a nudge.
   */
  hasTeam: boolean;
  /** Bets on this round; the count is readable before the selections are. */
  bets: number;
  /** Fantasy points for this round, once it is scored. */
  points?: number | null;
  /** 1 for a win, 0.5 a draw, 0 a defeat, null when the duel has not run. */
  duelPoints?: number | null;
}

/** Two squads drawn against each other, or one on a bye. */
export interface Matchup {
  /** Stable within a round, so the carousel can be told which one to open on. */
  id: string;
  /** The viewer's own side first when they are in this one. */
  sides: Side[];
  /** Whether the viewer is in it, which is the one the carousel opens on. */
  isSelf: boolean;
}

/** A colour from the id, so a member looks the same everywhere without storing one. */
function monogramColour(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 55% 45%)`;
}

/**
 * A member's picture.
 *
 * Initials on a colour derived from their id: nothing in the schema holds an
 * uploaded portrait yet, and a grey silhouette repeated four times would
 * identify nobody. The colour is a pure function of the id, so a member is the
 * same colour on every card and every device.
 */
function MemberAvatar({ side, size }: { side: Side; size: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        backgroundColor: monogramColour(side.memberId),
        height: size,
        width: size,
        fontSize: size * 0.38,
      }}
    >
      {side.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/**
 * A pick, as a face and a name.
 *
 * Mirrored on the opponent's side so both squads read outward from the centre
 * label: the two things being compared end up adjacent instead of a column
 * apart.
 */
function PickFace({ pick, mirrored }: { pick: MatchupPick | null; mirrored: boolean }) {
  if (!pick) {
    return (
      <span
        aria-hidden
        className={`flex min-w-0 flex-1 items-center gap-2 ${mirrored ? "flex-row-reverse" : ""}`}
      >
        <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700" />
        <span className="text-xs text-zinc-400">—</span>
      </span>
    );
  }

  const accent = pick.colour ? `#${pick.colour}` : "#a1a1aa";
  const seats = pick.lineup?.slice(0, 2) ?? [];

  return (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${mirrored ? "flex-row-reverse" : ""}`}
      title={pick.name}
    >
      <span className="relative shrink-0">
        {pick.isTeam && seats.length > 0 ? (
          <span className="flex items-center">
            {seats.map((seat, index) =>
              seat.headshotUrl ? (
                <Image
                  key={seat.name}
                  src={seat.headshotUrl}
                  alt=""
                  width={96}
                  height={96}
                  className="h-8 w-8 rounded-full object-cover"
                  style={{ outline: `1.5px solid ${accent}`, marginLeft: index === 0 ? 0 : "-35%" }}
                  unoptimized
                />
              ) : (
                <span
                  key={seat.name}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                  style={{ backgroundColor: accent, marginLeft: index === 0 ? 0 : "-35%" }}
                >
                  {seat.name.slice(0, 2).toUpperCase()}
                </span>
              ),
            )}
          </span>
        ) : pick.headshotUrl ? (
          <Image
            src={pick.headshotUrl}
            alt=""
            width={96}
            height={96}
            className="h-8 w-8 rounded-full object-cover"
            style={{ outline: `1.5px solid ${accent}` }}
            unoptimized
          />
        ) : (
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {pick.name.slice(0, 2).toUpperCase()}
          </span>
        )}
        {pick.boost && (
          <span
            aria-label={`scores ${pick.boost}`}
            className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1 text-[8px] font-bold leading-3 text-zinc-900"
          >
            {pick.boost}
          </span>
        )}
      </span>
      {/* Wrapped rather than truncated: two squads mirrored across a label
          leave each name about half a phone wide, and an ellipsis there hides
          the one word being compared. */}
      <span
        className={`line-clamp-2 min-w-0 flex-1 text-[11px] leading-tight ${
          mirrored ? "text-right" : ""
        }`}
      >
        {displayName(pick)}
      </span>
    </span>
  );
}

/**
 * A team's name with the boilerplate off.
 *
 * The reference data calls them "Alpine F1 Team" and "Aston Martin F1 Team",
 * which is three words of which one identifies the team. In a column half a
 * phone wide that spends the space on "F1 Team" and ellipses the part that
 * matters. Drivers are left alone — a surname is already short.
 */
function displayName(pick: MatchupPick): string {
  return pick.isTeam ? pick.name.replace(/\s+(?:F1|Formula 1)\s+Team$/i, "") : pick.name;
}

/** What a side has instead of a lineup, when it has none to show. */
function emptyNote(side: Side): string {
  return side.hasTeam ? "team picked, hidden until qualifying" : "no team picked yet";
}

/**
 * The header: two members facing each other across a VS.
 *
 * Separated from the lineup because it is the part that scrolls. The carousel
 * swipes between the round's fixtures by moving these, and the lineup below
 * follows whichever one is showing.
 */
export function MatchupHeader({
  leagueId,
  matchup,
  duel,
}: {
  leagueId: string;
  matchup: Matchup;
  duel: boolean;
}) {
  const [mine, theirs] = matchup.sides;

  return (
    <div className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-[color-mix(in_oklab,var(--accent)_12%,var(--background))] p-3 dark:border-zinc-800">
      <MemberColumn leagueId={leagueId} side={mine} duel={duel} align="left" />

      <div className="flex shrink-0 flex-col items-center pt-2.5">
        {/* The scores replace the VS once there are any: a settled fixture is
            about what happened, and "VS" over two numbers says it twice. */}
        {theirs && mine.points !== null && mine.points !== undefined ? (
          <span className="flex items-baseline gap-1 text-sm font-semibold tabular-nums">
            <span className={mine.duelPoints === 1 ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {mine.points.toFixed(0)}
            </span>
            <span className="text-[10px] font-normal text-zinc-400">–</span>
            <span
              className={theirs.duelPoints === 1 ? "text-emerald-600 dark:text-emerald-400" : ""}
            >
              {(theirs.points ?? 0).toFixed(0)}
            </span>
          </span>
        ) : (
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
            {theirs ? "vs" : "bye"}
          </span>
        )}
      </div>

      {theirs ? (
        <MemberColumn leagueId={leagueId} side={theirs} duel={duel} align="right" />
      ) : (
        <p className="min-w-0 flex-1 pt-1 text-right text-[11px] leading-snug text-zinc-500">
          Nobody drawn this round. Your points still count toward the season.
        </p>
      )}
    </div>
  );
}

function MemberColumn({
  leagueId,
  side,
  duel,
  align,
}: {
  leagueId: string;
  side: Side;
  duel: boolean;
  align: "left" | "right";
}) {
  const right = align === "right";

  return (
    <div className={`flex min-w-0 flex-1 gap-2 ${right ? "flex-row-reverse" : ""}`}>
      <MemberAvatar side={side} size={40} />
      <div className={`min-w-0 flex-1 ${right ? "text-right" : ""}`}>
        <Link
          href={`/leagues/${leagueId}/members/${side.memberId}`}
          className="block truncate text-sm font-semibold underline-offset-2 hover:underline"
        >
          {side.name}
        </Link>
        <p className="truncate text-[11px] tabular-nums text-zinc-500">
          {/* A record is what a duel league is played for; a free-for-all has
              none, so it shows the thing it is actually ranked on instead. */}
          {duel && side.record
            ? `${side.record.wins}-${side.record.draws}-${side.record.losses}`
            : `${side.seasonPoints.toFixed(0)} pts`}
        </p>
        {side.bets > 0 && (
          <p className="truncate text-[10px] text-zinc-400">
            {side.bets} bet{side.bets === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The lineup: one row per slot, the position named down the middle.
 *
 * The centre column is what makes this readable on a phone. Two squads printed
 * as two lists leave the reader counting rows to work out which pick faces
 * which; naming the slot between them means the comparison is already made by
 * the time the row has been read.
 */
export function MatchupLineup({ matchup }: { matchup: Matchup }) {
  const [mine, theirs] = matchup.sides;
  const anyPicks = matchup.sides.some((side) => side.slots.some(Boolean));

  if (!anyPicks) {
    return (
      <div className="space-y-1 rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
        {matchup.sides.map((side) => (
          <p key={side.memberId} className="text-xs text-zinc-500">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{side.name}</span> —{" "}
            {emptyNote(side)}
          </p>
        ))}
      </div>
    );
  }

  // A side with nothing in it fills its column with dashes, which shows that
  // there is nothing without saying why. One line says which of the two
  // reasons it is — a team still sealed, or a player who has not picked.
  const silent = matchup.sides.filter((side) => !side.slots.some(Boolean));

  return (
    <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {silent.map((side) => (
        <p key={side.memberId} className="px-2.5 py-1.5 text-[11px] text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{side.name}</span> —{" "}
          {emptyNote(side)}
        </p>
      ))}
      {LINEUP_ROWS.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          className="flex items-center gap-2 px-2.5 py-1.5 odd:bg-[color-mix(in_oklab,var(--accent)_7%,var(--background))]"
        >
          <PickFace pick={mine.slots[index] ?? null} mirrored={false} />

          {/* The multiplier used to be repeated here as well as on the face.
              It only ever said which slot could hold the armband, and now that
              SuperDriver can triple any of the six driver slots, the badge on
              the face is the one that can tell the truth about a given pick. */}
          <span className="w-16 shrink-0 text-center text-[9px] font-medium uppercase leading-tight tracking-wide text-zinc-400">
            {row.label}
          </span>

          {theirs ? <PickFace pick={theirs.slots[index] ?? null} mirrored /> : <span className="min-w-0 flex-1" />}
        </div>
      ))}
    </div>
  );
}
