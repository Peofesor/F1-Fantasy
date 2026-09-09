import { themeById, themeVariables } from "@/lib/f1/themes";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Puts the league's colour on everything inside it.
 *
 * A layout rather than a per-page wrapper: the roster, paddock, bets and league
 * pages all sit under this route, and a colour that only some of them knew
 * about would read as a rendering bug rather than a scheme.
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
      {children}
    </div>
  );
}
