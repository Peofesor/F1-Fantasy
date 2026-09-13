-- On-track passes counted per driver per race, in the database.
--
-- Pricing the "most overtakes" market needs one number per driver per weekend:
-- how many passes they made. It was getting there by reading every overtake in
-- the ten-race window — 2,384 rows — through a Data API that returns at most a
-- thousand at a time, so three sequential round trips carrying a few hundred
-- kilobytes were spent producing about two hundred integers. It is the slowest
-- thing the paddock and the bets page do, and both do it on every visit.
--
-- Counting is what a database is for. The view is a plain aggregate over an
-- index that already exists (season, round, on_track), so this is one round
-- trip and a small result.
--
-- `security_invoker` keeps the caller's own permissions and policies: a view
-- created without it runs as its owner, which would hand out rows the reader's
-- policies would otherwise withhold. `overtakes` is reference data every member
-- may read, so nothing is exposed that was not already — but the flag is what
-- makes that a decision rather than an accident.

create or replace view overtake_counts
with (security_invoker = true)
as
  select
    season,
    round,
    overtaking_driver_number as driver_number,
    count(*)::integer as passes
  from overtakes
  where on_track
  group by season, round, overtaking_driver_number;

comment on view overtake_counts is
  'On-track passes per driver per race. Aggregated here because the rows behind '
  'it exceed what one Data API response returns, and only the totals are ever used.';

grant select on overtake_counts to authenticated, service_role;
