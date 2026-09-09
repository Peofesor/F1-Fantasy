-- Corrects the refund in 20260909210000_budget_130.sql, which paid gross.
--
-- That refund summed driver_purchase and constructor_purchase and handed the
-- total back. It should have summed the sales too: a member who swaps a driver
-- has already been credited for the one they sold, so refunding every purchase
-- returns that credit a second time.
--
-- The member it applied to had bought 182.0 across the round while selling 35.3
-- of it back, a net spend of 146.7 — and was refunded the full 182.0, leaving
-- them 35.3 better off than a clean start on the new budget.
--
-- The original migration is left as it was applied rather than edited. This
-- runs after it on a fresh database and reaches the same place.
insert into cost_cap_entries (member_id, season, round, amount, reason, note)
select
  e.member_id,
  e.season,
  e.round,
  -sum(e.amount),
  'cap_adjustment',
  'Refund corrected to net of sales'
from cost_cap_entries e
where e.reason in ('driver_sale', 'constructor_sale')
  and exists (
    select 1 from cost_cap_entries refund
    where refund.member_id = e.member_id
      and refund.season = e.season
      and refund.round = e.round
      and refund.note = 'Squad refunded — unaffordable under the new budget'
  )
  and not exists (
    select 1 from cost_cap_entries done
    where done.member_id = e.member_id
      and done.season = e.season
      and done.round = e.round
      and done.note = 'Refund corrected to net of sales'
  )
group by e.member_id, e.season, e.round
having sum(e.amount) <> 0;
