-- Deleting is deleting (DECISIONS 79): a row the user deleted (deleted_at) is kept only for the
-- undo and for the deletion to reach the other devices as a normal change; after p_days it is
-- deleted for good. The delete triggers leave a tombstone (table and row id only, no content), so
-- devices that were away delete it too; tombstones are kept 90 days, and a device away longer
-- downloads everything again and drops what is gone (src/features/premium/sync.ts).
--
-- Server only: run every day by the api service (server/index.js), which then removes the files
-- (photos, own exercise pictures) listed in the result through the storage API.

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
          files := files || jsonb_build_array(jsonb_build_object(
            'bucket', case t when 'progress_photos' then 'progress-photos' else 'user-exercise-images' end,
            'path', r.file));
        end if;
      exception when foreign_key_violation then
        -- Still used by a live row (an own exercise in a past workout): it stays.
        kept := kept + 1;
      end;
    end loop;
  end loop;

  -- Tombstones and sealed deletions (end-to-end encrypted copies) once every device had time.
  delete from public.sync_tombstones where server_at < now() - interval '90 days';
  delete from public.vault_rows where deleted and server_at < now() - interval '90 days';

  return jsonb_build_object('removed', removed, 'kept', kept, 'files', files);
end;
$$;
revoke all on function public.purge_deleted(integer) from public;
revoke execute on function public.purge_deleted(integer) from anon, authenticated;
