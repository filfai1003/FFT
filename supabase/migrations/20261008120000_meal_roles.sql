-- Fixed meals: a "main meal" flag (gets a bigger share in auto-split) and where the workout sits in
-- the day (right after this meal). Only used by auto-split; the user can still edit every value.
alter table public.fixed_meals
  add column is_main boolean not null default false;

alter table public.fixed_meal_plans
  add column workout_after_meal_id uuid;
