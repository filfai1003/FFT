-- Helpers for the training screens.

-- Heaviest weight per exercise per day too (Exercise detail chart "ACTUAL MAX").
-- New column is appended: CREATE OR REPLACE VIEW only allows that.
create or replace view public.exercise_e1rm_daily with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  (s.started_at at time zone p.timezone)::date            as day,
  max(public.epley_1rm(ss.weight_kg, ss.reps))            as best_e1rm_kg,
  count(*)                                                as sets,
  max(ss.weight_kg) filter (where ss.weight_kg > 0)       as best_weight_kg
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
join public.profiles p on p.id = s.user_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id, (s.started_at at time zone p.timezone)::date;

-- The completed sets of the LAST finished session of each given exercise: the "PREVIOUS" column
-- and the pre-filled weights of the active session.
create function public.last_sets(p_exercise_ids uuid[])
returns table (
  exercise_id uuid,
  set_index   integer,
  weight_kg   numeric,
  reps        integer,
  duration_s  integer,
  distance_m  numeric
)
language sql
stable
set search_path = ''
as $$
  select ss.exercise_id, ss.set_index, ss.weight_kg, ss.reps, ss.duration_s, ss.distance_m
  from (
    select distinct on (x.exercise_id) x.exercise_id, x.session_id
    from public.session_sets x
    join public.workout_sessions s on s.id = x.session_id
    where x.exercise_id = any (p_exercise_ids)
      and s.user_id = auth.uid()
      and s.status = 'done'
      and s.deleted_at is null
      and x.deleted_at is null
      and x.completed_at is not null
    order by x.exercise_id, s.started_at desc
  ) last
  join public.session_sets ss
    on ss.session_id = last.session_id and ss.exercise_id = last.exercise_id
  where ss.deleted_at is null and ss.completed_at is not null
  order by ss.exercise_id, ss.set_index;
$$;
