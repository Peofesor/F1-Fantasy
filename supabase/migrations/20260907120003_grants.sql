-- Explicit privilege grants.
--
-- The project was created with "Automatically expose new tables" disabled, so
-- new tables receive no grants to the Data API roles (anon, authenticated,
-- service_role) by default. That is deliberate -- it prevents a table that
-- forgets RLS from being silently world-readable -- but it means access has to
-- be granted here on purpose.
--
-- Note the distinction: a missing GRANT produces "permission denied for table",
-- whereas RLS denial produces an empty result or a policy violation. Row-level
-- security only filters rows within a table the role can already reach.

-- Ingestion runs as service_role and is the only writer.
grant usage on schema public to service_role;

grant all privileges on table
  raw_payloads,
  drivers,
  constructors,
  rounds,
  qualifying_results,
  race_results,
  driver_standings,
  constructor_standings,
  pit_stops,
  overtakes,
  safety_car_events
to service_role;

-- Identity columns draw from sequences, which the inserting role must be able
-- to use even though the values are generated.
grant usage, select on all sequences in schema public to service_role;

-- League members read reference data through the Data API. The row-level
-- policies from the previous migration still apply on top of these grants;
-- raw_payloads is deliberately absent, being an operational table.
grant usage on schema public to authenticated;

grant select on table
  drivers,
  constructors,
  rounds,
  qualifying_results,
  race_results,
  driver_standings,
  constructor_standings,
  pit_stops,
  overtakes,
  safety_car_events
to authenticated;

-- Future tables created by migrations should reach service_role automatically,
-- since server-side code always needs them. Grants for `authenticated` stay
-- manual so that exposing user-facing data remains a deliberate act.
alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
