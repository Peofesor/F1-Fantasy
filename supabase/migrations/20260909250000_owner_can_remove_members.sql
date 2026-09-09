-- The league owner can remove a member.
--
-- Until now the only way out was walking out yourself, which leaves a host with
-- no answer to someone who joined the wrong league, signed up twice, or stopped
-- playing in March and is still occupying a fixture slot every other week.
--
-- The owner is excluded from their own reach on purpose. Removing themselves
-- through this path would skip the rules that leaving enforces — an owner may
-- not abandon a league that still has members, and the last one out deletes it
-- — and would leave a league running with an owner_id pointing at nobody.
--
-- Everything the member did goes with them: every gameplay table hangs off
-- league_members with on delete cascade, so rosters, ledger, scores, bets,
-- chips and fixtures are removed too. There is no undo, which is why the
-- control that calls this names what will be lost before it does it.
drop policy if exists league_members_leave on league_members;

create policy league_members_leave on league_members
  for delete to authenticated using (
    profile_id = auth.uid()
    or (owns_league(league_id) and profile_id <> auth.uid())
  );
