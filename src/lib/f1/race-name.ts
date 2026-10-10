/**
 * A race name short enough for a round switcher.
 *
 * The calendar's "Emilia Romagna Grand Prix" is three times the width of the
 * "Round 7" it replaces in a control squeezed between two arrows. "Grand Prix"
 * is the part every race shares, so it is the part to abbreviate; the name
 * that tells one race from another stays whole.
 */
export function shortRaceName(raceName: string): string {
  return raceName.replace(/\bGrand Prix\b/, "GP");
}
