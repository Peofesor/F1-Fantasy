-- Final Fix bookkeeping.
--
-- The chip permits one slot change after qualifying has locked the round. The
-- chip_plays row records that it was played, but not that it has been spent —
-- without that, a member could play it once and then keep editing a locked
-- roster indefinitely, one slot at a time.

alter table rosters
  add column if not exists final_fix_used boolean not null default false;

comment on column rosters.final_fix_used is
  'True once a Final Fix edit has been made against this locked roster. One '
  'change is permitted per play of the chip.';
