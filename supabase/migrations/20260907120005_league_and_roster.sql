-- League, roster and cost-cap model.
--
-- Design notes worth stating up front:
--
-- * Rosters are snapshotted per round rather than being one mutable row. Scoring
--   a past race needs the roster as it stood when that round locked, and this
--   project has already had to recompute history more than once. A mutable
--   roster would make that impossible.
-- * Cost cap is an append-only ledger, not a running balance column. The balance
--   is derived by summing entries. This is slower to read but answers "why is my
--   cap this number?", which matters when it moves for six different reasons
--   (purchases, sales, price drift, bet stakes and payouts, chip purchases,
--   transfer fees, backmarker payouts).
-- * Rosters become visible to other league members only once the round locks, so
--   nobody can copy an opponent's picks before the deadline.

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null check (length(trim(display_name)) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leagues
-- ---------------------------------------------------------------------------

create table if not exists leagues (
  id       uuid primary key default gen_random_uuid(),
  name     text    not null check (length(trim(name)) between 1 and 60),
  season   integer not null,
  -- Chosen at creation and locked for the whole season: the two modes score
  -- differently, so switching mid-season would invalidate standings.
  mode     text    not null check (mode in ('duel', 'free_for_all')),
  owner_id uuid    not null references profiles (id) on delete restrict,
  -- Shared with friends to join. Unique so a code identifies one league.
  invite_code text not null unique check (length(invite_code) between 6 and 12),
  -- Every member starts here; the ledger moves them apart from round one.
  starting_cost_cap numeric(10, 2) not null default 100.00,
  -- Set when the season's first round locks. Mode and membership freeze then.
  locked_at  timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists league_members (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique (league_id, profile_id)
);

create index if not exists league_members_by_profile on league_members (profile_id);

-- ---------------------------------------------------------------------------
-- Pricing
-- ---------------------------------------------------------------------------

-- Prices are per round because they move with form (spec §5). Note that no
-- upstream source publishes F1 Fantasy prices -- neither jolpica nor OpenF1 --
-- so this table has to be populated by our own model or by hand.
create table if not exists driver_prices (
  season    integer not null,
  round     integer not null,
  driver_id text    not null references drivers (driver_id),
  price     numeric(6, 2) not null check (price >= 0),
  primary key (season, round, driver_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create table if not exists constructor_prices (
  season         integer not null,
  round          integer not null,
  constructor_id text    not null references constructors (constructor_id),
  price          numeric(6, 2) not null check (price >= 0),
  primary key (season, round, constructor_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Rosters
-- ---------------------------------------------------------------------------

create table if not exists rosters (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid    not null references league_members (id) on delete cascade,
  season    integer not null,
  round     integer not null,
  -- Null while still editable. Set at the deadline, after which the roster is
  -- frozen and becomes visible to other league members. The Final Fix chip is
  -- the only way to change a slot after this point.
  locked_at  timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, season, round),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

-- Slot shape enforced here rather than in application code, so a malformed
-- roster cannot reach the database by any path.
create table if not exists roster_slots (
  roster_id uuid not null references rosters (id) on delete cascade,
  slot_type text not null check (
    slot_type in (
      'driver_top',            -- 3 of these, from the top-8 bracket
      'driver_mid',            -- 3 of these, from everyone else
      'driver_backmarker',     -- 1, unrestricted; pays cost cap, scores no points
      'constructor',           -- 2, scored normally
      'constructor_reverse'    -- 1, scored on the team's per-race placing
    )
  ),
  slot_index integer not null check (slot_index between 1 and 3),
  driver_id      text references drivers (driver_id),
  constructor_id text references constructors (constructor_id),
  -- What the pick cost when it was made. Kept because prices move: the ledger
  -- needs the original outlay to value a later sale.
  price_paid numeric(6, 2) not null check (price_paid >= 0),
  primary key (roster_id, slot_type, slot_index),

  -- A driver slot holds a driver; a constructor slot holds a constructor.
  constraint roster_slot_occupant_matches_type check (
    case
      when slot_type like 'driver%' then driver_id is not null and constructor_id is null
      else constructor_id is not null and driver_id is null
    end
  ),
  -- Only the three driver_top / driver_mid slots use index 2 and 3.
  constraint roster_slot_index_within_type check (
    case
      when slot_type in ('driver_top', 'driver_mid') then slot_index between 1 and 3
      when slot_type = 'constructor' then slot_index between 1 and 2
      else slot_index = 1
    end
  )
);

-- The same driver must not fill two slots on one roster.
create unique index if not exists roster_slots_unique_driver
  on roster_slots (roster_id, driver_id)
  where driver_id is not null;

create unique index if not exists roster_slots_unique_constructor
  on roster_slots (roster_id, constructor_id)
  where constructor_id is not null;

-- ---------------------------------------------------------------------------
-- Cost cap ledger
-- ---------------------------------------------------------------------------

create table if not exists cost_cap_entries (
  id        bigint generated always as identity primary key,
  member_id uuid    not null references league_members (id) on delete cascade,
  season    integer not null,
  round     integer not null,
  -- Signed: negative spends, positive credits.
  amount numeric(10, 2) not null,
  reason text not null check (
    reason in (
      'initial',            -- opening balance when joining
      'driver_purchase',
      'driver_sale',
      'constructor_purchase',
      'constructor_sale',
      'price_change',       -- roster value drift, up or down
      'transfer_fee',       -- changes beyond the free weekly allowance
      'chip_purchase',
      'bet_stake',
      'bet_payout',
      'backmarker_payout'   -- the backmarker slot pays cap, not points
    )
  ),
  note       text,
  created_at timestamptz not null default now(),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create index if not exists cost_cap_entries_by_member
  on cost_cap_entries (member_id, season, round);

-- ---------------------------------------------------------------------------
-- Duel fixtures and scoring
-- ---------------------------------------------------------------------------

-- Generated once at season start (spec §3): a fixed schedule, not redrawn
-- weekly. Free-for-all leagues have no rows here.
create table if not exists duel_fixtures (
  league_id       uuid    not null references leagues (id) on delete cascade,
  season          integer not null,
  round           integer not null,
  home_member_id  uuid    not null references league_members (id) on delete cascade,
  away_member_id  uuid    not null references league_members (id) on delete cascade,
  primary key (league_id, season, round, home_member_id),
  constraint duel_distinct_members check (home_member_id <> away_member_id)
);

create table if not exists round_scores (
  member_id uuid    not null references league_members (id) on delete cascade,
  season    integer not null,
  round     integer not null,
  -- Fantasy points from the roster this round.
  points numeric(8, 2) not null default 0,
  -- Duel mode only: 1 for winning the head-to-head, 0 otherwise.
  duel_points integer not null default 0 check (duel_points in (0, 1)),
  computed_at timestamptz not null default now(),
  primary key (member_id, season, round),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- Membership is checked from inside a SECURITY DEFINER function so that the
-- policies on league_members do not have to query league_members, which would
-- recurse.
create or replace function is_league_member(target_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from league_members m
    where m.league_id = target_league
      and m.profile_id = auth.uid()
  );
$$;

create or replace function owns_member_row(target_member uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from league_members m
    where m.id = target_member
      and m.profile_id = auth.uid()
  );
$$;

create or replace function member_league(target_member uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select m.league_id from league_members m where m.id = target_member;
$$;

alter table profiles          enable row level security;
alter table leagues           enable row level security;
alter table league_members    enable row level security;
alter table driver_prices     enable row level security;
alter table constructor_prices enable row level security;
alter table rosters           enable row level security;
alter table roster_slots      enable row level security;
alter table cost_cap_entries  enable row level security;
alter table duel_fixtures     enable row level security;
alter table round_scores      enable row level security;

-- Profiles: everyone signed in can read display names (needed to show
-- opponents); you may only write your own.
create policy profiles_read on profiles
  for select to authenticated using (true);
create policy profiles_write_own on profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Leagues: readable by members, or by anyone holding the invite code (join
-- flow needs to resolve a code before membership exists). Only the owner edits.
create policy leagues_read on leagues
  for select to authenticated using (is_league_member(id) or owner_id = auth.uid());
create policy leagues_insert on leagues
  for insert to authenticated with check (owner_id = auth.uid());
create policy leagues_update_owner on leagues
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Membership: you can see everyone in leagues you belong to, and add or remove
-- only yourself.
create policy league_members_read on league_members
  for select to authenticated using (is_league_member(league_id));
create policy league_members_join on league_members
  for insert to authenticated with check (profile_id = auth.uid());
create policy league_members_leave on league_members
  for delete to authenticated using (profile_id = auth.uid());

-- Prices are public reference data, like the F1 results they derive from.
create policy driver_prices_read on driver_prices
  for select to authenticated using (true);
create policy constructor_prices_read on constructor_prices
  for select to authenticated using (true);

-- Rosters: always your own; other members' only once the round has locked, so
-- picks cannot be copied before the deadline.
create policy rosters_read on rosters
  for select to authenticated using (
    owns_member_row(member_id)
    or (locked_at is not null and is_league_member(member_league(member_id)))
  );
create policy rosters_write_own on rosters
  for all to authenticated
  using (owns_member_row(member_id))
  with check (owns_member_row(member_id));

create policy roster_slots_read on roster_slots
  for select to authenticated using (
    exists (
      select 1 from rosters r
      where r.id = roster_id
        and (
          owns_member_row(r.member_id)
          or (r.locked_at is not null and is_league_member(member_league(r.member_id)))
        )
    )
  );
create policy roster_slots_write_own on roster_slots
  for all to authenticated
  using (exists (select 1 from rosters r where r.id = roster_id and owns_member_row(r.member_id)))
  with check (exists (select 1 from rosters r where r.id = roster_id and owns_member_row(r.member_id)));

-- The ledger is private: a rival knowing your spare cap would reveal your
-- betting capacity. Writes come from the server only.
create policy cost_cap_entries_read_own on cost_cap_entries
  for select to authenticated using (owns_member_row(member_id));

-- Fixtures and scores are league-visible; both are written by the server.
create policy duel_fixtures_read on duel_fixtures
  for select to authenticated using (is_league_member(league_id));
create policy round_scores_read on round_scores
  for select to authenticated using (is_league_member(member_league(member_id)));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- "Automatically expose new tables" is off for this project, so access is
-- granted explicitly. Row-level security above narrows what these reach.

grant select, insert, update, delete on
  profiles, league_members, rosters, roster_slots
to authenticated;

grant select on
  leagues, driver_prices, constructor_prices, cost_cap_entries,
  duel_fixtures, round_scores
to authenticated;

grant insert, update on leagues to authenticated;

grant all privileges on
  profiles, leagues, league_members, driver_prices, constructor_prices,
  rosters, roster_slots, cost_cap_entries, duel_fixtures, round_scores
to service_role;

grant usage, select on all sequences in schema public to service_role;
