-- Betting counts the team you are actually fielding, carried or not.
--
-- A bet requires a complete roster, because both come out of the same cap and
-- the roster is the larger claim on it. That check asked whether a roster row
-- existed for this exact round — which was the same question until teams
-- started persisting. Now a member who has not touched their squad since the
-- last race is fielding it all the same, and the row for the new round is
-- written by a job that runs once a day. Between the round opening and the job
-- running, betting was refused with "save a full roster first" to members whose
-- roster was already saved, and already paid for.
--
-- `has_complete_roster` keeps its exact meaning: is there a complete roster
-- stored for this round. It is the right question for "is there a team here to
-- hide until qualifying", which is what the matchup card and the profile ask,
-- and answering it loosely would claim a hidden squad on rounds that never had
-- one.
--
-- The new function is the other question — what does this member field — and
-- only the betting gate asks it.

/**
 * Whether a member fields a full roster in a round, including one carried
 * forward from an earlier round they have not changed since.
 *
 * The carry rule is "your last team stands until you replace it", so the round
 * that counts is the most recent one at or before this with a roster of its
 * own. Nothing before that can be carried past a later team.
 */
create or replace function fields_complete_roster(
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
  select has_complete_roster(
    target_member,
    target_season,
    coalesce(
      (
        select r.round
        from rosters r
        where r.member_id = target_member
          and r.season = target_season
          and r.round <= target_round
        order by r.round desc
        limit 1
      ),
      target_round
    )
  );
$$;

grant execute on function fields_complete_roster(uuid, integer, integer) to authenticated;

drop policy if exists bets_insert_own on bets;
create policy bets_insert_own on bets
  for insert to authenticated
  with check (
    owns_member_row(member_id)
    and not is_round_locked(season, round)
    and outcome is null
    and timing = current_bet_timing(season, round)
    and fields_complete_roster(member_id, season, round)
  );
