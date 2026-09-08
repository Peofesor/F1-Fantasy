-- Which weekends have a sprint, known before the weekend runs.
--
-- The sprint markets were offered on every round. Madrid has no sprint, so a
-- bet placed there could only ever void — the settlement code voids rather than
-- losing it, which is correct but arrives a week too late to be any use. The
-- player has had a market on their slip all weekend that was never going to
-- pay.
--
-- Settlement could already tell, by finding no sprint results. That is only
-- knowable afterwards, which is precisely the wrong time. jolpica publishes the
-- sprint session in the season schedule, so the calendar can carry it.
--
-- Null rather than false as the default: unknown is not the same as "no
-- sprint", and a round ingested before this column existed genuinely does not
-- know. The markets are hidden unless it is explicitly true, so the unknown
-- case fails closed.
alter table rounds add column if not exists has_sprint boolean;

comment on column rounds.has_sprint is
  'True when the schedule lists a sprint session. Null when not yet ingested.';
