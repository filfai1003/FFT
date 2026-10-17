-- Encrypted relay between phones, no copy on the server (DECISIONS 65). For accounts that do NOT
-- keep a copy on the server: their phones exchange changes through the server, end-to-end
-- encrypted with a key that never reaches it (it travels from phone to phone in a QR code), and
-- the server deletes each message as soon as the phone it is for has received it (and anything
-- older than 30 days anyway: server/index.js cleanup()).
-- * relay_devices: the account's paired phones (a random id and a name);
-- * relay_messages: sealed messages from one phone to another (rows or a photo). The server sees
--   only the account, the two phone ids, the size and the time.
-- The relay and the copy on the server exclude each other: the relay needs the copy off, and
-- turning the copy on ends the relay (its phones and messages are deleted).

create table public.relay_devices (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  device_id    text not null check (device_id ~ '^[0-9a-f-]{36}$'),
  name         text not null check (length(trim(name)) between 1 and 60),
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  primary key (user_id, device_id)
);

create table public.relay_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  to_device   text not null,
  from_device text not null,
  -- Sealed (base64). At most about 6 MB of content: rows in batches, or one photo.
  payload     text not null check (length(payload) <= 8000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index relay_messages_inbox_idx on public.relay_messages (user_id, to_device, created_at);
create index relay_messages_age_idx on public.relay_messages (created_at);

/** May the caller use the relay? Signed in, and it chose not to keep a copy on the server. */
create or replace function public.relay_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_sync s
    where s.user_id = (select auth.uid()) and not s.enabled and s.deleted_at is null
  );
$$;
revoke all on function public.relay_allowed() from public;
grant execute on function public.relay_allowed() to authenticated;
revoke execute on function public.relay_allowed() from anon;

/** Is this one of the caller's paired phones? */
create or replace function public.relay_device_mine(p_device text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.relay_devices d
    where d.user_id = (select auth.uid()) and d.device_id = p_device
  );
$$;
revoke all on function public.relay_device_mine(text) from public;
grant execute on function public.relay_device_mine(text) to authenticated;
revoke execute on function public.relay_device_mine(text) from anon;

alter table public.relay_devices enable row level security;
create policy relay_devices_select_own on public.relay_devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy relay_devices_insert_own on public.relay_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.relay_allowed()));
create policy relay_devices_update_own on public.relay_devices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select public.relay_allowed()));
create policy relay_devices_delete_own on public.relay_devices
  for delete to authenticated using (user_id = (select auth.uid()));

alter table public.relay_messages enable row level security;
create policy relay_messages_select_own on public.relay_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy relay_messages_insert_own on public.relay_messages
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and (select public.relay_allowed())
    and public.relay_device_mine(to_device) and public.relay_device_mine(from_device)
    and to_device <> from_device
  );
create policy relay_messages_delete_own on public.relay_messages
  for delete to authenticated using (user_id = (select auth.uid()));
-- No update: a message is written once and deleted once delivered.

/** At most 10 phones per account. */
create or replace function public.relay_devices_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.relay_devices d where d.user_id = new.user_id) >= 10 then
    raise exception 'at most 10 paired phones' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger relay_devices_limit before insert on public.relay_devices
  for each row execute function public.relay_devices_limit();

/** What waits for an account: at most 5000 messages and 300 MB (a phone that never comes back). */
create or replace function public.relay_messages_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
  bytes bigint;
begin
  select count(*), coalesce(sum(length(m.payload)), 0) into n, bytes
    from public.relay_messages m where m.user_id = new.user_id;
  if n >= 5000 or bytes + length(new.payload) > 300000000 then
    raise exception 'too much waiting for your other phones: open FFT on them' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger relay_messages_limit before insert on public.relay_messages
  for each row execute function public.relay_messages_limit();

/** Pairs this phone (or renames it, and notes it was seen). */
create or replace function public.relay_register(p_device text, p_name text)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  insert into public.relay_devices as d (device_id, name, last_seen_at)
  values (p_device, left(trim(p_name), 60), now())
  on conflict (user_id, device_id) do update
    set name = excluded.name, last_seen_at = now(), updated_at = now();
end;
$$;
revoke all on function public.relay_register(text, text) from public;
grant execute on function public.relay_register(text, text) to authenticated;
revoke execute on function public.relay_register(text, text) from anon;

/** The caller's paired phones. */
create or replace function public.relay_list()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'device_id', d.device_id, 'name', d.name, 'last_seen_at', d.last_seen_at,
      'created_at', d.created_at) order by d.created_at), '[]'::jsonb)
  from public.relay_devices d where d.user_id = (select auth.uid());
$$;
revoke all on function public.relay_list() from public;
grant execute on function public.relay_list() to authenticated;
revoke execute on function public.relay_list() from anon;

/** Unpairs a phone: it gets nothing more, and what waited for it is deleted. */
create or replace function public.relay_remove(p_device text)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  delete from public.relay_messages where to_device = p_device or from_device = p_device;
  delete from public.relay_devices where device_id = p_device;
end;
$$;
revoke all on function public.relay_remove(text) from public;
grant execute on function public.relay_remove(text) to authenticated;
revoke execute on function public.relay_remove(text) from anon;

/** Sends sealed messages: [{to, from, payload}], at most 50 at a time. */
create or replace function public.relay_send(p_messages jsonb)
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  if jsonb_array_length(coalesce(p_messages, '[]')) > 50 then
    raise exception 'at most 50 messages at a time' using errcode = '54000';
  end if;
  insert into public.relay_messages (to_device, from_device, payload)
  select m."to", m."from", m.payload
  from jsonb_to_recordset(coalesce(p_messages, '[]')) as m("to" text, "from" text, payload text);
end;
$$;
revoke all on function public.relay_send(jsonb) from public;
grant execute on function public.relay_send(jsonb) to authenticated;
revoke execute on function public.relay_send(jsonb) from anon;

/** What waits for this phone (oldest first, at most p_limit), and notes it was seen. */
create or replace function public.relay_fetch(p_device text, p_limit int default 20)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
begin
  update public.relay_devices set last_seen_at = now() where device_id = p_device;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'from', m.from_device, 'payload', m.payload) order by m.created_at), '[]'::jsonb)
    from (select * from public.relay_messages
          where to_device = p_device order by created_at limit least(greatest(p_limit, 1), 100)) m);
end;
$$;
revoke all on function public.relay_fetch(text, int) from public;
grant execute on function public.relay_fetch(text, int) to authenticated;
revoke execute on function public.relay_fetch(text, int) from anon;

/** This phone received these messages: the server deletes them at once. */
create or replace function public.relay_ack(p_device text, p_ids uuid[])
returns void
language plpgsql
volatile
set search_path = public
as $$
begin
  delete from public.relay_messages where to_device = p_device and id = any (p_ids);
end;
$$;
revoke all on function public.relay_ack(text, uuid[]) from public;
grant execute on function public.relay_ack(text, uuid[]) to authenticated;
revoke execute on function public.relay_ack(text, uuid[]) from anon;

-- Turning the copy on ends the relay: its phones and what waited for them are deleted.
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
  if p_enabled then
    delete from public.relay_messages where user_id = uid;
    delete from public.relay_devices where user_id = uid;
  else
    perform public.clear_my_online_data();
    update public.profiles set updated_at = 'epoch' where id = uid;
    update public.user_settings set updated_at = 'epoch' where user_id = uid;
    update public.account_sync set encrypted = false where user_id = uid;
    delete from public.vault_rows where user_id = uid;
    delete from public.vault_keys where user_id = uid;
  end if;
end;
$$;
