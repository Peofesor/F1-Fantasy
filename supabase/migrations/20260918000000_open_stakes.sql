-- What each member has riding, readable by the whole league.
--
-- The standings already carry a Bets column, but it was summed from the bet
-- rows themselves, and those are sealed until the round locks. So a rival's
-- open stake read as $0.0M right up to qualifying and then jumped — the one
-- column that is supposed to explain a gap between two totals was the column
-- that quietly lied about it, and the totals it fed into did not add up.
--
-- The amount is a different disclosure from the selections. What leaks a move
-- not yet made is *what* a rival backed; that they have committed a fifth of
-- their bank this weekend is exactly the sort of thing a league is for arguing
-- about, and it is already implied by a total cash figure that has to balance.
-- So the sum is opened up and the picks stay sealed, the same split
-- `bets_placed` makes for the count.
--
-- Per league rather than per member: the standings want every row at once, and
-- five round trips to draw one column is five too many.
create or replace function open_stakes(
  target_league uuid,
  target_season integer
)
returns table (member uuid, staked numeric)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, coalesce(sum(b.stake), 0)::numeric
  from league_members m
  left join bets b
    on b.member_id = m.id
   and b.season = target_season
   and b.outcome is null
  where m.league_id = target_league
    -- Security definer reads past the bets policy, so membership is checked
    -- here instead. A non-member gets no rows, not a zero.
    and is_league_member(target_league)
  group by m.id;
$$;

grant execute on function open_stakes(uuid, integer) to authenticated;
