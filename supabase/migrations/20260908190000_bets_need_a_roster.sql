-- A bet requires a complete roster for that round.
--
-- The bank and the roster are drawn from the same cost cap, and the roster is
-- the larger claim on it. A member who bet first could leave themselves unable
-- to field a legal team: with the cheapest roster at ~117 against a 150 budget,
-- a maximum stake of 26.6 is enough to make the team unaffordable. The order
-- matters because betting is optional and fielding a team is not.
--
-- Enforced in the database rather than only in the Server Action, since an
-- action takes a direct POST and this is a rule about money.

/**
 * Whether a member has a full roster stored for a round.
 *
 * Full means all ten slots and both captains: an incomplete roster is not
 * committing the cap it appears to, so it would not close the hole this
 * check exists for.
 */
create or replace function has_complete_roster(
  target_member uuid,
  target_season integer,
  target_round integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from rosters r
    where r.member_id = target_member
      and r.season = target_season
      and r.round = target_round
      and r.top_captain_id is not null
      and r.mid_captain_id is not null
      and (
        select count(*) filter (where s.slot_type = 'driver_top') = 3
           and count(*) filter (where s.slot_type = 'driver_mid') = 3
           and count(*) filter (where s.slot_type = 'driver_backmarker') = 1
           and count(*) filter (where s.slot_type = 'constructor_top') = 1
           and count(*) filter (where s.slot_type = 'constructor_mid') = 1
           and count(*) filter (where s.slot_type = 'constructor_reverse') = 1
        from roster_slots s
        where s.roster_id = r.id
      )
  );
$$;

grant execute on function has_complete_roster(uuid, integer, integer) to authenticated;

drop policy if exists bets_insert_own on bets;
create policy bets_insert_own on bets
  for insert to authenticated
  with check (
    owns_member_row(member_id)
    and not is_race_started(season, round)
    and outcome is null
    and timing = current_bet_timing(season, round)
    and has_complete_roster(member_id, season, round)
  );
