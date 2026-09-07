-- Track transfers used per round.
--
-- The free allowance is per round, not per save. Without a counter, saving a
-- roster twice would hand out the allowance twice: each save would see only its
-- own diff and conclude no fee was due.
--
-- Stored on the roster rather than derived from the ledger because purchase
-- entries cannot distinguish a first roster fill (not a transfer) from a later
-- edit (which is one).

alter table rosters
  add column if not exists transfers_used integer not null default 0
  check (transfers_used >= 0);

comment on column rosters.transfers_used is
  'Transfers made for this round so far. The free allowance is consumed across '
  'separate saves, not reset by each one.';
