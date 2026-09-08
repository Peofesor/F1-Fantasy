-- A league can see each other's cost cap history, but not the live figure.
--
-- The stats card plots cost cap against points over the season, which needs
-- every member's ledger. The existing policy allowed only your own, on the
-- grounds that a rival's spare cap reveals what they can still bet.
--
-- That reasoning holds for the *current* round and not for a finished one. Once
-- a round has locked, its entries describe money already committed: what was
-- paid for the team, what the backmarker returned, which bets settled. Keeping
-- that hidden protects nothing and makes the season unreadable.
--
-- So: your own ledger in full, and everyone else's up to the last locked round.

drop policy if exists cost_cap_entries_read_own on cost_cap_entries;

create policy cost_cap_entries_read on cost_cap_entries
  for select to authenticated using (
    owns_member_row(member_id)
    or (
      is_league_member(member_league(member_id))
      and is_round_locked(season, round)
    )
  );
