-- Resolve an invite code to a league id.
--
-- Joining is a chicken-and-egg problem: the read policy on `leagues` only
-- admits members and the owner, but somebody joining by code is neither yet.
-- Rather than loosening that policy — which would expose every league's name,
-- season and settings to any signed-in user — this function looks up exactly
-- one id and nothing else, and only for an exact code match.
--
-- Codes are 8 characters from a 32-symbol alphabet, so guessing is impractical,
-- and a wrong guess reveals only that no league has that code.

create or replace function league_id_for_invite(code text)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select l.id from leagues l where l.invite_code = upper(trim(code));
$$;

revoke all on function league_id_for_invite(text) from public;
grant execute on function league_id_for_invite(text) to authenticated;
