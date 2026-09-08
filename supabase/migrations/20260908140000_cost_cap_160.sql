-- Raise the starting cost cap to 160, and credit leagues already running.
--
-- 145 (the previous migration) was derived from the wrong baseline. It assumed
-- the 130 cap had been calibrated to sit ~80% above the cheapest legal roster,
-- but that ratio was measured at 2026 round 14 under the *new* prices; the
-- original calibration was done at round 13, where the cheapest roster was 88.6
-- against a 130 cap — 68%, not 80%. Scaling from a figure the design never used
-- produced a cap that was too tight, which is what playing the game showed.
--
-- Costed against real prices at 2026 round 14:
--
--   archetype                cost    130   145   160
--   cheapest legal          116.9    yes   yes   yes
--   1 premium top driver    122.7    yes   yes   yes
--   2 premium top drivers   132.1     no   yes   yes
--   2 premium + best team   137.2     no   yes   yes
--   3 premium top drivers   139.9     no   yes   yes
--   balanced (median all)   143.6     no   yes   yes
--   dearest legal           185.9     no    no    no
--
-- At 130 only the cheapest roster and a single premium driver are reachable —
-- a median team does not fit at all, which is the "budget admits exactly one
-- roster, so it is a forced selection not a choice" failure the cap was raised
-- from 100 to avoid in the first place.
--
-- 145 technically clears the balanced roster, but by 1.4. Affording exactly one
-- balanced team is the same failure wearing a larger number. At 160 every
-- archetype above is comfortably reachable and buying every premium pick is
-- still 26 out of reach, so giving something up remains mandatory.

alter table cost_cap_entries drop constraint if exists cost_cap_entries_reason_check;

alter table cost_cap_entries add constraint cost_cap_entries_reason_check check (
  reason in (
    'initial',
    'driver_purchase',
    'driver_sale',
    'constructor_purchase',
    'constructor_sale',
    'price_change',
    'transfer_fee',
    'chip_purchase',
    'bet_stake',
    'bet_payout',
    'backmarker_payout',
    -- A balance correction applied to a league already in progress. Recorded
    -- as its own entry rather than by rewriting the opening one, so the ledger
    -- still explains how a member's balance got where it is.
    'cap_adjustment'
  )
);

alter table leagues alter column starting_cost_cap set default 160.00;

comment on column leagues.starting_cost_cap is
  'Opening cost cap for every member. Default 160 leaves every roster archetype '
  'except an all-premium team (~186) comfortably reachable above the cheapest '
  'legal roster (~117).';

-- Credit members of leagues that opened below the new cap, so a season already
-- under way gets the same spending power as one starting today. Guarded on the
-- reason so a re-run cannot credit anyone twice.
with previous as (
  select id, season, starting_cost_cap
  from leagues
  where starting_cost_cap < 160.00
),
raised as (
  update leagues set starting_cost_cap = 160.00 where starting_cost_cap < 160.00
)
insert into cost_cap_entries (member_id, season, round, amount, reason, note)
select
  m.id,
  p.season,
  (select min(r.round) from rounds r where r.season = p.season),
  160.00 - p.starting_cost_cap,
  'cap_adjustment',
  'Cost cap raised from ' || p.starting_cost_cap || ' to 160'
from previous p
join league_members m on m.league_id = p.id
where not exists (
  select 1 from cost_cap_entries e
  where e.member_id = m.id and e.reason = 'cap_adjustment'
);
