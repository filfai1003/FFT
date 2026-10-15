-- Supersets (DECISIONS 53): an exercise linked with the next one in a plan day (and in the workout
-- that came from it). Consecutive links make one superset, done in turn with one rest per round.
alter table public.plan_exercises
  add column if not exists superset_with_next boolean not null default false;
alter table public.session_exercises
  add column if not exists superset_with_next boolean not null default false;
