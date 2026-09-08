-- Deleting an emptied league, and a house limit on stakes.
--
-- Leaving already removes everything a member did. What it left behind was the
-- league itself: a row nobody belongs to, invisible to everyone (the read
-- policy needs membership or ownership) and impossible to clean up. The last
-- person out now takes it with them.
--
-- Only the owner can delete, which is also who the last person out always is:
-- an owner cannot leave while others remain, so they are necessarily last.

grant delete on leagues to authenticated;

create policy leagues_delete_owner on leagues
  for delete to authenticated using (owner_id = auth.uid());

/**
 * The largest stake a single bet may carry, or null for no limit beyond the
 * bank itself.
 *
 * A per-bet ceiling was removed once betting required a paid-for roster, since
 * the bank is then genuinely spare. Leagues differ on whether that is the game
 * they want, so it becomes the host's call rather than a constant.
 */
alter table leagues add column if not exists max_stake numeric(6, 2)
  check (max_stake is null or max_stake > 0);

comment on column leagues.max_stake is
  'Per-bet ceiling set by the host. Null means the bank is the only limit.';
