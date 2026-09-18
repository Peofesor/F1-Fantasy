-- The cap split opens up: amounts, still not picks.
--
-- cap_totals gave the league one true total each and left squad, bank and
-- stakes dashed on a rival's row, because the ledger policy holds a member's
-- spare cap back until their round locks. The league has overruled that: in a
-- private league of six the point of the table is arguing about how someone
-- spent their money, and a row of dashes is a worse trade than the edge it
-- buys.
--
-- What opens is three sums. Which drivers a rival holds is still sealed until
-- qualifying by the roster policy, which is untouched here — you can see that
-- they spent $128.9M, not what they spent it on. The thing that seal exists to
-- stop, copying a team before the deadline, is unaffected.
--
-- This folds in open_stakes, written an hour earlier to do the bets column
-- alone. One function answering for the whole row means the four figures come
-- from a single read and cannot disagree about which round they are valuing.
-- Nothing else called it, so it goes.
drop function if exists cap_totals(uuid, integer, integer);
drop function if exists open_stakes(uuid, integer);

create or replace function cap_totals(
  target_league uuid,
  target_season integer,
  price_round integer
)
returns table (member uuid, squad numeric, bank numeric, staked numeric, total numeric)
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
  -- The newest squad they hold, valued at the round being picked for, so two
  -- rows are priced on the same day rather than on whenever each last saved.
  squad_value as (
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
  bank_value as (
    select v.member_id, coalesce(sum(e.amount), 0) as amount
    from visible v
    left join cost_cap_entries e on e.member_id = v.member_id
    group by v.member_id
  ),
  -- A stake leaves the bank when it is placed, so it is carried separately and
  -- added back into the total; counting it in both would spend it twice.
  stake_value as (
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
    coalesce(sq.amount, 0),
    bk.amount,
    st.amount,
    coalesce(sq.amount, 0) + bk.amount + st.amount
  from visible v
  left join squad_value sq on sq.member_id = v.member_id
  join bank_value bk on bk.member_id = v.member_id
  join stake_value st on st.member_id = v.member_id;
$$;

grant execute on function cap_totals(uuid, integer, integer) to authenticated;
