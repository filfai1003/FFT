-- Automatic water target (DECISIONS 127): the daily water target is computed from the user's
-- details (weight, height, age, sex, the day's workouts; src/domain/hydration.ts) unless the
-- user sets their own number.
--
-- water_auto: true = automatic, false = the user's own number in water_ml. Null = a row written
-- before this column existed (or by an older app): automatic when water_ml is exactly the old
-- 2000 ml default, the user's own number otherwise. Rows are not rewritten here: changing them
-- would move their updated_at and fight with the phones' own copies (the device is the source,
-- DECISIONS 40), and the null reading gives the same answer everywhere.
--
-- water_ml stays a number on every row (older apps and API clients read it): with the automatic
-- target it keeps the last number the user chose (2000 if never), and the API returns the
-- effective target computed by the same TypeScript code (server/api.js, server/coach.js).
-- The sync copies the new column like any other (sync_push takes the columns the table has).

alter table public.nutrition_goals
  add column water_auto boolean;

comment on column public.nutrition_goals.water_auto is
  'Water target: true = automatic (from the user''s details), false = water_ml; null = row from before 2026-10-22, automatic when water_ml = 2000 (DECISIONS 127).';
