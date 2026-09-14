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
 *
 * Its own module because both the card that draws these rows and the page that
 * fills them need it, and the card is a client component — data both sides read
 * should not have to cross that boundary.
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
  { label: "Backmarker team" },
];
