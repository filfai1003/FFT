-- Premium sync: the phone (and the web app) keep working on their own database and exchange changes
-- with the server in the background.
--
-- Rules (DECISIONS 40):
-- * A change is a whole row with the time it was made on the device (updated_at). For each row the
--   most recent change wins, whatever order the devices send them in ("last write wins").
-- * Sending the same row twice changes nothing the second time: repeated actions count once.
-- * A deletion wins over changes made before it; it leaves a tombstone so other devices delete too.
-- * Devices ask for what changed since their last visit using the server's own clock (server_at),
--   so a phone that was offline for days still gets everything.

-- updated_at: keep the time the client gives (the moment of the action); set it only when the
-- writer did not (direct updates, the admin panel).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

-- server_at: when the server last stored the row (the pull cursor).
create or replace function public.set_server_at()
returns trigger
language plpgsql
as $$
begin
  new.server_at = clock_timestamp();
  return new;
end;
$$;

-- Deleted rows, so the other devices delete them too (also rows removed by ON DELETE CASCADE).
create table public.sync_tombstones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  row_id     text not null,
  deleted_at timestamptz not null default now(),
  server_at  timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sync_tombstones_user_idx on public.sync_tombstones (user_id, server_at);

alter table public.sync_tombstones enable row level security;
create policy sync_tombstones_select_own on public.sync_tombstones
  for select to authenticated using (user_id = (select auth.uid()));

-- TG_ARGV[0]: the column that holds the owner ('food' = through the food), TG_ARGV[1]: the key.
create or replace function public.record_tombstone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if tg_argv[0] = 'food' then
    select f.owner_id into owner from public.foods f where f.id = old.food_id;
  else
    owner := (to_jsonb(old) ->> tg_argv[0])::uuid;
  end if;
  if owner is not null then
    insert into public.sync_tombstones (user_id, table_name, row_id)
    values (owner, tg_table_name, to_jsonb(old) ->> tg_argv[1]);
  end if;
  return old;
end;
$$;

do $$
declare
  t text;
  spec text[];
begin
  foreach spec slice 1 in array array[
    ['profiles', 'id', 'id'],
    ['user_settings', 'user_id', 'user_id'],
    ['consents', 'user_id', 'id'],
    ['exercises', 'owner_id', 'id'],
    ['foods', 'owner_id', 'id'],
    ['food_servings', 'food', 'id'],
    ['workout_plans', 'user_id', 'id'],
    ['plan_days', 'user_id', 'id'],
    ['plan_exercises', 'user_id', 'id'],
    ['workout_sessions', 'user_id', 'id'],
    ['session_exercises', 'user_id', 'id'],
    ['session_sets', 'user_id', 'id'],
    ['food_logs', 'user_id', 'id'],
    ['nutrition_goals', 'user_id', 'id'],
    ['fixed_meal_plans', 'user_id', 'id'],
    ['fixed_meals', 'user_id', 'id'],
    ['fixed_meal_checks', 'user_id', 'id'],
    ['water_logs', 'user_id', 'id'],
    ['body_metrics', 'user_id', 'id'],
    ['body_goals', 'user_id', 'id'],
    ['progress_photos', 'user_id', 'id']
  ]
  loop
    t := spec[1];
    execute format('alter table public.%I add column server_at timestamptz not null default clock_timestamp()', t);
    execute format('create index %I on public.%I (server_at)', t || '_server_at_idx', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.set_server_at()',
      t || '_set_server_at', t);
    execute format(
      'create trigger %I after delete on public.%I for each row execute function public.record_tombstone(%L, %L)',
      t || '_tombstone', t, spec[2], spec[3]);
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
    'fixed_meal_checks', 'water_logs', 'body_metrics', 'body_goals', 'progress_photos'
  ];
$$;

-- Push: rows changed on a device (newest wins per row) and rows deleted there ({id, at}).
-- Runs as the caller: row level security applies (own rows, premium only).
create or replace function public.sync_push(p_table text, p_rows jsonb, p_deletes jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  pk text := case when p_table = 'user_settings' then 'user_id' else 'id' end;
  cols text;
  sets text;
begin
  if not (p_table = any (public.sync_tables())) then
    raise exception 'not a synced table: %', p_table using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_rows, '[]')) > 0 then
    -- The columns the device sent that the table has (never server_at).
    select string_agg(quote_ident(c.column_name), ', '),
           string_agg(format('%1$I = excluded.%1$I', c.column_name), ', ')
             filter (where c.column_name <> pk)
      into cols, sets
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = p_table
       and c.column_name <> 'server_at'
       and p_rows -> 0 ? c.column_name;
    execute format(
      'insert into public.%1$I as t (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) '
      'on conflict (%3$I) do update set %4$s where t.updated_at <= excluded.updated_at',
      p_table, cols, pk, sets)
    using p_rows;
  end if;

  if jsonb_array_length(coalesce(p_deletes, '[]')) > 0 then
    execute format(
      'delete from public.%1$I t using jsonb_to_recordset($1) as d(id text, at timestamptz) '
      'where t.%2$I::text = d.id and t.updated_at <= d.at',
      p_table, pk)
    using p_deletes;
  end if;
end;
$$;

-- Pull: everything of the caller stored on the server after `p_since`, and the deletions.
-- Catalogue rows (owner null) and other users' rows are never sent.
create or replace function public.sync_pull(p_since timestamptz)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  t text;
  owner_filter text;
  rows jsonb;
  result jsonb := jsonb_build_object('now', to_jsonb(clock_timestamp()));
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  foreach t in array public.sync_tables() loop
    owner_filter := case t
      when 'profiles' then 'x.id = $2'
      when 'exercises' then 'x.owner_id = $2'
      when 'foods' then 'x.owner_id = $2'
      when 'food_servings' then 'x.food_id in (select f.id from public.foods f where f.owner_id = $2)'
      else 'x.user_id = $2'
    end;
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - ''server_at''), ''[]''::jsonb) from public.%I x '
      'where x.server_at > $1 and %s', t, owner_filter)
      into rows
      using p_since, uid;
    result := result || jsonb_build_object(t, rows);
  end loop;
  result := result || jsonb_build_object('tombstones', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', s.table_name, 'id', s.row_id, 'at', s.deleted_at)), '[]'::jsonb)
      from public.sync_tombstones s
     where s.user_id = uid and s.server_at > p_since));
  return result;
end;
$$;

grant execute on function public.sync_push(text, jsonb, jsonb) to authenticated;
grant execute on function public.sync_pull(timestamptz) to authenticated;

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
