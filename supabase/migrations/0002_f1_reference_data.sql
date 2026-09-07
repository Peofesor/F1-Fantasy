-- Normalised F1 reference data.
--
-- Identifier convention: driver and constructor keys are jolpica's slugs
-- ("max_verstappen", "mercedes"), since jolpica is the source of record for
-- results and standings. OpenF1 keys drivers by car number instead, so its data
-- carries driver_number and is joined via race_results.driver_number.

create table if not exists drivers (
  driver_id         text primary key,
  given_name        text not null,
  family_name       text not null,
  code              text,
  permanent_number  integer,
  nationality       text not null
);

create table if not exists constructors (
  constructor_id  text primary key,
  name            text not null,
  nationality     text not null
);

create table if not exists rounds (
  season       integer not null,
  round        integer not null,
  race_name    text    not null,
  circuit_id   text    not null,
  circuit_name text    not null,
  country      text    not null,
  locality     text    not null,
  race_date    date    not null,
  race_time    time,
  -- OpenF1's session identifier, resolved by matching country and date.
  -- Null for pre-2023 rounds, which OpenF1 does not cover.
  openf1_session_key integer,
  primary key (season, round)
);

create table if not exists qualifying_results (
  season                  integer not null,
  round                   integer not null,
  driver_id               text    not null references drivers (driver_id),
  constructor_id          text    not null references constructors (constructor_id),
  position                integer not null,
  q1                      text,
  q2                      text,
  q3                      text,
  highest_session_reached text    not null check (highest_session_reached in ('Q1', 'Q2', 'Q3')),
  -- A driver can appear in qualifying having set no lap at all; the official
  -- scoring penalises this, so it must not be flattened into "no Q1 time".
  set_no_time             boolean not null default false,
  primary key (season, round, driver_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create table if not exists race_results (
  season           integer not null,
  round            integer not null,
  driver_id        text    not null references drivers (driver_id),
  constructor_id   text    not null references constructors (constructor_id),
  -- The car number actually raced: the only reliable join onto OpenF1 data.
  driver_number    integer not null,
  -- Null when the entry was not classified.
  position         integer,
  -- 0 denotes a pit-lane start, matching jolpica's convention.
  grid_position    integer not null,
  points           numeric(5, 2) not null default 0,
  status           text    not null,
  classification   text    not null check (
    classification in ('finished', 'lapped', 'retired', 'did-not-start', 'disqualified')
  ),
  fastest_lap_rank integer,
  primary key (season, round, driver_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create index if not exists race_results_number
  on race_results (season, round, driver_number);

create table if not exists driver_standings (
  season         integer not null,
  round          integer not null,
  driver_id      text    not null references drivers (driver_id),
  constructor_id text    not null references constructors (constructor_id),
  position       integer not null,
  points         numeric(6, 2) not null,
  wins           integer not null default 0,
  primary key (season, round, driver_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

-- Standings after each round drive both dynamic pricing and the top/mid tier
-- buckets, so they are stored per round rather than only for the latest one.
create index if not exists driver_standings_position
  on driver_standings (season, round, position);

create table if not exists constructor_standings (
  season         integer not null,
  round          integer not null,
  constructor_id text    not null references constructors (constructor_id),
  position       integer not null,
  points         numeric(6, 2) not null,
  wins           integer not null default 0,
  primary key (season, round, constructor_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create table if not exists pit_stops (
  id               bigint generated always as identity primary key,
  season           integer not null,
  round            integer not null,
  driver_id        text references drivers (driver_id),
  driver_number    integer,
  lap              integer not null,
  -- Only OpenF1-sourced stops carry a usable instant; jolpica reports a local
  -- time-of-day with no date.
  occurred_at      timestamptz,
  -- Pit *lane* time in seconds, not the stationary figure quoted on broadcast:
  -- neither source exposes stationary time (OpenF1's stop_duration is null
  -- across every session checked). Stops taken under a red flag legitimately
  -- run into the tens of minutes.
  pit_lane_seconds numeric(9, 3) not null,
  source           text not null check (source in ('jolpica', 'openf1')),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create index if not exists pit_stops_round on pit_stops (season, round);

create table if not exists overtakes (
  id                        bigint generated always as identity primary key,
  season                    integer not null,
  round                     integer not null,
  overtaking_driver_number  integer not null,
  overtaken_driver_number   integer not null,
  occurred_at               timestamptz not null,
  position                  integer not null,
  -- False when the position change happened while the overtaken car was in the
  -- pits. Both are stored so the settlement rule can be revised later against
  -- races already ingested.
  on_track                  boolean not null,
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create index if not exists overtakes_round_on_track
  on overtakes (season, round, on_track);

create table if not exists safety_car_events (
  id          bigint generated always as identity primary key,
  season      integer not null,
  round       integer not null,
  lap         integer not null,
  occurred_at timestamptz not null,
  message     text    not null,
  virtual     boolean not null default false,
  foreign key (season, round) references rounds (season, round) on delete cascade
);

-- Reference data is world-readable within the app: it describes public sporting
-- results, contains nothing user-specific, and every league needs it. Writes
-- remain service-role only, since ingestion is the sole writer.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'drivers', 'constructors', 'rounds', 'qualifying_results', 'race_results',
    'driver_standings', 'constructor_standings', 'pit_stops', 'overtakes',
    'safety_car_events'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format(
      'drop policy if exists %I on %I', table_name || '_read', table_name
    );
    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      table_name || '_read', table_name
    );
  end loop;
end $$;
