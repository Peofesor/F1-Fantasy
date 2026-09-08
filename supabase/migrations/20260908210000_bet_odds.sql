-- A bet records the odds it was struck at.
--
-- Prices are now per selection rather than per market, because a fixed price
-- cannot hold when the player picks who it applies to: measured across
-- 2025-26, "Reaches Q3" at 1.6 was 95% certain on Norris and "Does not finish"
-- at 4.0 came in 92% of the time on Bottas. Every market paid more than it was
-- worth to somebody.
--
-- Since a price now moves with form, it has to be stored on the bet. Settling
-- against today's price would pay out on a deal nobody agreed to, and would
-- change a bet's value after the fact.

alter table bets add column if not exists odds numeric(6, 2);

comment on column bets.odds is
  'The odds agreed when the bet was placed, before the pre-qualifying bonus. '
  'Null on bets placed before odds were per-selection; those settle at the '
  'market''s listed price.';
