-- The blind-bet premium moves into the price.
--
-- Every bet is now placed before qualifying, so every bet carried the 1.1x
-- added at settlement. A multiplier that always applies is not a bonus, it is
-- part of the price — and keeping it separate meant the paddock quoted one
-- number and paid another, with the player expected to do the arithmetic.
--
-- `oddsFor` folds it in from here, so a stored price is the whole deal. The
-- rows already on the table were stored on the old scale, so they are moved
-- onto the new one: the same money, expressed the way everything now reads it.
--
-- Settled rows are included deliberately. `returned` was computed with the
-- premium and is not recomputed by this — settlement only touches rows with a
-- null outcome — so scaling their stored odds makes the slip's "stake ×
-- multiplier = returns" agree with what the bet actually paid, which it did not
-- before.
--
-- Rows with `timing = 'pre_race'` were quoted and paid without the premium and
-- are left alone. Rows with a null price are from before per-selection odds and
-- settle at the listed price, which now carries the premium in the code.

-- Floored to the cent rather than rounded, matching how the pricer folds it in:
-- rounding is never allowed to move in the player's favour, and the payout is
-- rounded to a tenth of a million afterwards anyway.
update bets
set odds = floor(odds * 1.1 * 100) / 100
where timing = 'pre_qualifying'
  and odds is not null;

comment on column bets.odds is
  'The odds agreed when the bet was placed, premium included: what a winning '
  'bet pays is stake * (1 + odds), with nothing added at settlement. Null on '
  'bets placed before odds were per-selection; those settle at the listed '
  'price for their market.';
