-- One captain per driver bracket, and no constructor multiplier.
--
-- The weekly 2x was one driver plus one constructor. The driver half had a
-- dominant answer -- your most expensive top-bracket driver is almost always
-- the highest scorer, so the pick made itself. Splitting it into a captain per
-- bracket makes the midfield choice a real one, because a mid captain competes
-- only against your other two mid drivers.
--
-- The constructor multiplier is dropped rather than moved. A constructor
-- already scores its two drivers combined, so it carries roughly double a
-- driver slot's swing before any multiplier; doubling that again made one slot
-- decide the round.

alter table rosters
  add column if not exists top_captain_id text references drivers (driver_id),
  add column if not exists mid_captain_id text references drivers (driver_id);

comment on column rosters.top_captain_id is
  'Top-bracket driver nominated to score double this round. Must be one of the '
  'roster''s three top slots.';
comment on column rosters.mid_captain_id is
  'Mid-bracket driver nominated to score double this round. Must be one of the '
  'roster''s three mid slots.';

-- Carry an existing nomination into whichever bracket its driver was picked in,
-- so nobody loses a captain they had already chosen.
update rosters r
set top_captain_id = r.turbo_driver_id
where r.turbo_driver_id is not null
  and r.top_captain_id is null
  and exists (
    select 1 from roster_slots s
    where s.roster_id = r.id
      and s.slot_type = 'driver_top'
      and s.driver_id = r.turbo_driver_id
  );

update rosters r
set mid_captain_id = r.turbo_driver_id
where r.turbo_driver_id is not null
  and r.mid_captain_id is null
  and exists (
    select 1 from roster_slots s
    where s.roster_id = r.id
      and s.slot_type = 'driver_mid'
      and s.driver_id = r.turbo_driver_id
  );

alter table rosters
  drop column if exists turbo_driver_id,
  drop column if exists boost_constructor_id;
