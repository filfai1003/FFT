-- The copy on the server, by category (DECISIONS 63). The user chooses which categories of data
-- are kept on the server: body, diet, training, progress photos. The profile, the settings and the
-- consents are always part of the copy (other devices need them to start). Same mapping as the
-- app: src/domain/data-categories.ts.
-- * account_sync.categories: the categories kept (all of them by default: accounts that already
--   keep a copy keep everything);
-- * writes to a table of a category that is off are refused (row level security), so an old app
--   cannot send them;
-- * set_sync_categories(): the only way to change it; a category turned off is deleted from the
--   server at once (its rows and their tombstones; the files go through the storage API).

alter table public.account_sync
  add column categories text[] not null
    default array['body', 'diet', 'training', 'photos']::text[]
    check (categories <@ array['body', 'diet', 'training', 'photos']::text[]);

/** The category of a synced table (null = always part of the copy, or not user data). */
create or replace function public.table_category(p_table text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_table in ('body_metrics', 'body_goals') then 'body'
    when p_table in ('foods', 'food_servings', 'food_logs', 'nutrition_goals', 'fixed_meal_plans',
                     'fixed_meals', 'fixed_meal_checks', 'water_logs', 'supplements',
                     'supplement_logs', 'daily_nutrition_totals') then 'diet'
    when p_table in ('exercises', 'workout_plans', 'plan_days', 'plan_exercises',
                     'workout_sessions', 'session_exercises', 'session_sets',
                     'exercise_records', 'exercise_e1rm_daily') then 'training'
    when p_table = 'progress_photos' then 'photos'
  end;
$$;

/** Does the caller keep this category on the server? (row level security uses it) */
create or replace function public.category_on(p_category text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_sync s
    where s.user_id = (select auth.uid()) and s.deleted_at is null
      and p_category = any (s.categories)
  );
$$;
revoke all on function public.category_on(text) from public;
grant execute on function public.category_on(text) to authenticated;
revoke execute on function public.category_on(text) from anon;

/** Server only (api service): the categories an account keeps on the server. */
create or replace function public.sync_categories_of(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.categories from public.account_sync s
    where s.user_id = p_user and s.deleted_at is null
  ), array[]::text[]);
$$;
revoke all on function public.sync_categories_of(uuid) from public;
revoke execute on function public.sync_categories_of(uuid) from anon, authenticated;

/** The caller's copy on the server: {enabled: true | false | null, categories: [...]}. */
create or replace function public.my_sync_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'enabled', (select s.enabled from public.account_sync s
                where s.user_id = (select auth.uid()) and s.deleted_at is null),
    'categories', coalesce((select to_jsonb(s.categories) from public.account_sync s
                where s.user_id = (select auth.uid()) and s.deleted_at is null),
                '["body", "diet", "training", "photos"]'::jsonb)
  );
$$;
revoke all on function public.my_sync_state() from public;
grant execute on function public.my_sync_state() to authenticated;
revoke execute on function public.my_sync_state() from anon;

-- Writes of a category that is off are refused (AND-ed with the other rules). Reading and deleting
-- stay allowed.
do $$
declare
  spec text[];
begin
  foreach spec slice 1 in array array[
    ['body_metrics', 'body'], ['body_goals', 'body'],
    ['foods', 'diet'], ['food_servings', 'diet'], ['food_logs', 'diet'],
    ['nutrition_goals', 'diet'], ['fixed_meal_plans', 'diet'], ['fixed_meals', 'diet'],
    ['fixed_meal_checks', 'diet'], ['water_logs', 'diet'], ['supplements', 'diet'],
    ['supplement_logs', 'diet'],
    ['exercises', 'training'], ['workout_plans', 'training'], ['plan_days', 'training'],
    ['plan_exercises', 'training'], ['workout_sessions', 'training'],
    ['session_exercises', 'training'], ['session_sets', 'training'],
    ['progress_photos', 'photos']
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.category_on(%L)))',
      spec[1] || '_insert_category', spec[1], spec[2]);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using ((select public.category_on(%L))) with check ((select public.category_on(%L)))',
      spec[1] || '_update_category', spec[1], spec[2], spec[2]);
  end loop;
end
$$;

