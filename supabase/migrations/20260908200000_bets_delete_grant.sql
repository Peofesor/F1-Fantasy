-- Withdrawing a bet needs the privilege, not just the policy.
--
-- `bets_delete_own` was added without a matching grant, and a policy cannot
-- widen a privilege that was never given: PostgREST answered "permission denied
-- for table bets" before the policy was ever consulted. The policy still does
-- the real work of deciding *which* rows may go.

grant delete on bets to authenticated;
