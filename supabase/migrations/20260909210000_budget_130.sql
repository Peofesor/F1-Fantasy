-- The host lowers the league budget from 150 to 130.
--
-- 130 rather than the 100 first asked for, because 100 is not reachable. The
-- roster rules force three top-bracket drivers and a top-bracket team, and at
-- round 14 the cheapest legal eleven costs 104.5 — a league on 100 would refuse
-- every roster anyone tried to save.
--
-- 130 is the number where the budget starts doing work. The dearest legal top
-- bracket costs 106.8 and the cheapest possible remainder 26.0, so at 130 you
-- can no longer take the three most expensive top drivers and the best team and
-- still fill the rest. At 150 you could, which left 43 spare and no real choice
-- to make.

-- Everyone is adjusted by the difference, so a member who joined under the old
-- budget ends up where a member joining now would start.
insert into cost_cap_entries (member_id, season, round, amount, reason, note)
select
  m.id,
  l.season,
  (select min(r.round) from rounds r where r.season = l.season),
  130.00 - l.starting_cost_cap,
  'cap_adjustment',
  'League budget set to 130 by the host'
from leagues l
join league_members m on m.league_id = l.id
where l.starting_cost_cap <> 130.00
  and not exists (
    select 1 from cost_cap_entries e
    where e.member_id = m.id
      and e.note = 'League budget set to 130 by the host'
  );

update leagues set starting_cost_cap = 130.00 where starting_cost_cap <> 130.00;

-- Lowering a budget can leave someone owing more than they now have.
--
-- A member who joined recently and spent most of their opening grant has no
-- accumulated payouts to absorb the cut: one had 3.3 left against a 146.7
-- squad, so the adjustment alone would put them 16.7 in the red and unable to
-- change anything. Their team is also no longer affordable under the new cap,
-- which is the honest consequence — a smaller budget buys a smaller team.
--
-- So their purchases on rounds that have not been raced are refunded and those
-- rosters cleared, and they pick again against 130. Raced rounds are left
-- alone: they are scored, and rewriting them would change results.
create temporary table budget_130_affected as
select m.id as member_id
from league_members m
group by m.id
having coalesce(sum((select sum(e.amount) from cost_cap_entries e where e.member_id = m.id)), 0) < 0;

insert into cost_cap_entries (member_id, season, round, amount, reason, note)
select
  e.member_id,
  e.season,
  e.round,
  -sum(e.amount),
  'cap_adjustment',
  'Squad refunded — unaffordable under the new budget'
from cost_cap_entries e
join budget_130_affected a on a.member_id = e.member_id
where e.reason in ('driver_purchase', 'constructor_purchase')
  and not exists (
    select 1 from race_results rr where rr.season = e.season and rr.round = e.round
  )
group by e.member_id, e.season, e.round
having -sum(e.amount) > 0;

delete from rosters r
using budget_130_affected a
where r.member_id = a.member_id
  and r.locked_at is null
  and not exists (
    select 1 from race_results rr where rr.season = r.season and rr.round = r.round
  );

drop table budget_130_affected;
