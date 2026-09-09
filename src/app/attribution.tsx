import { SOURCES } from "@/lib/f1/data-sources";

/**
 * Who the data belongs to.
 *
 * A licence condition, not a courtesy: both feeds are CC BY-NC-SA 4.0, which
 * requires naming the source and its licence wherever the data is shown. The
 * app displayed results, prices and standings on every page and credited
 * nobody, which was a breach from the first render.
 *
 * Rendered from `SOURCES` rather than written out, so adding a feed without
 * crediting it is not something a person has to remember. A source switched off
 * is left out — it supplied nothing, so there is nothing to attribute.
 */
export function Attribution() {
  const used = SOURCES.filter((source) => source.enabled);

  return (
    <footer className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4 text-[11px] leading-relaxed text-zinc-500">
      <p>
        Formula 1 data from{" "}
        {used.map((source, index) => (
          <span key={source.id}>
            {index > 0 && (index === used.length - 1 ? " and " : ", ")}
            <a href={source.url} className="underline" rel="noreferrer" target="_blank">
              {source.name}
            </a>{" "}
            (
            <a href={source.licenceUrl} className="underline" rel="noreferrer" target="_blank">
              {source.licence}
            </a>
            )
          </span>
        ))}
        .
      </p>
      <p className="mt-1">
        An unofficial fan project for a private league, not affiliated with, endorsed by, or
        connected to Formula 1, the FIA, or any team. F1 and FORMULA 1 are trademarks of their
        respective owners.
      </p>
      {/* In the footer rather than behind a menu: the moment someone wants to
          report something is the moment something looks wrong, and hunting for
          where to say so is how a report turns into a shrug. */}
      <p className="mt-2">
        Something broken or unfair?{" "}
        <a
          href="https://github.com/Peofesor/F1-Fantasy/issues/new"
          className="underline"
          rel="noreferrer"
          target="_blank"
        >
          Report it
        </a>
        .
      </p>
    </footer>
  );
}
