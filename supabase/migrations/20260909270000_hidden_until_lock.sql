-- Teams and bets go back to being private until the round locks.
--
-- Opening rosters up was tried and reversed: a weaker player could mirror a
-- stronger one and guarantee a draw against them, which is a worse outcome
-- than not seeing the comparison early. Bets were opened for a better reason —
-- a bet takes nothing from anyone who copies it — but sit under the same rule
-- again for consistency, so a member has one deadline to understand rather
-- than two.
--
-- What was actually wrong was never the rule. It was that hiding looked
-- identical to absence: an opponent's side of the matchup read "no team saved
-- yet" whether they had one or not, which looks broken rather than strict. The
-- fix is to say so, which needs a way to ask "is there something there?"
-- without reading it — see bets_placed below, and has_complete_roster, which
-- already existed for exactly this shape of question.
--
-- Restated in full rather than as a diff, so the end state is the same whether
-- or not the opening-up migration was ever applied. It never reached this
-- database; its file is deleted rather than reverted.
--
-- Both keep the clock as well as locked_at: nothing sets locked_at — it was
-- written for a job that does not exist — so keying on it alone hid every
-- past round for ever.
drop policy if exists rosters_read on rosters;

create policy rosters_read on rosters
  for select to authenticated using (
    owns_member_row(member_id)
    or (
      is_league_member(member_league(member_id))
      and (locked_at is not null or is_round_locked(season, round))
    )
  );

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

drop policy if exists bets_read on bets;

create policy bets_read on bets
  for select to authenticated using (
    owns_member_row(member_id)
    or (is_league_member(member_league(member_id)) and is_round_locked(season, round))
  );

-- How many bets a member has on a round, without saying what they are.
--
-- The count is what makes "hidden" legible: "3 bets, revealed at qualifying"
-- tells a player there is something to wait for, where an empty space tells
-- them nothing and reads as a bug. It does leak a little — that a rival is
-- active this weekend — which is a fair price for a screen that no longer
-- looks broken, and far less than the selections themselves.
create or replace function bets_placed(
  target_member uuid,
  target_season integer,
  target_round integer
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from bets b
  where b.member_id = target_member
    and b.season = target_season
    and b.round = target_round;
$$;

grant execute on function bets_placed(uuid, integer, integer) to authenticated;
