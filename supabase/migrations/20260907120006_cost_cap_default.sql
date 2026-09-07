-- Raise the default starting cost cap from 100 to 130.
--
-- The original 100 was a placeholder chosen before prices existed. Measured
-- against derived prices at 2026 round 13, it admitted only one viable roster:
--
--   cheapest legal roster   88.6   fits 100
--   stars and scrubs       111.8   does not fit 100
--   balanced               116.6   does not fit 100
--   every premium pick     206.5   fits nothing
--
-- A cap that permits exactly one affordable team is not a budget, it is a
-- forced selection. At 130 the first three archetypes are all reachable while
-- buying every premium pick stays far out of reach, so the trade-off the budget
-- exists to create actually bites.

alter table leagues alter column starting_cost_cap set default 130.00;

comment on column leagues.starting_cost_cap is
  'Opening cost cap for every member. Default 130 admits several viable roster '
  'shapes while keeping an all-premium roster (~206) unaffordable.';
