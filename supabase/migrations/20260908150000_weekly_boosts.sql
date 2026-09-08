-- Turbo Driver and Konstruktor Boost stop being chips.
--
-- They were the only two chips that were unlimited and free, which meant
-- "playing" them was never a decision — there was no reason not to, every
-- single round. A choice with one correct answer is not a chip, it is a step
-- you can forget to take, and forgetting cost you points for no reason.
--
-- They are now part of the roster: each week you nominate one driver to score
-- double and one constructor to score double, alongside picking the team. The
-- doubling then applies automatically, and the nomination carries forward like
-- everything else on the roster.
--
-- Kept on `rosters` rather than as a flag on `roster_slots` because exactly one
-- of each may exist, which a column enforces for free and a flag does not.

alter table rosters
  add column if not exists turbo_driver_id text references drivers (driver_id),
  add column if not exists boost_constructor_id text references constructors (constructor_id);

comment on column rosters.turbo_driver_id is
  'Driver nominated to score double this round. Must be one of the roster''s '
  'top or mid slot drivers — the backmarker scores cost cap, not points.';
comment on column rosters.boost_constructor_id is
  'Constructor nominated to score double this round. Must be one of the two '
  'normally-scored teams; the reverse-scored slot is excluded.';

-- Carry any nomination already made as a chip play onto the roster it applied
-- to, so no member loses a boost they had chosen for a round not yet scored.
update rosters r
set turbo_driver_id = p.target_driver_id
from chip_plays p
where p.member_id = r.member_id
  and p.season = r.season
  and p.round = r.round
  and p.chip_id = 'turbo_driver'
  and p.target_driver_id is not null
  and r.turbo_driver_id is null;

update rosters r
set boost_constructor_id = p.target_constructor_id
from chip_plays p
where p.member_id = r.member_id
  and p.season = r.season
  and p.round = r.round
  and p.chip_id = 'konstruktor_boost'
  and p.target_constructor_id is not null
  and r.boost_constructor_id is null;

-- Both were free and unlimited, so there is nothing to refund; the plays are
-- now represented on the roster and would otherwise double-apply.
delete from chip_plays where chip_id in ('turbo_driver', 'konstruktor_boost');
delete from chip_purchases where chip_id in ('turbo_driver', 'konstruktor_boost');
