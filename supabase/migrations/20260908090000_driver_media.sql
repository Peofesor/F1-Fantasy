-- Driver imagery.
--
-- The roster picker shows a card per slot rather than a list of names, which
-- needs a face and a team colour to be recognisable at a glance. OpenF1
-- publishes both alongside its session driver list; jolpica has neither.
--
-- Stored on the driver rather than fetched at render time so a page load does
-- not depend on a third-party API that is rate-limited to 30 requests a minute.

alter table drivers add column if not exists headshot_url text;
alter table drivers add column if not exists team_colour text;

comment on column drivers.headshot_url is
  'Portrait from OpenF1, hosted on F1''s CDN. Null until media ingestion runs.';
comment on column drivers.team_colour is
  'Six-digit hex from OpenF1, without the leading hash. Reflects the team the '
  'driver raced for most recently, so it changes if they switch.';
