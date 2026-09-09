-- Bets become visible to the league as soon as they are placed.
--
-- They were held back until the round locked, on the same reasoning as rosters:
-- do not let anyone copy a pick before the deadline. That reasoning is much
-- weaker for a bet than for a team.
--
-- A roster is a zero-sum choice inside a shared budget — copying one is copying
-- the work of finding it. A bet is not: prices are per selection and fixed when
-- the bet is struck, the house margin applies to everyone equally, and one
-- member backing Verstappen takes nothing away from another doing the same. The
-- pre-qualifying bonus is unaffected too, since it pays for not knowing the
-- grid, not for not knowing what your rivals fancy.
--
-- What it buys is the part of a private league that a scoreboard cannot: seeing
-- that someone has put a tenth of their bank on a wet-weather gamble, while
-- there is still time to argue with them about it.
--
-- Stakes, selections and settled outcomes all become readable. Cost cap stays
-- private, which is the figure that would reveal a move not yet made.
drop policy if exists bets_read on bets;

create policy bets_read on bets
  for select to authenticated using (
    owns_member_row(member_id)
    or is_league_member(member_league(member_id))
  );
