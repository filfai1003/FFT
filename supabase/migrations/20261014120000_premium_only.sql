-- Only premium accounts keep data on the server.
--
-- Free accounts keep everything on the phone (see CLAUDE.md, "Where data lives"); the server must
-- not hold their data even if a client tried. Premium today = VIP (made by the admin panel);
-- paid plans will be added to is_premium() later.
--
-- RESTRICTIVE policies are AND-ed with the existing "own rows" policies: writing (insert, update)
-- needs premium. Reading and deleting stay allowed, so an account that stops being premium can take
-- its data back to the phone and then clear it from the server.

create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vip_users v
    where v.user_id = (select auth.uid()) and v.deleted_at is null
  );
$$;

revoke all on function public.is_premium() from public;
grant execute on function public.is_premium() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'consents',
    'exercises', 'foods', 'food_servings',
    'workout_plans', 'plan_days', 'plan_exercises',
    'workout_sessions', 'session_exercises', 'session_sets',
    'food_logs', 'nutrition_goals',
    'fixed_meal_plans', 'fixed_meals', 'fixed_meal_checks', 'water_logs',
    'body_metrics', 'body_goals', 'progress_photos'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.is_premium()))',
      t || '_insert_premium', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using ((select public.is_premium())) with check ((select public.is_premium()))',
      t || '_update_premium', t);
  end loop;
end
$$;

-- Called by the app once the data is back on the phone (premium ended): removes every row of the
-- caller from the server and leaves the empty profile and settings that every account has. The
-- photo files are removed by the app through the storage API.
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
end;
$$;

revoke all on function public.clear_my_online_data() from public;
grant execute on function public.clear_my_online_data() to authenticated;

-- The same for the private photo buckets.
create policy private_images_insert_premium on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id not in ('progress-photos', 'user-exercise-images') or (select public.is_premium())
  );
create policy private_images_update_premium on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id not in ('progress-photos', 'user-exercise-images') or (select public.is_premium())
  );
