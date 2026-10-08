-- Records of exercises that are not weight x reps: best reps and longest time.
create or replace view public.exercise_records with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  max(ss.weight_kg) filter (where ss.weight_kg > 0)       as actual_max_kg,
  max(public.epley_1rm(ss.weight_kg, ss.reps))            as est_1rm_kg,
  count(*)                                                as completed_sets,
  max(ss.reps)                                            as best_reps,
  max(ss.duration_s)                                      as best_duration_s
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id;
