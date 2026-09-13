-- Which armband a SuperDriver play moved.
--
-- Playing SuperDriver on the driver who already wears the 2x spends the armband
-- on a slot that is boosted anyway, so the play moves it to another driver in
-- the same bracket. Taking the chip back could not undo that: nothing recorded
-- where the armband had been, so the 2x silently stayed where the chip had put
-- it, on a round where the chip no longer existed.
--
-- Nullable, and null on every play that displaced nothing — most of them. It is
-- a record of one specific consequence, not a general history.
alter table chip_plays
  add column if not exists displaced_captain_id text;

comment on column chip_plays.displaced_captain_id is
  'Driver who lost the 2x when this play moved it, so taking the chip back can offer it back.';