-- The same for the files: progress photos and the pictures of the user's own exercises.
create policy private_images_insert_category on storage.objects
  as restrictive for insert to authenticated
  with check (
    (bucket_id <> 'progress-photos' or (select public.category_on('photos')))
    and (bucket_id <> 'user-exercise-images' or (select public.category_on('training')))
  );
create policy private_images_update_category on storage.objects
  as restrictive for update to authenticated
  using (
    (bucket_id <> 'progress-photos' or (select public.category_on('photos')))
    and (bucket_id <> 'user-exercise-images' or (select public.category_on('training')))
  );

/** Internal: deletes one category of an account's data on the server, with its tombstones. */
create or replace function public.clear_category(p_user uuid, p_category text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_category = 'body' then
    delete from public.body_metrics where user_id = p_user;
    delete from public.body_goals where user_id = p_user;
    delete from public.sync_tombstones
      where user_id = p_user and table_name in ('body_metrics', 'body_goals');
  elsif p_category = 'diet' then
    delete from public.supplement_logs where user_id = p_user;
    delete from public.supplements where user_id = p_user;
    delete from public.fixed_meal_checks where user_id = p_user;
    delete from public.food_logs where user_id = p_user;
    delete from public.water_logs where user_id = p_user;
    delete from public.nutrition_goals where user_id = p_user;
    update public.fixed_meal_plans set workout_after_meal_id = null where user_id = p_user;
    delete from public.fixed_meals where user_id = p_user;
    delete from public.fixed_meal_plans where user_id = p_user;
    delete from public.food_servings
      where food_id in (select f.id from public.foods f where f.owner_id = p_user);
    delete from public.foods where owner_id = p_user;
    delete from public.sync_tombstones
      where user_id = p_user and table_name in ('foods', 'food_servings', 'food_logs',
        'nutrition_goals', 'fixed_meal_plans', 'fixed_meals', 'fixed_meal_checks', 'water_logs',
        'supplements', 'supplement_logs');
  elsif p_category = 'training' then
    delete from public.session_sets where user_id = p_user;
    delete from public.session_exercises where user_id = p_user;
    delete from public.workout_sessions where user_id = p_user;
    delete from public.plan_exercises where user_id = p_user;
    delete from public.plan_days where user_id = p_user;
    delete from public.workout_plans where user_id = p_user;
    delete from public.exercises where owner_id = p_user;
    delete from public.sync_tombstones
      where user_id = p_user and table_name in ('exercises', 'workout_plans', 'plan_days',
        'plan_exercises', 'workout_sessions', 'session_exercises', 'session_sets');
  elsif p_category = 'photos' then
    delete from public.progress_photos where user_id = p_user;
    delete from public.sync_tombstones
      where user_id = p_user and table_name = 'progress_photos';
  else
    raise exception 'unknown category: %', p_category using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.clear_category(uuid, text) from public;
revoke execute on function public.clear_category(uuid, text) from anon, authenticated;

/**
 * Chooses the categories kept on the server for the caller. A category left out is deleted from
 * the server in the same transaction (rows and tombstones, so other devices do not delete their
 * own copy); its files are removed by the app through the storage API. Returns the categories now
 * kept. Works before the copy is turned on too (the choice is then kept for later).
 */
create or replace function public.set_sync_categories(p_categories text[])
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  all_categories text[] := array['body', 'diet', 'training', 'photos'];
  next_categories text[];
  old_categories text[];
  c text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_categories is null or not (p_categories <@ all_categories) then
    raise exception 'categories must be among body, diet, training, photos' using errcode = '22023';
  end if;
  select array_agg(x order by array_position(all_categories, x)) into next_categories
    from (select distinct unnest(p_categories) as x) d;
  next_categories := coalesce(next_categories, array[]::text[]);

  select s.categories into old_categories from public.account_sync s where s.user_id = uid;
  insert into public.account_sync (user_id, enabled, categories)
  values (uid, false, next_categories)
  on conflict (user_id) do update
    set categories = excluded.categories, updated_at = now();

  foreach c in array coalesce(old_categories, all_categories) loop
    if not (c = any (next_categories)) then
      perform public.clear_category(uid, c);
    end if;
  end loop;
  return next_categories;
end;
$$;
revoke all on function public.set_sync_categories(text[]) from public;
grant execute on function public.set_sync_categories(text[]) to authenticated;
revoke execute on function public.set_sync_categories(text[]) from anon;
