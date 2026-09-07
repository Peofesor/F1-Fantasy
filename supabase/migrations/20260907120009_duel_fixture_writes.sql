-- Let a league owner generate the duel schedule from the app.
--
-- Fixtures were previously service-role only, which meant the schedule could
-- only be created by a script. Generating it is a normal owner action, and the
-- circle-method algorithm lives in TypeScript where it is unit tested, so the
-- write needs to be reachable from a Server Action rather than reimplemented in
-- PL/pgSQL.
--
-- Writes are restricted to the league owner. Membership alone is not enough: a
-- member regenerating the schedule mid-season could reshuffle who they face.

create or replace function owns_league(target_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from leagues l
    where l.id = target_league and l.owner_id = auth.uid()
  );
$$;

grant execute on function owns_league(uuid) to authenticated;

create policy duel_fixtures_insert_owner on duel_fixtures
  for insert to authenticated
  with check (owns_league(league_id));

create policy duel_fixtures_delete_owner on duel_fixtures
  for delete to authenticated
  using (owns_league(league_id));

grant insert, delete on duel_fixtures to authenticated;
