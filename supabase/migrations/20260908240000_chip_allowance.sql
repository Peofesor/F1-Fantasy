-- Chip allowances, set per league and granted per half-season.
--
-- A chip used to carry one free use for the whole season, fixed in code. Two
-- things were wrong with that. It was not the host's to decide, and a season's
-- worth could be spent in the opening months, leaving the run-in with nothing
-- to play — the opposite of a decision that lasts.
--
-- The allowance now resets at the summer break, which is where the sport draws
-- its own line, and the host chooses the number. Stored as JSON because it is a
-- small map keyed by chip id that the application already owns the shape of;
-- a column per chip would need a migration every time the chip list changes.

alter table leagues add column if not exists chip_allowance jsonb not null default '{}'::jsonb;

comment on column leagues.chip_allowance is
  'Free uses of each chip granted per half-season, keyed by chip id. A missing '
  'key means the default of one. Bought uses are on top of this and do not '
  'expire at the break.';
