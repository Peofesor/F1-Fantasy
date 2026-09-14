-- How a pick's score came together.
--
-- The round card can say Antonelli scored 98 but not that 98 was a pole, a win
-- and a fastest lap doubled by the armband. Scoring knows — `scoreDriver`
-- returns every component — and the round card is where the question gets
-- asked, so the answer is stored next to the number that prompts it.
--
-- jsonb rather than a table of lines. The shape is a short read-only list that
-- is always wanted whole, alongside the row it explains, and never queried
-- across rows; a child table would buy indexing and joins that nothing here
-- needs, at the cost of a second query on every card.
--
-- Null on rounds scored before this existed, which the UI treats as "no
-- breakdown recorded" rather than an empty one. Re-running the score job fills
-- them in.
alter table roster_slots
  add column if not exists breakdown jsonb;

comment on column roster_slots.breakdown is
  'Scoring components for this pick: { lines: [{ label, driverId?, points }], subtotal, note? }. Subtotal is before chips; the multiplier is on the pick itself.';
