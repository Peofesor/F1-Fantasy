-- Betting.
--
-- Stakes are charged to the cost cap when the bet is placed, and settlement
-- credits winnings back. Both movements go through the ledger, so the balance
-- always explains itself.

create table if not exists bets (
  id        bigint generated always as identity primary key,
  member_id uuid    not null references league_members (id) on delete cascade,
  season    integer not null,
  round     integer not null,
  market_id text    not null,
  -- A driver id, constructor id, nationality, or 'yes'/'no' depending on the
  -- market. Kept as free text because the referent differs per market.
  selection text    not null,
  stake     numeric(8, 2) not null check (stake > 0),
  timing    text    not null check (timing in ('pre_qualifying', 'pre_race')),
  -- Null until the round is settled.
  outcome   text check (outcome in ('won', 'lost', 'void')),
  returned  numeric(10, 2),
  placed_at timestamptz not null default now(),
  settled_at timestamptz,

  foreign key (season, round) references rounds (season, round) on delete cascade,

  -- One bet per market per round. Without this a member could hedge every
  -- driver in a market and profit regardless of the result.
  unique (member_id, season, round, market_id)
);

create index if not exists bets_by_round on bets (season, round) where outcome is null;
create index if not exists bets_by_member on bets (member_id, season);

alter table bets enable row level security;

-- Bets stay private until the round locks, then become visible to the league.
-- Before the deadline they reveal what a rival expects to happen.
create policy bets_read on bets
  for select to authenticated using (
    owns_member_row(member_id)
    or (is_league_member(member_league(member_id)) and is_round_locked(season, round))
  );

-- Placing a bet is only possible before the round locks. Pre-qualifying bets
-- pay more precisely because they are placed with less information, so allowing
-- a late bet at those odds would be straightforwardly exploitable.
create policy bets_insert_own on bets
  for insert to authenticated
  with check (
    owns_member_row(member_id)
    and not is_round_locked(season, round)
    and outcome is null
  );

-- No update or delete policy: a placed bet cannot be withdrawn or edited, which
-- is the whole point of a bet. Settlement runs as the service role.
grant select, insert on bets to authenticated;
grant all privileges on bets to service_role;
grant usage, select on all sequences in schema public to service_role;

-- The ledger already carries bet_stake and bet_payout reasons from the original
-- schema, so no enum change is needed.
