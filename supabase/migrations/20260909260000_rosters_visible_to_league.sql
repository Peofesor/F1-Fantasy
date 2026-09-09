-- A league can see each other's teams straight away, not only once the round
-- has locked.
--
-- The lock was there so nobody could copy a rival's picks before the deadline,
-- and that cost is real: a weaker player can now mirror a stronger one and
-- guarantee a draw against them. It is kept out of reach of anything worse —
-- cost cap stays private, so a rival's spare budget still does not leak.
--
-- What it buys is the matchup card actually working. A head-to-head format is
-- about comparing two teams, and until now the card could only ever show one of
-- them; the opponent's side read "no team saved yet" whether they had one or
-- not, which looks broken rather than strict.
--
-- Reversible in one migration if the copying turns out to matter more than the
-- comparison. In a private league of friends who can see each other's bets
-- already, it very likely does not.
drop policy if exists rosters_read on rosters;

create policy rosters_read on rosters
  for select to authenticated using (
    owns_member_row(member_id)
    or is_league_member(member_league(member_id))
  );

drop policy if exists roster_slots_read on roster_slots;

create policy roster_slots_read on roster_slots
  for select to authenticated using (
    exists (
      select 1 from rosters r
      where r.id = roster_id
        and (owns_member_row(r.member_id) or is_league_member(member_league(r.member_id)))
    )
  );
