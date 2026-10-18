-- Files of purged rows are never forgotten, and a restore can purge again (DECISIONS 98).
--
-- 1. files_to_delete: purge_deleted no longer only returns the files of the rows it deletes (lost
--    when the storage call failed after the rows were gone): it queues them in this table, in the
--    same transaction as the row deletions. The api service removes the queued files through the
--    storage API and deletes an entry only once storage confirmed it; failures stay queued and are
--    tried again at every clean-up (daily and at start). A file is never removed before its row is
--    gone for good (a row still used through a foreign key stays, with its file).
-- 2. Tombstones (ids of rows deleted for good) are kept 190 days instead of 90: as long as the
--    oldest backup (6 months), so a restore can delete those rows again (reapply_row_deletions,
--    run by backup/reapply-deletions.mjs --rows).
-- 3. Deleting an account forgets its queued paths (its folders are emptied by delete-account).

create table public.files_to_delete (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null check (bucket in ('progress-photos', 'user-exercise-images', 'vault-files')),
  path       text not null check (length(path) between 1 and 500),
  attempts   integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (bucket, path)
);
alter table public.files_to_delete enable row level security;
revoke all on public.files_to_delete from anon, authenticated;

create trigger files_to_delete_set_updated_at
  before update on public.files_to_delete
  for each row execute function public.set_updated_at();

create or replace function public.forget_queued_files_of_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.files_to_delete where path like old.id::text || '/%';
  return old;
end;
$$;
revoke all on function public.forget_queued_files_of_account() from public;

create trigger auth_users_forget_queued_files
  after delete on auth.users
  for each row execute function public.forget_queued_files_of_account();

-- Same as in 20261018192000_api_token_retention.sql, plus the queue and the longer tombstones.
create or replace function public.purge_deleted(p_days integer default 7)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := now() - make_interval(days => greatest(p_days, 1));
  t text;
  r record;
  removed integer := 0;
  kept integer := 0;
  files jsonb := '[]'::jsonb;
  file_col text;
  bkt text;
  n integer;
begin
  -- Children before parents. Consents stay: they are the record of what the user agreed to.
  foreach t in array array[
    'session_sets', 'session_exercises', 'workout_sessions', 'plan_exercises', 'plan_days',
    'workout_plans', 'fixed_meal_checks', 'fixed_meals', 'fixed_meal_plans', 'food_logs',
    'food_servings', 'foods', 'exercises', 'nutrition_goals', 'water_logs', 'body_metrics',
    'body_goals', 'progress_photos', 'supplement_logs', 'supplements'
  ] loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t and c.column_name = 'deleted_at'
    ) then
      continue;
    end if;
    file_col := case t when 'progress_photos' then 'x.storage_path' when 'exercises' then 'x.image_path' else 'null::text' end;
    bkt := case t when 'progress_photos' then 'progress-photos' else 'user-exercise-images' end;
    for r in execute format(
      'select x.id::text as id, %s as file from public.%I x where x.deleted_at < $1 %s',
      file_col, t,
      -- Catalogue rows (no owner) are not the users' to purge.
      case when t in ('exercises', 'foods') then 'and x.owner_id is not null' else '' end)
      using cutoff
    loop
      begin
        execute format('delete from public.%I where id::text = $1', t) using r.id;
        removed := removed + 1;
        if r.file is not null then
          files := files || jsonb_build_array(jsonb_build_object('bucket', bkt, 'path', r.file));
          insert into public.files_to_delete (bucket, path) values (bkt, r.file)
            on conflict (bucket, path) do nothing;
        end if;
      exception when foreign_key_violation then
        -- Still used by a live row (an own exercise in a past workout): it stays.
        kept := kept + 1;
      end;
    end loop;
  end loop;

  -- Tombstones: kept as long as the oldest backup, so a restore can delete those rows again.
  -- Sealed deletions (end-to-end encrypted copies) once every device had time.
  delete from public.sync_tombstones where server_at < now() - interval '190 days';
  delete from public.vault_rows where deleted and server_at < now() - interval '90 days';

  -- Revoked tokens and ended AI app connections (no file, nothing references them).
  delete from public.api_tokens where deleted_at < cutoff;
  get diagnostics n = row_count;
  removed := removed + n;

  return jsonb_build_object('removed', removed, 'kept', kept, 'files', files);
end;
$$;
revoke all on function public.purge_deleted(integer) from public;
revoke execute on function public.purge_deleted(integer) from anon, authenticated;

-- After a restore: deletes again the rows deleted for good since the dump ([{table, id}], from the
-- tombstones saved by the nightly backup). Same tables and order as purge_deleted, each row in its
-- own savepoint (one still referenced stays), files queued. Returns how many rows were back.
create or replace function public.reapply_row_deletions(p_rows jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t text;
  r record;
  file text;
  got integer;
  total integer := 0;
begin
  foreach t in array array[
    'session_sets', 'session_exercises', 'workout_sessions', 'plan_exercises', 'plan_days',
    'workout_plans', 'fixed_meal_checks', 'fixed_meals', 'fixed_meal_plans', 'food_logs',
    'food_servings', 'foods', 'exercises', 'nutrition_goals', 'water_logs', 'body_metrics',
    'body_goals', 'progress_photos', 'supplement_logs', 'supplements'
  ] loop
    for r in
      select distinct x ->> 'id' as id from jsonb_array_elements(coalesce(p_rows, '[]')) x
      where x ->> 'table' = t and x ->> 'id' is not null
    loop
      begin
        file := null;
        if t = 'progress_photos' then
          execute 'delete from public.progress_photos where id::text = $1 returning storage_path'
            into file using r.id;
        elsif t = 'exercises' then
          execute 'delete from public.exercises where id::text = $1 and owner_id is not null returning image_path'
            into file using r.id;
        elsif t = 'foods' then
          execute 'delete from public.foods where id::text = $1 and owner_id is not null' using r.id;
        else
          execute format('delete from public.%I where id::text = $1', t) using r.id;
        end if;
        get diagnostics got = row_count;
        total := total + got;
        if file is not null then
          insert into public.files_to_delete (bucket, path)
          values (case t when 'progress_photos' then 'progress-photos' else 'user-exercise-images' end, file)
          on conflict (bucket, path) do nothing;
        end if;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
  end loop;
  return total;
end;
$$;
revoke all on function public.reapply_row_deletions(jsonb) from public;
revoke execute on function public.reapply_row_deletions(jsonb) from anon, authenticated;
