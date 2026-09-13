import { themeById, themeVariables } from "@/lib/f1/themes";
import { createServerSupabase } from "@/lib/supabase/server";
import { LeagueNav } from "./league-nav";

/**
 * Puts the league's colour on everything inside it, and holds the tabs.
 *
 * A layout rather than a per-page wrapper: the roster, paddock, bets and league
 * pages all sit under this route, and a colour that only some of them knew
 * about would read as a rendering bug rather than a scheme.
 *
 * The tabs are here for a second reason. A layout is not re-rendered when you
 * move between the pages inside it, so the bar stays put and the tap registers
 * at once — where a per-page nav was part of the page being replaced, and sat
 * there unchanged until the server answered.
 *
 * The read is deliberately thin — one column, no membership check. Authorisation
 * belongs to the pages, which already do it; a layout that redirected would
 * duplicate that rule in a second place and let the two drift. An id that is not
 * a league simply gets the default colours and then a not-found from the page.
 */
export default async function LeagueLayout({
  children,
  params,
}: LayoutProps<"/leagues/[id]">) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: league } = await supabase
    .from("leagues")
    .select("theme")
    .eq("id", id)
    .maybeSingle();

  const theme = themeById(league?.theme);

  return (
    <div
      style={themeVariables(theme)}
      // The ground stays as it is; the colour shows on the cards instead, which
      // keeps the page dark and lets each surface carry the league's identity
      // without washing the whole screen.
      className="contents"
    >
      {/* Matched to the pages' own width and padding, so the tabs line up with
          the card below them rather than sitting in their own margin. */}
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <LeagueNav leagueId={id} />
      </div>
      {children}
    </div>
  );
}
