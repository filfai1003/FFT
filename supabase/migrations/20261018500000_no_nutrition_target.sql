-- No calorie target (DECISIONS 104): the user can track food without any calorie/macro target.
--
-- A nutrition_goals row with kcal null means "no target from valid_from on" (the history of
-- targets is kept, so days that were on an earlier target still count as they did). Calories and
-- macros are all set or all null; without a target there is no maintenance and no training-day
-- bonus. The water goal stays on the row either way. The safety checks (>= 1500 kcal, deficit
-- <= 25%) still apply to every row that has a target.

alter table public.nutrition_goals
  alter column kcal drop not null,
  alter column protein_g drop not null,
  alter column carbs_g drop not null,
  alter column fat_g drop not null;

alter table public.nutrition_goals
  add constraint nutrition_goals_target_all_or_none check (
    (kcal is null) = (protein_g is null)
    and (kcal is null) = (carbs_g is null)
    and (kcal is null) = (fat_g is null)
    and (kcal is not null or (maintenance_kcal is null and training_day_bonus_kcal = 0))
  );
