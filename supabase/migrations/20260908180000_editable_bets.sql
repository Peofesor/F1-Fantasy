-- Bets stay editable until the race starts, and their odds window is decided
-- by the clock rather than by the form.
--
-- Two problems, both found while making bets editable:
--
-- 1. Betting closed when qualifying began, on the same trigger as the roster.
--    That made the "after qualifying" window unreachable: every bet was
--    necessarily placed before qualifying, so choosing "pre-race" only bought
--    worse odds for identical information. Betting now runs until the race
--    starts, which is what makes two windows mean anything.
--
-- 2. `bets.timing` came from the submitted form. Harmless while betting shut at
--    qualifying, but once the window extends past it, a direct POST could claim
--    the 1.5x pre-qualifying bonus after seeing the grid. The value is now
--    derived from `qualifying_at` in the database, and the insert policy
--    refuses a row that disagrees with the clock.
--
-- A bet may also be withdrawn while it is still open, which the roster's own
-- "change your mind until the deadline" rule already implied but bets did not
-- allow.

/**
 * Whether a round's race has begun.
 *
 * Falls back to the race date at midnight when no time is recorded: better to
 * close betting early than to leave a market open while the race runs.
 */
create or replace function is_race_started(target_season integer, target_round integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    now() >= (r.race_date + coalesce(r.race_time, '00:00'::time)) at time zone 'UTC',
    false
  )
  from rounds r
  where r.season = target_season and r.round = target_round;
$$;

grant execute on function is_race_started(integer, integer) to authenticated;

/**
 * The odds window a bet placed right now belongs to.
 *
 * Before qualifying pays the bonus, because the grid is unknown; after it, the
 * same bet is a better-informed guess and pays the listed odds.
 */
create or replace function current_bet_timing(target_season integer, target_round integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when is_round_locked(target_season, target_round) then 'pre_race'
    else 'pre_qualifying'
  end;
$$;

grant execute on function current_bet_timing(integer, integer) to authenticated;

-- Betting now runs to the race start, and the claimed window must match the
-- clock.
drop policy if exists bets_insert_own on bets;
create policy bets_insert_own on bets
  for insert to authenticated
  with check (
    owns_member_row(member_id)
    and not is_race_started(season, round)
    and outcome is null
    and timing = current_bet_timing(season, round)
  );

-- An open bet can be withdrawn until the race starts. Settled bets are history
-- and stay put.
drop policy if exists bets_delete_own on bets;
create policy bets_delete_own on bets
  for delete to authenticated
  using (
    owns_member_row(member_id)
    and not is_race_started(season, round)
    and outcome is null
  );
