-- Supplements: each user keeps their own list (creatine, vitamin D, omega 3…: anything) and ticks
-- what they took each day. Shown as the third dot of the calendar.

create table public.supplements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  -- Free text, as the user says it: "5 g", "1 capsule", "2000 IU".
  dose       text check (dose is null or length(dose) <= 40),
  position   integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index supplements_user_idx on public.supplements (user_id);
create trigger supplements_set_updated_at before update on public.supplements
  for each row execute function public.set_updated_at();

create table public.supplement_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The user's local date.
  day           date not null,
  supplement_id uuid not null references public.supplements (id) on delete cascade,
  taken_at      timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create unique index supplement_logs_one_per_day_idx
  on public.supplement_logs (user_id, day, supplement_id) where deleted_at is null;
create index supplement_logs_user_day_idx on public.supplement_logs (user_id, day);
create trigger supplement_logs_set_updated_at before update on public.supplement_logs
  for each row execute function public.set_updated_at();

-- Own rows only; writing needs a plan that keeps data online (like every user table).
do $$
declare
  t text;
begin
  foreach t in array array['supplements', 'supplement_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.is_premium()))',
      t || '_insert_premium', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using ((select public.is_premium())) with check ((select public.is_premium()))',
      t || '_update_premium', t);
    -- Sync: the pull cursor and the deletions other devices must apply.
    execute format('alter table public.%I add column server_at timestamptz not null default clock_timestamp()', t);
    execute format('create index %I on public.%I (server_at)', t || '_server_at_idx', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.set_server_at()',
      t || '_set_server_at', t);
    execute format(
      'create trigger %I after delete on public.%I for each row execute function public.record_tombstone(%L, %L)',
      t || '_tombstone', t, 'user_id', 'id');
  end loop;
end
$$;

create or replace function public.sync_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'profiles', 'user_settings', 'consents', 'exercises', 'foods', 'food_servings',
    'workout_plans', 'plan_days', 'plan_exercises', 'workout_sessions', 'session_exercises',
    'session_sets', 'food_logs', 'nutrition_goals', 'fixed_meal_plans', 'fixed_meals',
    'fixed_meal_checks', 'water_logs', 'body_metrics', 'body_goals', 'progress_photos',
    'supplements', 'supplement_logs'
  ];
$$;

-- Premium ended: the data is back on the phone; the server keeps none of it (tombstones included).
create or replace function public.clear_my_online_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.supplement_logs where user_id = uid;
  delete from public.supplements where user_id = uid;
  delete from public.fixed_meal_checks where user_id = uid;
  delete from public.food_logs where user_id = uid;
  delete from public.water_logs where user_id = uid;
  delete from public.nutrition_goals where user_id = uid;
  update public.fixed_meal_plans set workout_after_meal_id = null where user_id = uid;
  delete from public.fixed_meals where user_id = uid;
  delete from public.fixed_meal_plans where user_id = uid;
  delete from public.session_sets where user_id = uid;
  delete from public.session_exercises where user_id = uid;
  delete from public.workout_sessions where user_id = uid;
  delete from public.plan_exercises where user_id = uid;
  delete from public.plan_days where user_id = uid;
  delete from public.workout_plans where user_id = uid;
  delete from public.body_metrics where user_id = uid;
  delete from public.body_goals where user_id = uid;
  delete from public.progress_photos where user_id = uid;
  delete from public.consents where user_id = uid;
  delete from public.foods where owner_id = uid;
  delete from public.exercises where owner_id = uid;
  delete from public.profiles where id = uid;
  insert into public.profiles (id) values (uid);
  delete from public.user_settings where user_id = uid;
  insert into public.user_settings (user_id) values (uid);
  delete from public.sync_tombstones where user_id = uid;
end;
$$;
