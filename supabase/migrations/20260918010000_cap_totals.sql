-- What each member's cap adds up to, without saying how it splits.
--
-- The standings' money columns are read under two seals: a roster is hidden
-- until its round locks, and a rival's ledger is readable only up to the last
-- locked round. Both were being rendered as if the gap were not there. A member
-- who joined on the open round had no locked roster at all, so their squad read
-- $0.0M while they were fielding ten; their purchases sat in hidden ledger
-- rows, so their bank read the opening grant untouched. One row in this league
-- showed $221.7M in the bank against a real $0.7M. The column that is supposed
-- to make two totals comparable was the least true thing on the page.
--
-- The split is what the seal is for: knowing how much of a rival's cap is spare
-- right now is knowing what they can still bid, which is why the ledger policy
-- holds it back. The total is not — squad plus bank plus stakes is one number
-- that says how the season has gone, and it reveals no spare cap, because you
-- cannot tell from it which part is which.
--
-- So the total comes from here, true for everyone, and the page draws the split
-- only where it can read all of it. `sealed` says which case a row is in
-- without naming an amount: the same disclosure `bets_placed` already makes,
-- that a member has acted this weekend.
--
-- The price round is passed in rather than worked out here. The page already
-- decides which round it is valuing at, and two answers to that question is one
-- too many.
create or replace function cap_totals(
  target_league uuid,
  target_season integer,
  price_round integer
)
returns table (member uuid, total numeric, sealed boolean)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    select m.id as member_id
    from league_members m
    -- Security definer reads past every policy above, so membership is checked
    -- here instead. A non-member gets no rows, not a table of zeros.
    where m.league_id = target_league
      and is_league_member(target_league)
  ),
  latest as (
    select r.member_id, max(r.round) as at_round
    from rosters r
    join visible v on v.member_id = r.member_id
    where r.season = target_season
    group by r.member_id
  ),
  -- The newest squad they hold, valued at the round being picked for — the
  -- same basis the page values your own on, so two rows are comparable.
  squad as (
    select l.member_id, coalesce(sum(coalesce(dp.price, cp.price, 0)), 0) as amount
    from latest l
    join rosters r
      on r.member_id = l.member_id and r.season = target_season and r.round = l.at_round
    join roster_slots s on s.roster_id = r.id
    left join driver_prices dp
      on dp.driver_id = s.driver_id
     and dp.season = target_season
     and dp.round = price_round
    left join constructor_prices cp
      on cp.constructor_id = s.constructor_id
     and cp.season = target_season
     and cp.round = price_round
    group by l.member_id
  ),
  bank as (
    select v.member_id, coalesce(sum(e.amount), 0) as amount
    from visible v
    left join cost_cap_entries e on e.member_id = v.member_id
    group by v.member_id
  ),
  -- A stake leaves the bank when it is placed, so it is added back here; not
  -- adding it would count every open bet as spent and gone.
  stakes as (
    select v.member_id, coalesce(sum(b.stake), 0) as amount
    from visible v
    left join bets b
      on b.member_id = v.member_id
     and b.season = target_season
     and b.outcome is null
    group by v.member_id
  )
  select
    v.member_id,
    coalesce(sq.amount, 0) + bk.amount + st.amount,
    exists (
      select 1 from rosters r
      where r.member_id = v.member_id
        and r.season = target_season
        and not is_round_locked(r.season, r.round)
    )
    or exists (
      select 1 from cost_cap_entries e
      where e.member_id = v.member_id
        and not is_round_locked(e.season, e.round)
    )
  from visible v
  left join squad sq on sq.member_id = v.member_id
  join bank bk on bk.member_id = v.member_id
  join stakes st on st.member_id = v.member_id;
$$;

grant execute on function cap_totals(uuid, integer, integer) to authenticated;
