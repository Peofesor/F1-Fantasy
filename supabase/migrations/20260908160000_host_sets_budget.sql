-- The host chooses the league budget, and two corrections to leagues already
-- running.
--
-- 1. `starting_cost_cap` is now set from the create-league form rather than
--    always taking the column default. The column and its trigger already
--    supported this; nothing but the form was missing.
--
-- 2. Chips bought before prices fell from 10-20 to 1-3 are refunded the
--    difference. Six were bought across the two leagues, four of them at the
--    old prices, overpaying by 64 in total:
--
--      super_driver  20 -> 3   (x3, 17 each)
--      autopilot     15 -> 2   (13)
--
--    Repricing mid-season is a change made under the member rather than by
--    them, so the difference goes back. Recorded as its own ledger entry, not
--    by rewriting `chip_purchases.price_paid`, so the history still shows what
--    was actually charged at the time.

-- A refund per member, sized to what they actually overpaid.
insert into cost_cap_entries (member_id, season, round, amount, reason, note)
select
  p.member_id,
  l.season,
  (select min(r.round) from rounds r where r.season = l.season),
  sum(p.price_paid - c.new_price),
  'cap_adjustment',
  'Refund of chips bought before the 1-3 repricing'
from chip_purchases p
join league_members m on m.id = p.member_id
join leagues l on l.id = m.league_id
join (values
  ('super_driver', 3.00),
  ('unlimited_cap', 3.00),
  ('final_fix', 2.00),
  ('autopilot', 2.00),
  ('wildcard', 2.00),
  ('no_negative', 1.00)
) as c(chip_id, new_price) on c.chip_id = p.chip_id
where p.price_paid > c.new_price
  and not exists (
    select 1 from cost_cap_entries e
    where e.member_id = p.member_id
      and e.note = 'Refund of chips bought before the 1-3 repricing'
  )
group by p.member_id, l.season
having sum(p.price_paid - c.new_price) > 0;

-- 3. The host asked for 150 rather than the 160 default. Existing members are
--    debited the 10 so their balance matches what a member joining now would
--    be granted.
insert into cost_cap_entries (member_id, season, round, amount, reason, note)
select
  m.id,
  l.season,
  (select min(r.round) from rounds r where r.season = l.season),
  150.00 - l.starting_cost_cap,
  'cap_adjustment',
  'League budget set to 150 by the host'
from leagues l
join league_members m on m.league_id = l.id
where l.starting_cost_cap <> 150.00
  and not exists (
    select 1 from cost_cap_entries e
    where e.member_id = m.id
      and e.note = 'League budget set to 150 by the host'
  );

update leagues set starting_cost_cap = 150.00 where starting_cost_cap <> 150.00;

comment on column leagues.starting_cost_cap is
  'Opening cost cap for every member, chosen by the host when the league is '
  'created (120-250, default 160). Locked for the season: it changes how the '
  'whole league scores.';
