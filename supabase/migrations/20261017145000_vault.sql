-- End-to-end encryption of the copy on the server (DECISIONS 64). One switch for the whole copy.
-- With it on, the server keeps only sealed items it cannot open:
-- * vault_keys: the account's data key, wrapped with a key derived from the user's passphrase
--   (scrypt; salt and parameters kept here) and with a recovery key shown once. Nothing here
--   opens the data without one of the two secrets.
-- * vault_rows: one sealed item per synced row (the whole row as JSON). In clear only what the
--   sync needs to route it: table, row id, time of the change (last change wins per row) and
--   whether it is a deletion.
-- * vault-files: the photos, sealed, in a private bucket ("<uid>/p-<hidden name>" for progress
--   photos, "<uid>/t-<hidden name>" for exercise pictures).
-- The readable tables then hold nothing of the account (is_premium() is false for it, so they
-- refuse its writes); the api service, MCP and the AI apps cannot work (they would need the key).

alter table public.account_sync add column encrypted boolean not null default false;

create table public.vault_keys (
  user_id               uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  kdf                   jsonb not null,
  salt                  text not null check (length(salt) <= 100),
  wrapped_by_passphrase text not null check (length(wrapped_by_passphrase) <= 500),
  wrapped_by_recovery   text not null check (length(wrapped_by_recovery) <= 500),
  key_check             text not null check (length(key_check) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create table public.vault_rows (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text not null check (tbl = any (public.sync_tables())),
  row_id     text not null check (length(row_id) <= 100),
  -- The time of the change on the device (not the server's): the newest change wins.
  updated_at timestamptz not null,
  deleted    boolean not null default false,
  ciphertext text check (ciphertext is null or length(ciphertext) <= 1000000),
  server_at  timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, tbl, row_id)
);
create index vault_rows_pull_idx on public.vault_rows (user_id, server_at);
create trigger vault_rows_set_server_at before insert or update on public.vault_rows
  for each row execute function public.set_server_at();

/** Server only (api service, OAuth sign-in): is this account's copy end-to-end encrypted? */
create or replace function public.vault_on_of(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.encrypted from public.account_sync s
    where s.user_id = p_user and s.deleted_at is null
  ), false);
$$;
revoke all on function public.vault_on_of(uuid) from public;
revoke execute on function public.vault_on_of(uuid) from anon, authenticated;

/** Can the caller store sealed items? It keeps a copy on the server and has set up its key. */
create or replace function public.vault_writable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_sync s
    where s.user_id = (select auth.uid()) and s.enabled and s.deleted_at is null
  ) and exists (select 1 from public.vault_keys k where k.user_id = (select auth.uid()));
$$;
revoke all on function public.vault_writable() from public;
grant execute on function public.vault_writable() to authenticated;
revoke execute on function public.vault_writable() from anon;

-- "Can keep readable data online" (the row level security rules use this name): not while the
-- copy is end-to-end encrypted.
create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_sync s
    where s.user_id = (select auth.uid()) and s.enabled and not s.encrypted
      and s.deleted_at is null
  );
$$;

/** The caller keeps a copy on the server (for the policies below). */
create or replace function public.sync_enabled_of_me()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sync_enabled_of((select auth.uid()));
$$;
revoke all on function public.sync_enabled_of_me() from public;
grant execute on function public.sync_enabled_of_me() to authenticated;
revoke execute on function public.sync_enabled_of_me() from anon;

alter table public.vault_keys enable row level security;
create policy vault_keys_select_own on public.vault_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy vault_keys_insert_own on public.vault_keys
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.sync_enabled_of_me()));
create policy vault_keys_update_own on public.vault_keys
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- No delete policy: clear_vault() and turning the copy off remove it.

alter table public.vault_rows enable row level security;
create policy vault_rows_select_own on public.vault_rows
  for select to authenticated using (user_id = (select auth.uid()));
create policy vault_rows_insert_own on public.vault_rows
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.vault_writable())
    and (public.table_category(tbl) is null or public.category_on(public.table_category(tbl)))
  );
create policy vault_rows_update_own on public.vault_rows
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and (select public.vault_writable())
    and (public.table_category(tbl) is null or public.category_on(public.table_category(tbl)))
  );
create policy vault_rows_delete_own on public.vault_rows
  for delete to authenticated using (user_id = (select auth.uid()));

/**
 * While the copy is encrypted the data key cannot be replaced (the sealed items would become
 * unreadable): only the passphrase wrap may change. A key replaced while it is not encrypted (a
 * set-up started again) makes the items sealed with the old one useless: they go.
 */
