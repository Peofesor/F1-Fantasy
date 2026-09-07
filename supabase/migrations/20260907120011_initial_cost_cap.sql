-- Opening cost cap, granted automatically on joining.
--
-- Done as a trigger rather than an application insert for two reasons. It is
-- atomic with the membership row, so a member can never exist without a
-- balance; and the amount is read from the league rather than supplied by the
-- caller, so it cannot be inflated. `cost_cap_entries` deliberately grants no
-- INSERT to `authenticated` — a member who could write their own ledger could
-- simply credit themselves.

create or replace function grant_initial_cost_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opening numeric(10, 2);
  first_round integer;
begin
  select l.starting_cost_cap into opening
  from leagues l where l.id = new.league_id;

  -- Ledger entries reference a real round. The season's first ingested round
  -- is used so the opening balance sorts before everything that follows.
  select min(r.round) into first_round
  from rounds r
  join leagues l on l.id = new.league_id
  where r.season = l.season;

  if opening is not null and first_round is not null then
    insert into cost_cap_entries (member_id, season, round, amount, reason, note)
    select new.id, l.season, first_round, opening, 'initial', 'Opening cost cap'
    from leagues l where l.id = new.league_id;
  end if;

  return new;
end;
$$;

drop trigger if exists league_members_grant_initial_cap on league_members;

create trigger league_members_grant_initial_cap
  after insert on league_members
  for each row
  execute function grant_initial_cost_cap();
