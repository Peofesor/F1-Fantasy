-- Allow a drawn duel to split the point.
--
-- duel_points was constrained to integers 0 or 1, which forces a tied week to
-- be recorded as a loss for both members. Splitting it (win 1, draw 0.5, loss
-- 0) is the standard convention and keeps a tied week meaningful in the
-- standings rather than discarding it.

alter table round_scores
  drop constraint if exists round_scores_duel_points_check;

alter table round_scores
  alter column duel_points type numeric(3, 1) using duel_points::numeric(3, 1);

alter table round_scores
  add constraint round_scores_duel_points_check
  check (duel_points in (0, 0.5, 1));

comment on column round_scores.duel_points is
  'Duel mode: 1 for a win, 0.5 for a draw, 0 for a loss. Always 0 in '
  'free-for-all leagues, which rank on cumulative points instead.';

-- Scoring writes these, and scoring runs server-side only.
grant all privileges on round_scores to service_role;
