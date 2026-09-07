-- Roster lock deadlines.
--
-- A roster locks when qualifying begins (spec §6: the Final Fix chip exists
-- precisely to change one slot after that point). jolpica publishes the
-- qualifying session time alongside the race, so the deadline is real data
-- rather than an estimate.
--
-- Locking is DERIVED, not written by a scheduled job. A job that failed to run
-- would leave rosters editable after the deadline — a cheating vector, since
-- results are known by then. Comparing against a stored timestamp cannot be
-- late. `rosters.locked_at` is retained as an explicit override for a manual
-- freeze, and takes effect regardless of the clock.

alter table rounds add column if not exists qualifying_at timestamptz;

comment on column rounds.qualifying_at is
  'Start of qualifying, from jolpica. Rosters for this round lock at this time.';

/**
 * Whether a round's rosters are locked.
 *
 * Unknown qualifying time falls back to the race start: better to lock early
 * than to leave a roster editable while the race runs.
 */
create or replace function is_round_locked(target_season integer, target_round integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    now() >= coalesce(
      r.qualifying_at,
      (r.race_date + coalesce(r.race_time, '00:00'::time)) at time zone 'UTC'
    ),
    false
  )
  from rounds r
  where r.season = target_season and r.round = target_round;
$$;

grant execute on function is_round_locked(integer, integer) to authenticated;

-- Rosters become visible to the rest of the league once locked, so picks cannot
-- be copied before the deadline. Previously this keyed off `locked_at` alone,
-- which would never be set without a job.
drop policy if exists rosters_read on rosters;
create policy rosters_read on rosters
  for select to authenticated using (
    owns_member_row(member_id)
    or (
      is_league_member(member_league(member_id))
      and (locked_at is not null or is_round_locked(season, round))
    )
  );

-- A locked roster cannot be edited by its owner either. Without this the lock
-- would be advisory: the save path checks it, but a direct PostgREST call would
-- not.
drop policy if exists rosters_write_own on rosters;

create policy rosters_insert_own on rosters
  for insert to authenticated
  with check (owns_member_row(member_id) and not is_round_locked(season, round));

create policy rosters_update_own on rosters
  for update to authenticated
  using (owns_member_row(member_id) and locked_at is null and not is_round_locked(season, round))
  with check (owns_member_row(member_id));

create policy rosters_delete_own on rosters
  for delete to authenticated
  using (owns_member_row(member_id) and not is_round_locked(season, round));

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

drop policy if exists roster_slots_write_own on roster_slots;
create policy roster_slots_write_own on roster_slots
  for all to authenticated
  using (
    exists (
      select 1 from rosters r
      where r.id = roster_id
        and owns_member_row(r.member_id)
        and r.locked_at is null
        and not is_round_locked(r.season, r.round)
    )
  )
  with check (
    exists (
      select 1 from rosters r
      where r.id = roster_id
        and owns_member_row(r.member_id)
        and r.locked_at is null
        and not is_round_locked(r.season, r.round)
    )
  );
