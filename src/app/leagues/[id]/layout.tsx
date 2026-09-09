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
      // The ground is tinted too, not just the controls. Mixed from the accent
      // rather than stored as a second colour, so it follows the page into dark
      // mode instead of needing a light and a dark value per scheme:
      // --background is whatever the page currently uses, and the accent is stirred
      // into it.
      //
      // 7% is deliberately weak. The tint has to read as a colour without
      // costing contrast against the cards and body text sitting on it, and
      // anything stronger turned the greys muddy rather than tinted.
      className="min-h-full bg-[color-mix(in_oklab,var(--accent)_7%,var(--background))]"
    >
      {children}
    </div>
  );
}
