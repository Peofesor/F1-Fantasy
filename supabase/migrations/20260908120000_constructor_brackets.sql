-- Constructor brackets.
--
-- The roster reads as three tiers: top, mid, and the reverse-scored pick. The
-- two normal constructor slots were previously interchangeable and unrestricted,
-- so a roster could hold the two best teams — which made the "mid" half of the
-- roster meaningless on the constructor side while the driver side enforced it.
--
-- Splitting the slot type rather than relying on slot_index keeps the meaning in
-- the data. "constructor at index 1 means the top one" is exactly the sort of
-- implicit convention that silently breaks when something iterates in a
-- different order.

alter table roster_slots drop constraint if exists roster_slots_slot_type_check;

alter table roster_slots add constraint roster_slots_slot_type_check check (
  slot_type in (
    'driver_top',
    'driver_mid',
    'driver_backmarker',
    'constructor_top',
    'constructor_mid',
    'constructor_reverse'
  )
);

-- Existing rosters: index 1 becomes the top slot, index 2 the mid one. That
-- matches the order they were written in, and nothing has been scored yet.
update roster_slots set slot_type = 'constructor_top'
  where slot_type = 'constructor' and slot_index = 1;
update roster_slots set slot_type = 'constructor_mid', slot_index = 1
  where slot_type = 'constructor' and slot_index = 2;

alter table roster_slots drop constraint if exists roster_slot_index_within_type;

-- Every slot type now holds at most three, and only the driver brackets use
-- more than one index.
alter table roster_slots add constraint roster_slot_index_within_type check (
  case
    when slot_type in ('driver_top', 'driver_mid') then slot_index between 1 and 3
    else slot_index = 1
  end
);

alter table roster_slots drop constraint if exists roster_slot_occupant_matches_type;

alter table roster_slots add constraint roster_slot_occupant_matches_type check (
  case
    when slot_type like 'driver%' then driver_id is not null and constructor_id is null
    else constructor_id is not null and driver_id is null
  end
);
