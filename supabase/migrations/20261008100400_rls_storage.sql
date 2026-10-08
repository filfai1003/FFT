-- Row Level Security on EVERY table + Storage buckets and policies.
-- Rule: everyone reads the public rows (catalogue, owner_id null) and their own rows, and writes
-- only their own. A pgTAP test (supabase/tests/database/rls.test.sql) fails if a table lacks RLS.

-- ---------------------------------------------------------------------------
-- Plain per-user tables (user_id = auth.uid()): select / insert / update / delete.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'workout_plans', 'plan_days', 'plan_exercises',
    'workout_sessions', 'session_exercises', 'session_sets',
    'recipes', 'recipe_items', 'food_logs', 'nutrition_goals',
    'fixed_meal_plans', 'fixed_meals', 'fixed_meal_checks', 'water_logs',
    'body_metrics', 'body_goals', 'progress_photos'
  ]
  loop
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
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- profiles / user_settings: one row per user, never deleted by the user (account deletion
-- cascades from auth.users).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.user_settings enable row level security;

create policy user_settings_select_own on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy user_settings_insert_own on public.user_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- consents: append / withdraw, never delete (audit trail).
alter table public.consents enable row level security;

create policy consents_select_own on public.consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy consents_insert_own on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy consents_update_own on public.consents
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Catalogue + personal rows in the same table (owner_id null = public, read-only for users).
-- Catalogue rows are written by migrations/seed or the service role only.
-- ---------------------------------------------------------------------------
alter table public.exercises enable row level security;

create policy exercises_select on public.exercises
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy exercises_insert_own on public.exercises
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy exercises_update_own on public.exercises
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy exercises_delete_own on public.exercises
  for delete to authenticated using (owner_id = (select auth.uid()));

alter table public.foods enable row level security;

create policy foods_select on public.foods
  for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy foods_insert_own on public.foods
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy foods_update_own on public.foods
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy foods_delete_own on public.foods
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Servings follow their food: readable if the food is, writable only on your own foods.
alter table public.food_servings enable row level security;

create policy food_servings_select on public.food_servings
  for select to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id));
create policy food_servings_insert_own on public.food_servings
  for insert to authenticated
  with check (exists (
    select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())
  ));
create policy food_servings_update_own on public.food_servings
  for update to authenticated
  using (exists (
    select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())
  ));
create policy food_servings_delete_own on public.food_servings
  for delete to authenticated
  using (exists (
    select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Progress photos: private, shown only through signed URLs.
  ('progress-photos', 'progress-photos', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  -- Images of the user's own exercises: private as well.
  ('user-exercise-images', 'user-exercise-images', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  -- Catalogue exercise images: public read, written only by the service role.
  ('exercise-images', 'exercise-images', true, 2097152,
    array['image/png', 'image/webp'])
on conflict (id) do nothing;

-- Private buckets: files live in a folder named after the user id ("<uid>/file.jpg").
do $$
declare
  b text;
begin
  foreach b in array array['progress-photos', 'user-exercise-images']
  loop
    execute format(
      'create policy %I on storage.objects for select to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)',
      b || '_select_own', b);
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)',
      b || '_insert_own', b);
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)',
      b || '_update_own', b);
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)',
      b || '_delete_own', b);
  end loop;
end
$$;