create or replace function public.vault_keys_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key_check is distinct from old.key_check
     or new.wrapped_by_recovery is distinct from old.wrapped_by_recovery then
    if public.vault_on_of(old.user_id) then
      raise exception 'the key of an encrypted copy cannot be replaced' using errcode = '55000';
    end if;
    delete from public.vault_rows where user_id = old.user_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger vault_keys_guard before update on public.vault_keys
  for each row execute function public.vault_keys_guard();

-- The sealed photos: a private bucket, each account in its own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault-files', 'vault-files', false, 15728640, null)
on conflict (id) do nothing;

/** May the caller store this sealed file? Its own folder, a key set up, its category kept. */
create or replace function public.vault_file_ok(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (string_to_array(p_name, '/'))[1] = (select auth.uid())::text
    and public.vault_writable()
    and case left((string_to_array(p_name, '/'))[2], 2)
          when 'p-' then public.category_on('photos')
          when 't-' then public.category_on('training')
          else false
        end;
$$;
revoke all on function public.vault_file_ok(text) from public;
grant execute on function public.vault_file_ok(text) to authenticated;
revoke execute on function public.vault_file_ok(text) from anon;

create policy vault_files_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'vault-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy vault_files_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vault-files' and public.vault_file_ok(name));
create policy vault_files_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'vault-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'vault-files' and public.vault_file_ok(name));
create policy vault_files_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'vault-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

/** The caller's wrapped key (null when none is set up). Opens nothing without a secret. */
create or replace function public.my_vault_keys()
returns jsonb
language sql
stable
set search_path = public
as $$
  select to_jsonb(k) - 'user_id' - 'created_at' - 'deleted_at'
  from public.vault_keys k where k.user_id = (select auth.uid());
$$;
revoke all on function public.my_vault_keys() from public;
grant execute on function public.my_vault_keys() to authenticated;
revoke execute on function public.my_vault_keys() from anon;

/** Stores the caller's wrapped key (set up, or a new passphrase). Row level security applies. */
create or replace function public.save_vault_keys(p_record jsonb)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  insert into public.vault_keys as k (kdf, salt, wrapped_by_passphrase, wrapped_by_recovery, key_check)
  values (p_record -> 'kdf', p_record ->> 'salt', p_record ->> 'wrapped_by_passphrase',
          p_record ->> 'wrapped_by_recovery', p_record ->> 'key_check')
  on conflict (user_id) do update
    set kdf = excluded.kdf, salt = excluded.salt,
        wrapped_by_passphrase = excluded.wrapped_by_passphrase,
        wrapped_by_recovery = excluded.wrapped_by_recovery, key_check = excluded.key_check;
end;
$$;
revoke all on function public.save_vault_keys(jsonb) from public;
grant execute on function public.save_vault_keys(jsonb) to authenticated;
revoke execute on function public.save_vault_keys(jsonb) from anon;

/**
 * Push of sealed rows: [{tbl, row_id, updated_at, deleted, ciphertext}]. Per row the newest
 * change wins (the same change twice counts once; a deletion wins over changes made before it).
 * Runs as the caller: row level security applies.
 */
create or replace function public.vault_push(p_rows jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  if jsonb_array_length(coalesce(p_rows, '[]')) > 500 then
    raise exception 'at most 500 items at a time' using errcode = '54000';
  end if;
  insert into public.vault_rows as v (tbl, row_id, updated_at, deleted, ciphertext)
  select r.tbl, r.row_id, r.updated_at, coalesce(r.deleted, false),
         case when coalesce(r.deleted, false) then null else r.ciphertext end
  from jsonb_to_recordset(coalesce(p_rows, '[]')) as r(
    tbl text, row_id text, updated_at timestamptz, deleted boolean, ciphertext text)
  on conflict (user_id, tbl, row_id) do update
    set updated_at = excluded.updated_at, deleted = excluded.deleted,
        ciphertext = excluded.ciphertext
    where v.updated_at < excluded.updated_at
       or (excluded.deleted and not v.deleted and v.updated_at <= excluded.updated_at);
end;
$$;
revoke all on function public.vault_push(jsonb) from public;
grant execute on function public.vault_push(jsonb) to authenticated;
revoke execute on function public.vault_push(jsonb) from anon;

/** Pull of sealed rows stored after `p_since` (the server's clock), with the new cursor. */
create or replace function public.vault_pull(p_since timestamptz)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'now', to_jsonb(clock_timestamp()),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'tbl', v.tbl, 'row_id', v.row_id, 'updated_at', v.updated_at, 'deleted', v.deleted,
        'ciphertext', v.ciphertext) order by v.server_at), '[]'::jsonb)
      from public.vault_rows v where v.user_id = uid and v.server_at > p_since));
end;
$$;
revoke all on function public.vault_pull(timestamptz) from public;
grant execute on function public.vault_pull(timestamptz) to authenticated;
revoke execute on function public.vault_pull(timestamptz) from anon;

