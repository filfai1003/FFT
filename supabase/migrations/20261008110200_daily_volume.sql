-- Daily lifted volume per exercise (weight x reps of completed sets): "WEEKLY VOLUME" on the
-- Muscle group screen. The new column is appended (CREATE OR REPLACE VIEW only allows that).
create or replace view public.exercise_e1rm_daily with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  (s.started_at at time zone p.timezone)::date            as day,
  max(public.epley_1rm(ss.weight_kg, ss.reps))            as best_e1rm_kg,
  count(*)                                                as sets,
  max(ss.weight_kg) filter (where ss.weight_kg > 0)       as best_weight_kg,
  coalesce(sum(ss.weight_kg * ss.reps) filter (where ss.weight_kg > 0 and ss.reps > 0), 0) as volume_kg
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
join public.profiles p on p.id = s.user_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id, (s.started_at at time zone p.timezone)::date;
