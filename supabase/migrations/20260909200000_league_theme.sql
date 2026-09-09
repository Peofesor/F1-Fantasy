-- A colour scheme per league, chosen by the host.
--
-- Cosmetic, so unlike mode and budget it can be changed at any time: it alters
-- nothing that has been scored. Null means the league has never chosen, which
-- reads as the default rather than as an error.
--
-- Stored as the scheme's id rather than the colours themselves. The palettes
-- live in src/lib/f1/themes.ts, where they can be adjusted for contrast without
-- a migration and without every league that picked one being stuck with the
-- version that was current the day they chose.
alter table leagues add column if not exists theme text;

comment on column leagues.theme is
  'Colour scheme id from src/lib/f1/themes.ts. Null uses the default.';
