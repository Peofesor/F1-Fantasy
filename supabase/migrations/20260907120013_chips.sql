-- Chip inventory and plays.
--
-- Purchases and plays are separate tables rather than a counter, so the ledger,
-- the inventory and the score can all be reconciled against the same history:
-- "why was this chip available?" and "why did this round score double?" are
-- both answerable from rows.

create table if not exists chip_purchases (
  id         bigint generated always as identity primary key,
  member_id  uuid not null references league_members (id) on delete cascade,
  chip_id    text not null,
  price_paid numeric(6, 2) not null check (price_paid >= 0),
  bought_at  timestamptz not null default now()
);

create index if not exists chip_purchases_by_member on chip_purchases (member_id, chip_id);

create table if not exists chip_plays (
  id        bigint generated always as identity primary key,
  member_id uuid    not null references league_members (id) on delete cascade,
  season    integer not null,
  round     integer not null,
  chip_id   text    not null,
  -- Targeted chips name the competitor they boost; untargeted ones leave both
  -- null (Autopilot picks its own target after scoring).
  target_driver_id      text references drivers (driver_id),
  target_constructor_id text references constructors (constructor_id),
  played_at timestamptz not null default now(),

  -- One play of a given chip per round. Stacking two multipliers on one race
  -- would swing far beyond what the scoring model is balanced for.
  unique (member_id, season, round, chip_id),
  foreign key (season, round) references rounds (season, round) on delete cascade,

  constraint chip_play_single_target check (
    target_driver_id is null or target_constructor_id is null
  )
);

create index if not exists chip_plays_by_round on chip_plays (season, round);

alter table chip_purchases enable row level security;
alter table chip_plays enable row level security;

-- A member sees their own inventory. Purchases stay private: knowing which
-- chips a rival holds would reveal what they are about to do.
create policy chip_purchases_read_own on chip_purchases
  for select to authenticated using (owns_member_row(member_id));

-- Plays become visible to the league once the round locks, on the same basis
-- as rosters: before the deadline they would give away a rival's plan.
create policy chip_plays_read on chip_plays
  for select to authenticated using (
    owns_member_row(member_id)
    or (is_league_member(member_league(member_id)) and is_round_locked(season, round))
  );

create policy chip_plays_insert_own on chip_plays
  for insert to authenticated
  with check (owns_member_row(member_id) and not is_round_locked(season, round));

create policy chip_plays_delete_own on chip_plays
  for delete to authenticated
  using (owns_member_row(member_id) and not is_round_locked(season, round));

grant select on chip_purchases to authenticated;
grant select, insert, delete on chip_plays to authenticated;
grant all privileges on chip_purchases, chip_plays to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Chip purchases are paid for from the cost cap, so the ledger needs the
-- reason. It was already in the enum from the original schema.
comment on table chip_purchases is
  'Extra chip uses bought from the store. The free use each season is implicit '
  'and not recorded here.';
