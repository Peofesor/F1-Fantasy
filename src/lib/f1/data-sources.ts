/**
 * Where the game's facts come from, and on what terms.
 *
 * Both feeds are licensed CC BY-NC-SA 4.0. Three things follow, and they are
 * stated here rather than in a document nobody opens, because two of them are
 * enforced by code in this file:
 *
 *  - **Attribution is required.** Not optional politeness — a condition of the
 *    licence, breached the moment the data is shown without it. `SOURCES` is
 *    what the attribution notice renders from, so a new feed cannot be added
 *    without appearing there.
 *
 *  - **Non-commercial only.** Neither feed may be used in anything that earns
 *    money, whatever the shape of the earning. Running this for a paying
 *    audience needs a commercial licence from each source first — jolpica ask
 *    for admin@jolpi.ca, OpenF1 for a note through their site.
 *
 *  - **ShareAlike.** Anything derived from the data carries the same licence.
 *
 * The `enabled` flag exists because those permissions may be answered one feed
 * at a time. A feed switched off must leave a game that still works rather than
 * a broken one, so everything an optional feed supports degrades: the markets
 * it settles are withdrawn, and the points it feeds score zero.
 */

export interface DataSource {
  id: "jolpica" | "openf1";
  name: string;
  url: string;
  licence: string;
  licenceUrl: string;
  /** What the game would lose without it, in a player's terms. */
  supplies: string;
  /**
   * Whether this feed may be used at all.
   *
   * False takes everything built on it off the board rather than showing it
   * empty. Set from the environment so the answer can change without a deploy
   * of new logic — a licence reply is not a code change.
   */
  enabled: boolean;
}

/**
 * Off only when explicitly disabled.
 *
 * The default is on because that is what the game has always done, and a flag
 * that silently changed behaviour on a missing variable would be worse than no
 * flag. Anything other than "off" leaves the feed running.
 */
function enabledFrom(variable: string | undefined): boolean {
  return variable?.trim().toLowerCase() !== "off";
}

export const SOURCES: DataSource[] = [
  {
    id: "jolpica",
    name: "jolpica-f1",
    url: "https://api.jolpi.ca/ergast/",
    licence: "CC BY-NC-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    supplies: "the calendar, results, qualifying and championship standings",
    // Not switchable: it is the whole game. There is no version of this without
    // a calendar and a set of results, so a flag would only ever be a way to
    // break the app. Removing it means replacing it, not disabling it.
    enabled: true,
  },
  {
    id: "openf1",
    name: "OpenF1",
    url: "https://openf1.org/",
    licence: "CC BY-NC-SA 4.0",
    licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    supplies: "overtakes, pit-stop times, safety cars and driver portraits",
    enabled: enabledFrom(process.env.F1_OPENF1),
  },
];

const byId = new Map(SOURCES.map((source) => [source.id, source]));

/** Whether a feed may be used. Unknown ids are treated as unavailable. */
export function sourceEnabled(id: DataSource["id"]): boolean {
  return byId.get(id)?.enabled ?? false;
}

/**
 * Everything that stops working when OpenF1 is switched off.
 *
 * Collected in one place so the blast radius is a list somebody can read rather
 * than a search across the codebase. Each entry is enforced where it belongs —
 * this names them, it does not implement them.
 */
export const OPENF1_SUPPORTS = {
  /** Betting markets that cannot be settled without it. */
  markets: ["most_overtakes", "fastest_pit_stop", "safety_car"] as const,
  /** Scoring that reads zero without it. */
  scoring: "overtake points",
  /** Cosmetic only: the picker falls back to initials and a neutral colour. */
  media: "driver portraits and team colours",
};
