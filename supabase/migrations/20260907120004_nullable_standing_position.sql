-- Championship position must be nullable.
--
-- jolpica omits `position` entirely for anyone on zero points, marking them
-- with positionText "-" instead: they are unranked, not joint-last. That is the
-- entire field before the season's first points are scored, so a NOT NULL
-- constraint here rejects every round-one standings row.
--
-- Consequence for the game: standings cannot order drivers at round one, so
-- tier assignment at the start of a season has to seed from the previous
-- season's final standings rather than the current one.

alter table driver_standings alter column position drop not null;
alter table constructor_standings alter column position drop not null;

comment on column driver_standings.position is
  'Championship position, or null when unranked (zero points).';
comment on column constructor_standings.position is
  'Championship position, or null when unranked (zero points).';
