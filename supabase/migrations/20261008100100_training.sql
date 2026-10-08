-- Training: exercise catalogue, plans, sessions, sets, records and strength views.

-- ---------------------------------------------------------------------------
-- exercises: catalogue (owner_id null, read-only for users) + the user's own exercises.
-- ---------------------------------------------------------------------------
create table public.exercises (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references auth.users (id) on delete cascade,
  -- Stable key of catalogue exercises; names the image file (bench-press -> bench-press.png).
  slug              text,
  name              text not null check (length(trim(name)) > 0),
  -- The Create exercise chips. Strength groups (Arms, Core, Legs…) are derived, see
  -- public.strength_group().
  primary_muscle    text not null check (primary_muscle in
                      ('chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs')),
  secondary_muscles text[] not null default '{}',
  equipment         text not null check (equipment in
                      ('barbell', 'dumbbells', 'machine', 'cables', 'bodyweight', 'bands')),
  log_type          text not null default 'weight_reps'
                      check (log_type in ('weight_reps', 'reps', 'time', 'distance_time')),
  image_path        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint exercises_secondary_valid check (
    secondary_muscles <@ array['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs']
  )
);

create unique index exercises_catalogue_slug_idx on public.exercises (slug) where owner_id is null;
create index exercises_owner_idx on public.exercises (owner_id);
create index exercises_name_trgm_idx on public.exercises using gin (name extensions.gin_trgm_ops);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- Strength-score groups (Chest, Back, Shoulders, Legs, Arms, Core) from the finer muscles.
create function public.strength_group(muscle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case muscle
    when 'biceps' then 'arms'
    when 'triceps' then 'arms'
    when 'abs' then 'core'
    when 'glutes' then 'legs'
    else muscle
  end;
$$;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create table public.workout_plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  goal       text,
  -- My plans shows ACTIVE / DRAFT / ARCHIVED (the spec's `active` boolean was not enough).
  status     text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  source     text not null default 'manual' check (source in ('manual', 'ai', 'trainer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index workout_plans_user_idx on public.workout_plans (user_id);
-- At most one active plan per user.
create unique index workout_plans_one_active_idx
  on public.workout_plans (user_id) where status = 'active' and deleted_at is null;

create trigger workout_plans_set_updated_at
  before update on public.workout_plans
  for each row execute function public.set_updated_at();

create table public.plan_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id    uuid not null references public.workout_plans (id) on delete cascade,
  position   integer not null check (position >= 0),
  name       text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index plan_days_plan_idx on public.plan_days (plan_id, position);

create trigger plan_days_set_updated_at
  before update on public.plan_days
  for each row execute function public.set_updated_at();

create table public.plan_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_day_id  uuid not null references public.plan_days (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id),
  position     integer not null check (position >= 0),
  target_sets  integer not null default 3 check (target_sets between 1 and 20),
  -- Text because it is a range: "8–10".
  target_reps  text not null default '8-12',
  rest_s       integer not null default 90 check (rest_s between 0 and 1800),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index plan_exercises_day_idx on public.plan_exercises (plan_day_id, position);
create index plan_exercises_exercise_idx on public.plan_exercises (exercise_id);

create trigger plan_exercises_set_updated_at
  before update on public.plan_exercises
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------
create table public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id      uuid references public.workout_plans (id) on delete set null,
  plan_day_id  uuid references public.plan_days (id) on delete set null,
  -- Name at the time of the workout ("Push A", "Empty workout"): the plan may change later.
  day_name     text,
  cycle_number integer check (cycle_number >= 1),
  out_of_order boolean not null default false,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  feeling      smallint check (feeling between 1 and 5),
  notes        text,
  status       text not null default 'active' check (status in ('active', 'done', 'discarded')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);
create index workout_sessions_plan_idx on public.workout_sessions (plan_id, cycle_number);
-- At most one active session per user (the one that can be minimised and resumed).
create unique index workout_sessions_one_active_idx
  on public.workout_sessions (user_id) where status = 'active' and deleted_at is null;

create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

-- Order, rest and note of each exercise inside one session (needed for empty workouts and
-- for exercises added on the fly, which have no plan_exercise).
create table public.session_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id  uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position    integer not null check (position >= 0),
  rest_s      integer check (rest_s between 0 and 1800),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index session_exercises_unique_idx
  on public.session_exercises (session_id, exercise_id) where deleted_at is null;
create index session_exercises_session_idx on public.session_exercises (session_id, position);

create trigger session_exercises_set_updated_at
  before update on public.session_exercises
  for each row execute function public.set_updated_at();

create table public.session_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id   uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id),
  set_index    integer not null check (set_index >= 0),
  weight_kg    numeric(6, 2) check (weight_kg >= 0),
  reps         integer check (reps >= 0),
  duration_s   integer check (duration_s >= 0),
  distance_m   numeric(9, 1) check (distance_m >= 0),
  -- A set counts (records, volume, Finish summary) only once it is checked off.
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index session_sets_session_idx on public.session_sets (session_id);
create index session_sets_exercise_idx on public.session_sets (exercise_id);
create index session_sets_user_exercise_idx on public.session_sets (user_id, exercise_id);

create trigger session_sets_set_updated_at
  before update on public.session_sets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Records and strength. Never stored: always computed from completed sets of finished sessions.
-- ---------------------------------------------------------------------------

-- Estimated 1RM, Epley: weight × (1 + reps / 30). Only for reps 1..12 (above is unreliable);
-- with 1 rep it is the weight itself.
create function public.epley_1rm(weight_kg numeric, reps integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when weight_kg is null or weight_kg <= 0 or reps is null or reps < 1 or reps > 12 then null
    when reps = 1 then weight_kg
    else weight_kg * (1 + reps / 30.0)
  end;
$$;

-- Actual max = heaviest completed weight (any reps); estimated 1RM = best Epley value.
create view public.exercise_records with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  max(ss.weight_kg) filter (where ss.weight_kg > 0)       as actual_max_kg,
  max(public.epley_1rm(ss.weight_kg, ss.reps))            as est_1rm_kg,
  count(*)                                                as completed_sets
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id;

-- Best estimated 1RM per exercise per (local) day, the input of the strength score.
create view public.exercise_e1rm_daily with (security_invoker = true) as
select
  s.user_id,
  ss.exercise_id,
  (s.started_at at time zone p.timezone)::date            as day,
  max(public.epley_1rm(ss.weight_kg, ss.reps))            as best_e1rm_kg,
  count(*)                                                as sets
from public.session_sets ss
join public.workout_sessions s on s.id = ss.session_id
join public.profiles p on p.id = s.user_id
where s.status = 'done'
  and s.deleted_at is null
  and ss.deleted_at is null
  and ss.completed_at is not null
group by s.user_id, ss.exercise_id, (s.started_at at time zone p.timezone)::date;

-- Change of the estimated 1RM for each exercise trained on at least two days in the period
-- (last value vs first value of the period).
create function public.strength_by_exercise(p_from date, p_to date default current_date)
returns table (
  exercise_id   uuid,
  muscle_group  text,
  first_e1rm_kg numeric,
  last_e1rm_kg  numeric,
  pct_change    numeric,
  sets          bigint
)
language sql
stable
set search_path = ''
as $$
  with d as (
    select * from public.exercise_e1rm_daily
    where user_id = auth.uid() and day between p_from and p_to
  ),
  valid as (select * from d where best_e1rm_kg is not null),
  firsts as (
    select distinct on (exercise_id) exercise_id, best_e1rm_kg
    from valid order by exercise_id, day asc
  ),
  lasts as (
    select distinct on (exercise_id) exercise_id, best_e1rm_kg
    from valid order by exercise_id, day desc
  ),
  agg as (
    select exercise_id, count(*) as days, sum(sets) as sets
    from valid group by exercise_id
  )
  select
    a.exercise_id,
    public.strength_group(e.primary_muscle),
    f.best_e1rm_kg,
    l.best_e1rm_kg,
    round((l.best_e1rm_kg - f.best_e1rm_kg) / f.best_e1rm_kg * 100, 1),
    a.sets
  from agg a
  join firsts f using (exercise_id)
  join lasts l using (exercise_id)
  join public.exercises e on e.id = a.exercise_id
  where a.days >= 2;
$$;

-- Strength score: average % change of the estimated 1RM weighted by the number of sets, for
-- the 'overall' row and for each muscle group.
create function public.strength_by_group(p_from date, p_to date default current_date)
returns table (muscle_group text, pct_change numeric, sets bigint)
language sql
stable
set search_path = ''
as $$
  with se as (select * from public.strength_by_exercise(p_from, p_to))
  select 'overall'::text, round(sum(pct_change * sets) / nullif(sum(sets), 0), 1), sum(sets)::bigint
  from se
  having count(*) > 0
  union all
  select muscle_group, round(sum(pct_change * sets) / nullif(sum(sets), 0), 1), sum(sets)::bigint
  from se
  group by muscle_group;
$$;
