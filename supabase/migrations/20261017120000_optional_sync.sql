-- Keep a copy on the server is optional (DECISIONS 62). Every account keeps all its data on the
-- device; the copy on the server (sync, web app, API and MCP, a new phone finds everything) is now
-- a choice made explicitly by the user:
-- * no row      = not decided yet (new accounts): the app asks, nothing is stored meanwhile;
-- * enabled     = the device syncs with the server (accounts that existed before this: they
--                 already had a copy on the server, so they keep it);
-- * not enabled = the server keeps the account only (email, password, the empty profile and
--                 settings every account has); set_sync(false) deleted the rest.
-- Not a synced table: devices never push it; only set_sync() writes it.

create table public.account_sync (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  enabled    boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.account_sync enable row level security;
create policy account_sync_select_own on public.account_sync
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert, update or delete policy: users change it only through set_sync().

-- Accounts that exist today already sync: they keep their copy on the server.
insert into public.account_sync (user_id, enabled)
select u.id, true from auth.users u
on conflict (user_id) do nothing;

/** Server only (api service, OAuth sign-in): does this account keep a copy on the server? */
create or replace function public.sync_enabled_of(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.enabled from public.account_sync s
    where s.user_id = p_user and s.deleted_at is null
  ), false);
$$;
revoke all on function public.sync_enabled_of(uuid) from public;
revoke execute on function public.sync_enabled_of(uuid) from anon, authenticated;

/** The caller's choice: true, false, or null when not decided yet. */
create or replace function public.my_sync()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.enabled from public.account_sync s
  where s.user_id = (select auth.uid()) and s.deleted_at is null;
$$;
revoke all on function public.my_sync() from public;
grant execute on function public.my_sync() to authenticated;
revoke execute on function public.my_sync() from anon;

-- "Can keep data online" (the name the row level security rules use since 20261014120000): now
-- only accounts that chose to keep a copy on the server. Writes to the synced tables and to the
-- photo buckets are refused otherwise; reading and deleting stay allowed.
create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_sync s
    where s.user_id = (select auth.uid()) and s.enabled and s.deleted_at is null
  );
$$;

/**
 * Turns the copy on the server on or off for the caller. Off deletes, in the same transaction,
 * every row of the caller's data on the server (clear_my_online_data: all synced tables and the
 * tombstones), keeping the account, its empty profile and settings. The files in the
 * progress-photos and user-exercise-images buckets are removed by the app through the storage
 * API (Supabase does not allow deleting storage objects from SQL). Cannot be undone.
 * The empty profile and settings get an updated_at of 1970, so that when the copy is turned on
 * again the device's own rows (always newer) win: they are not replaced by empty ones.
 */
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
  end if;
end;
$$;
revoke all on function public.set_sync(boolean) from public;
grant execute on function public.set_sync(boolean) to authenticated;
revoke execute on function public.set_sync(boolean) from anon;

-- Personal tokens read and write the copy on the server: none without it.
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
