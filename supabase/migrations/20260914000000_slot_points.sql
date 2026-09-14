-- What each pick on a roster actually scored.
--
-- Scoring already worked this out per slot — `scoreRoster` returns a
-- `SlotScore` for every pick — and then kept only the total, so the round card
-- could say a squad scored 65 but not which of the ten picks earned it. The
-- comparison the card exists for is slot against slot, and without this it
-- could only compare the sum.
--
-- On `roster_slots` rather than in a table of its own because that is already
-- the grain: one row per pick per member per round. It also already carries the
-- read policy that reveals a rival's picks only once the round has locked, and
-- a pick's score should be exactly as visible as the pick itself.
--
-- Nullable, and null means "not scored yet" rather than zero — a round still to
-- come, or one whose results have not been ingested. A pick that genuinely
-- scored nothing stores 0, which is a different claim.
--
-- The backmarker is the exception worth knowing about: it pays cost cap instead
-- of points, so it stores the 0 it contributes to the fantasy total, not the
-- budget it generated.
alter table roster_slots
  add column if not exists points numeric(7, 2);

comment on column roster_slots.points is
  'Fantasy points this pick scored for the round, boosts included. Null until the round is scored.';
