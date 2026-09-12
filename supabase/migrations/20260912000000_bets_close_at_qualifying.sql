-- Betting closes when qualifying starts, on the same clock as the roster.
--
-- Running the market on to the race start was an experiment in having two odds
-- windows: bet blind before qualifying for 1.5x, or bet knowing the grid for
-- the listed price. In practice it gave the weekend two deadlines to remember
-- and one of them landed in the middle of a session nobody wanted to be at
-- their phone for. A round now has a single moment when it shuts, which is the
-- moment the grid is set.
--
-- `is_race_started` is left in place but is no longer consulted by any policy:
-- the roster's `is_round_locked` is the one deadline now.
--
-- `current_bet_timing` is unchanged and still honest — it reports which window
-- the clock is in — but its 'pre_race' branch is unreachable for a new bet,
-- since an insert after the lock is refused outright. Bets already carrying
-- 'pre_race' are history and settle on the terms they were taken at.

drop policy if exists bets_insert_own on bets;
create policy bets_insert_own on bets
  for insert to authenticated
  with check (
    owns_member_row(member_id)
    and not is_round_locked(season, round)
    and outcome is null
    and timing = current_bet_timing(season, round)
    and has_complete_roster(member_id, season, round)
  );

-- A bet can still be taken back right up to the deadline, which is now the same
-- deadline as everything else about the round.
drop policy if exists bets_delete_own on bets;
create policy bets_delete_own on bets
  for delete to authenticated
  using (
    owns_member_row(member_id)
    and not is_round_locked(season, round)
    and outcome is null
  );
