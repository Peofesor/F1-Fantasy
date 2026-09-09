/**
 * League colour schemes.
 *
 * The app was greyscale apart from the team stripe on a roster card, which is
 * correct for legibility and dull to look at. A league picks a scheme and it
 * colours the things you act on — the selected tab, the primary button, a
 * count badge, the budget bar.
 *
 * Two colours per scheme, not one. An accent alone is unusable: text has to sit
 * on it, and white on Alpine's pink is unreadable while black on Red Bull's
 * navy is worse. Every scheme therefore carries the ink that belongs on it.
 *
 * Deliberately not themed: the status colours. Green for a win and red for a
 * loss carry meaning rather than identity, and a league that chose red as its
 * accent would otherwise turn every result into a defeat.
 *
 * The palettes are the teams' own racing colours, which is why they are named
 * after them — a player picking "Papaya" knows exactly what they are getting.
 */

export interface LeagueTheme {
  id: string;
  name: string;
  /** The colour itself. Used for fills and borders. */
  accent: string;
  /** What stays readable on top of the accent. */
  ink: string;
  /**
   * A lighter wash for tinted surfaces, where the full accent would shout.
   * Kept explicit rather than derived so each scheme can be judged by eye.
   */
  wash: string;
}

export const THEMES: LeagueTheme[] = [
  { id: "graphite", name: "Graphite", accent: "#18181b", ink: "#ffffff", wash: "#f4f4f5" },
  { id: "scarlet", name: "Scarlet", accent: "#c8102e", ink: "#ffffff", wash: "#fdecef" },
  { id: "papaya", name: "Papaya", accent: "#ff8000", ink: "#1c1300", wash: "#fff3e3" },
  { id: "petrol", name: "Petrol", accent: "#00a19c", ink: "#04211f", wash: "#e4f6f5" },
  { id: "midnight", name: "Midnight", accent: "#1b3a8f", ink: "#ffffff", wash: "#e9edfa" },
  { id: "blossom", name: "Blossom", accent: "#e5399b", ink: "#2a0416", wash: "#fdeaf4" },
];

/** The scheme a league without a choice gets: the greyscale it had before. */
export const DEFAULT_THEME_ID = "graphite";

export function themeById(id: string | null | undefined): LeagueTheme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * The custom properties a themed subtree sets.
 *
 * Returned as a style object rather than written into a stylesheet, because a
 * league's colour is data: it is read per request and cannot be known when the
 * CSS is built.
 */
export function themeVariables(theme: LeagueTheme): React.CSSProperties {
  return {
    "--accent": theme.accent,
    "--accent-ink": theme.ink,
    "--accent-wash": theme.wash,
  } as React.CSSProperties;
}
