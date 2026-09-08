-- A round with no fixture is not a defeat.
--
-- duel_points was `not null default 0`, so the column had no way to say "there
-- was no match this round" — and the standings read every 0 as a loss. A league
-- whose fixtures start at round 14 showed all four members on 0-0-13: thirteen
-- defeats each, in a format where one member losing means another won. Four
-- players cannot all lose the same week.
--
-- Nullable fixes it at the level the mistake was made. A duel that was played
-- and lost is 0; a round with no duel is absent, which is what it is.
alter table round_scores alter column duel_points drop not null;
alter table round_scores alter column duel_points drop default;

-- The check constraint has to admit null explicitly, or every no-duel row is
-- rejected on write.
alter table round_scores
  drop constraint if exists round_scores_duel_points_check;

alter table round_scores
  add constraint round_scores_duel_points_check
  check (duel_points is null or duel_points in (0, 0.5, 1));

-- Existing rows: a 0 is only a real defeat if a fixture that round actually
-- involved that member. Everything else was the default standing in for
-- "nothing happened", and becomes null.
--
-- Rows on 0.5 or 1 are left alone — those can only have come from a resolved
-- duel, so they need no fixture lookup.
update round_scores as rs
set duel_points = null
where rs.duel_points = 0
  and not exists (
    select 1
    from duel_fixtures as f
    where f.season = rs.season
      and f.round = rs.round
      and rs.member_id in (f.home_member_id, f.away_member_id)
  );
