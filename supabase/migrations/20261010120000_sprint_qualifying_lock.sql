-- A sprint weekend locks at sprint qualifying.
--
-- Everything about a round hung off `qualifying_at`: the roster and chip
-- deadline, the bet deadline, the moment rivals' squads and bets are revealed,
-- and the odds window a bet is priced in. On a sprint weekend that left all of
-- it open through Friday's sprint qualifying and Saturday morning's sprint —
-- a member could pick a team, or back a driver, with a grid already set and
-- sprint points already scored.
--
-- The weekend's first competitive session is the deadline now. Every policy
-- and function reads it through `is_round_locked`, so redefining that one
-- function moves all of them together; nothing else needs touching.
--
-- `sprint_qualifying_at` is null on every weekend without a sprint, and on a
-- round the calendar job has not refreshed since this column arrived. Both
-- fall back to qualifying, which is exactly the old behaviour.

alter table rounds add column if not exists sprint_qualifying_at timestamptz;

comment on column rounds.sprint_qualifying_at is
  'Start of sprint qualifying, from jolpica, on a sprint weekend; null otherwise. '
  'When set, the round locks at this time instead of at qualifying.';

/**
 * Whether a round's rosters are locked.
 *
 * Sprint qualifying when the weekend has one, then qualifying. An unknown
 * session time falls back to the race start: better to lock early than to
 * leave a roster editable while the race runs.
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
      r.sprint_qualifying_at,
      r.qualifying_at,
      (r.race_date + coalesce(r.race_time, '00:00'::time)) at time zone 'UTC'
    ),
    false
  )
  from rounds r
  where r.season = target_season and r.round = target_round;
$$;

grant execute on function is_round_locked(integer, integer) to authenticated;
