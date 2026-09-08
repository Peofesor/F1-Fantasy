-- Sprint races.
--
-- Six of the 2026 rounds carry a sprint, and until now they scored nothing at
-- all — a third of the season's sessions were invisible to the game.
--
-- Kept in its own table rather than a session column on race_results because
-- the two score from different tables and a sprint has no bearing on the race
-- grid delta. Separating them keeps every existing query correct without a
-- filter, which a shared table would have silently broken.

create table if not exists sprint_results (
  season         integer not null,
  round          integer not null,
  driver_id      text    not null references drivers (driver_id),
  constructor_id text    not null references constructors (constructor_id),
  driver_number  integer not null,
  position       integer,
  grid_position  integer not null,
  points         numeric(5, 2) not null default 0,
  status         text    not null,
  classification text    not null check (
    classification in ('finished', 'lapped', 'retired', 'did-not-start', 'disqualified')
  ),
  fastest_lap_rank integer,
  primary key (season, round, driver_id),
  foreign key (season, round) references rounds (season, round) on delete cascade
);

create index if not exists sprint_results_round on sprint_results (season, round);

alter table sprint_results enable row level security;

create policy sprint_results_read on sprint_results
  for select to authenticated using (true);

grant select on sprint_results to authenticated;
grant all privileges on sprint_results to service_role;
