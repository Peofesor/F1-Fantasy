-- Raw upstream payload storage.
--
-- Every response from jolpica and OpenF1 is kept verbatim alongside the
-- normalised tables. This exists because the game's scoring and pricing rules
-- are explicitly unfinished (see docs/game-design-spec.md §12): during
-- balancing we need to re-run "what would scores have been under this rule?"
-- against races already ingested, without re-fetching. Re-fetching is not a
-- reliable fallback -- jolpica is volunteer-run with a 500 req/hour budget, and
-- OpenF1 only holds data from 2023 onward.

create table if not exists raw_payloads (
  id              bigint generated always as identity primary key,
  source          text        not null check (source in ('jolpica', 'openf1')),
  endpoint        text        not null,
  -- Query parameters as sent, so a payload can be traced back to its request.
  params          jsonb       not null default '{}'::jsonb,
  payload         jsonb       not null,
  fetched_at      timestamptz not null default now(),
  -- Lets a re-fetch detect that nothing changed without diffing the payload.
  content_hash    text        not null
);

-- Re-ingesting a round is expected (results get amended after stewards'
-- decisions), so the same endpoint legitimately appears many times. Only an
-- identical payload for an identical request is redundant.
create unique index if not exists raw_payloads_dedupe
  on raw_payloads (source, endpoint, params, content_hash);

create index if not exists raw_payloads_source_endpoint
  on raw_payloads (source, endpoint, fetched_at desc);

alter table raw_payloads enable row level security;

-- Raw payloads are an operational concern, not something league members read.
-- No policies are defined, so only the service role (which bypasses RLS) can
-- touch this table.
