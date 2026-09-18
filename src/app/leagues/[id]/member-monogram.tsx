/**
 * A member's picture.
 *
 * Initials on a colour derived from their id: nothing in the schema holds an
 * uploaded portrait yet, and a grey silhouette repeated four times would
 * identify nobody. The colour is a pure function of the id, so a member is the
 * same colour on every card, every panel and every device — which is the whole
 * point of it, and the reason it lives here rather than inside the one card
 * that first needed it.
 */
export function MemberMonogram({
  memberId,
  name,
  size,
}: {
  memberId: string;
  name: string;
  /** Pixels. The initials are scaled from it, so one number sets the whole thing. */
  size: number;
}) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        backgroundColor: monogramColour(memberId),
        height: size,
        width: size,
        fontSize: size * 0.38,
      }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** A colour from the id, so a member looks the same everywhere without storing one. */
function monogramColour(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 55% 45%)`;
}