/** "Check sync" with an encrypted copy: how many live sealed rows per table. */
create or replace function public.vault_counts()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.tbl, t.n), '{}'::jsonb)
  from (select v.tbl, count(*) as n from public.vault_rows v
        where v.user_id = (select auth.uid()) and not v.deleted group by v.tbl) t;
$$;
revoke all on function public.vault_counts() from public;
grant execute on function public.vault_counts() to authenticated;
revoke execute on function public.vault_counts() from anon;

/**
 * Turns the encryption of the caller's copy on or off. On: the sealed copy must be there already
 * (the app uploads it first); the readable copy is then deleted in the same transaction (the
 * files go through the storage API). Off: readable writes are allowed again; the app uploads the
 * readable copy, then calls clear_vault().
 */
create or replace function public.set_vault(p_on boolean)
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
  if p_on is null then
    raise exception 'p_on must be true or false' using errcode = '22023';
  end if;
  if not public.sync_enabled_of(uid) then
    raise exception 'Keep a copy on the server is off' using errcode = '55000';
  end if;
  if p_on and not exists (select 1 from public.vault_keys k where k.user_id = uid) then
    raise exception 'set up the key first' using errcode = '55000';
  end if;
  update public.account_sync set encrypted = p_on, updated_at = now() where user_id = uid;
  if p_on then
    perform public.clear_my_online_data();
    update public.profiles set updated_at = 'epoch' where id = uid;
    update public.user_settings set updated_at = 'epoch' where user_id = uid;
  end if;
end;
$$;
revoke all on function public.set_vault(boolean) from public;
grant execute on function public.set_vault(boolean) to authenticated;
revoke execute on function public.set_vault(boolean) from anon;

/** After encryption was turned off and the readable copy uploaded: the sealed copy goes. */
create or replace function public.clear_vault()
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
  if public.vault_on_of(uid) then
    raise exception 'the copy is still encrypted' using errcode = '55000';
  end if;
  delete from public.vault_rows where user_id = uid;
  delete from public.vault_keys where user_id = uid;
end;
$$;
revoke all on function public.clear_vault() from public;
grant execute on function public.clear_vault() to authenticated;
revoke execute on function public.clear_vault() from anon;

/** The caller's copy: {enabled, categories, encrypted, vault (a key is set up)}. */
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
                '["body", "diet", "training", "photos"]'::jsonb),
    'encrypted', coalesce((select s.encrypted from public.account_sync s
                where s.user_id = (select auth.uid()) and s.deleted_at is null), false),
    'vault', exists (select 1 from public.vault_keys k where k.user_id = (select auth.uid()))
  );
$$;

-- Turning the copy off also deletes the sealed copy and the key.
create or replace function public.set_sync(p_enabled boolean)
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
  if p_enabled is null then
    raise exception 'p_enabled must be true or false' using errcode = '22023';
  end if;
  insert into public.account_sync (user_id, enabled)
  values (uid, p_enabled)
  on conflict (user_id) do update
    set enabled = excluded.enabled, updated_at = now(), deleted_at = null;
  if not p_enabled then
    perform public.clear_my_online_data();
    update public.profiles set updated_at = 'epoch' where id = uid;
    update public.user_settings set updated_at = 'epoch' where user_id = uid;
    update public.account_sync set encrypted = false where user_id = uid;
    delete from public.vault_rows where user_id = uid;
    delete from public.vault_keys where user_id = uid;
  end if;
end;
$$;

-- A category turned off also leaves the sealed copy.
create or replace function public.clear_category(p_user uuid, p_category text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.vault_rows
    where user_id = p_user and public.table_category(tbl) = p_category;
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

-- Personal tokens read and write the readable copy: none while it is end-to-end encrypted.
create or replace function public.create_api_token(p_name text, p_scope text default 'write')
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  token text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.sync_enabled_of(uid) then
    raise exception 'Keep a copy on the server is off: the API and AI apps need it'
      using errcode = '55000';
  end if;
  if public.vault_on_of(uid) then
    raise exception 'The copy on the server is end-to-end encrypted: the API and AI apps cannot read it'
      using errcode = '55000';
  end if;
  if coalesce(p_scope, '') not in ('read', 'write') then
    raise exception 'scope must be read or write' using errcode = '22023';
  end if;
  if (select count(*) from public.api_tokens t where t.user_id = uid and t.deleted_at is null) >= 10 then
    raise exception 'at most 10 tokens' using errcode = '54000';
  end if;
  -- Two random UUIDs: 244 random bits.
  token := 'fft_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (user_id, name, prefix, token_hash, scope)
  values (uid, trim(p_name), left(token, 10), encode(sha256(convert_to(token, 'UTF8')), 'hex'), p_scope);
  return token;
end;
$$;
