-- API tokens and AI app connections (DECISIONS 86):
-- * a revoked or ended one is deleted for good 7 days later (purge_deleted), like other deleted
--   rows: its name, prefix, host and dates no longer stay forever;
-- * Undo brings back only a token the user revoked, within a minute of that revoke (the app's
--   Undo lasts 5 s), and never a connection the server ended (refresh token reused, replaced by a
--   new sign-in, past its 30 idle / 90 days) or one past its end. user_revoked_at tells the user's
--   own revoke from the server's.

alter table public.api_tokens add column user_revoked_at timestamptz;

/** Revokes one of the caller's tokens, or (Undo) restores one the caller revoked a moment ago. */
create or replace function public.set_api_token_revoked(p_id uuid, p_revoked boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_revoked then
    update public.api_tokens
    set deleted_at = now(), user_revoked_at = now()
    where id = p_id and user_id = uid and deleted_at is null;
    return;
  end if;
  update public.api_tokens
  set deleted_at = null, user_revoked_at = null
  where id = p_id and user_id = uid
    and deleted_at is not null
    and user_revoked_at is not null and user_revoked_at = deleted_at
    and user_revoked_at > now() - interval '1 minute'
    and (ends_at is null or ends_at > now())
    and (refresh_expires_at is null or refresh_expires_at > now());
  if not found then
    raise exception 'this token can no longer be restored' using errcode = '55000';
  end if;
end;
$$;
revoke all on function public.set_api_token_revoked(uuid, boolean) from public;
grant execute on function public.set_api_token_revoked(uuid, boolean) to authenticated;
revoke execute on function public.set_api_token_revoked(uuid, boolean) from anon;

-- purge_deleted (DECISIONS 79) as in 20261018120000_purge_deleted.sql, plus the revoked tokens.

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

  -- Revoked tokens and ended AI app connections (no file, nothing references them).
  delete from public.api_tokens where deleted_at < cutoff;
  get diagnostics n = row_count;
  removed := removed + n;

  return jsonb_build_object('removed', removed, 'kept', kept, 'files', files);
end;
$$;
revoke all on function public.purge_deleted(integer) from public;
revoke execute on function public.purge_deleted(integer) from anon, authenticated;
