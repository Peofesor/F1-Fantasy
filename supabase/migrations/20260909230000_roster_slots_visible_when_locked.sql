-- roster_slots and rosters disagreed about when a team becomes visible.
--
-- rosters_read was widened in 20260907120008 so a league can see each other's
-- teams once the round has locked, keyed on either locked_at or the clock:
--
--     locked_at is not null or is_round_locked(season, round)
--
-- roster_slots_read was left on the first half of that test alone. Nothing sets
-- locked_at — it was designed for a job that does not exist — so in practice
-- the row was readable and its picks were not. A member could see that a rival
-- had a team for a race run weeks ago and never see what was in it, which
-- makes the visibility rule look broken rather than strict.
--
-- The rule itself is unchanged and worth keeping: teams stay private until the
-- round locks, so nobody can copy a rival's picks before the deadline.
drop policy if exists roster_slots_read on roster_slots;

create policy roster_slots_read on roster_slots
  for select to authenticated using (
    exists (
      select 1 from rosters r
      where r.id = roster_id
        and (
          owns_member_row(r.member_id)
          or (
            is_league_member(member_league(r.member_id))
            and (r.locked_at is not null or is_round_locked(r.season, r.round))
          )
        )
    )
  );
