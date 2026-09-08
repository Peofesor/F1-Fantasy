-- Raise the default starting cost cap from 130 to 145.
--
-- Prices now come from finishing position rather than championship points, so
-- the third of the grid that scores nothing is no longer pinned to the floor
-- price. That is the point of the change, but it also lifts the cheapest legal
-- roster, because the cheap seats genuinely cost more than they used to:
--
--   cheapest legal roster   104.5 -> 116.9
--   dearest legal roster    ~186  (unchanged)
--
-- 130 was calibrated so the cheapest roster sat at about 80% of the cap,
-- leaving roughly a fifth of the budget as real spending room. Holding that
-- same ratio against the new floor gives 116.9 / 0.8 = 146, rounded to 145.
-- Left at 130 the headroom would have fallen from 25.5 to 13.1 and the budget
-- would admit barely more than the cheapest team.

alter table leagues alter column starting_cost_cap set default 145.00;

comment on column leagues.starting_cost_cap is
  'Opening cost cap for every member. Default 145 leaves about a fifth of the '
  'budget as spending room above the cheapest legal roster (~117), while an '
  'all-premium roster (~186) stays unaffordable.';
