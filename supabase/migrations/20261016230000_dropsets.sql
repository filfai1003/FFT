-- Drop sets (DECISIONS 54). A plan exercise can be followed by drops (after its last set or after
-- every set), each with its own target reps; in a workout every drop is a set row with drop_index
-- 1, 2… next to its main set (drop_index 0, same set_index). Drops count in volume only: actual
-- max, estimated 1RM, completed sets and the strength score use the main sets.

alter table public.plan_exercises
  add column if not exists drop_on text not null default 'last' check (drop_on in ('last', 'every')),
  add column if not exists drop_reps text[] not null default '{}' check (cardinality(drop_reps) <= 4);

alter table public.session_sets
  add column if not exists drop_index smallint not null default 0 check (drop_index between 0 and 4);

create or replace view public.exercise_records with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  max(ss.weight_kg) filter (where ss.weight_kg > 0 and ss.drop_index = 0)  as actual_max_kg,
  max(public.epley_1rm(ss.weight_kg, ss.reps)) filter (where ss.drop_index = 0) as est_1rm_kg,
  count(*) filter (where ss.drop_index = 0)                                 as completed_sets,
  max(ss.reps) filter (where ss.drop_index = 0)                             as best_reps,
  max(ss.duration_s) filter (where ss.drop_index = 0)                       as best_duration_s
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id;

create or replace view public.exercise_e1rm_daily with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  (s.started_at at time zone p.timezone)::date                                as day,
  max(public.epley_1rm(ss.weight_kg, ss.reps)) filter (where ss.drop_index = 0) as best_e1rm_kg,
  count(*) filter (where ss.drop_index = 0)                                   as sets,
  max(ss.weight_kg) filter (where ss.weight_kg > 0 and ss.drop_index = 0)     as best_weight_kg,
  coalesce(sum(ss.weight_kg * ss.reps) filter (where ss.weight_kg > 0 and ss.reps > 0), 0) as volume_kg
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
join public.profiles p on p.id = s.user_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id, (s.started_at at time zone p.timezone)::date;

-- The last session's sets now say which are drops (pre-filled drops and their suggestions).
drop function if exists public.last_sets(uuid[]);
create function public.last_sets(p_exercise_ids uuid[])
returns table (
  exercise_id uuid,
  set_index   integer,
  drop_index  smallint,
  weight_kg   numeric,
  reps        integer,
  duration_s  integer,
  distance_m  numeric
)
language sql
stable
set search_path = ''
as $$
  select ss.exercise_id, ss.set_index, ss.drop_index, ss.weight_kg, ss.reps, ss.duration_s, ss.distance_m
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
  order by ss.exercise_id, ss.set_index, ss.drop_index;
$$;
