-- The deletion log (DECISIONS 80): which accounts were deleted, so that restoring a backup made
-- before a deletion does not bring the account back. Only the account id and the time: no email,
-- no data. Written by a trigger on auth.users, whatever deleted the account (the app's Delete
-- account, the admin panel, the reset). The nightly backup job also copies the list to the
-- backups bucket (deletions/latest.json.enc), so a restore has the deletions made after the dump
-- it loads; backup/reapply-deletions.mjs applies them (docs/DEPLOY.md, Restore a backup).
-- Kept 7 months: longer than the oldest backup (6 months).

create table public.deleted_accounts (
  user_id    uuid primary key,
  -- When the account was deleted.
  deleted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deleting an account deletes its rows through the cascades; their delete triggers used to write
-- a tombstone for an account that no longer exists (refused by the tombstones' foreign key, so
-- the whole deletion failed). Nobody is left to sync: no tombstone then.
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
  if owner is not null and exists (select 1 from auth.users u where u.id = owner) then
    insert into public.sync_tombstones (user_id, table_name, row_id)
    values (owner, tg_table_name, to_jsonb(old) ->> tg_argv[1]);
  end if;
  return old;
end;
$$;
alter table public.deleted_accounts enable row level security;
-- No policy: no user can read or write it; the server and the admin panel only.
revoke all on public.deleted_accounts from anon, authenticated;

create or replace function public.log_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deleted_accounts (user_id) values (old.id)
  on conflict (user_id) do update set deleted_at = now();
  return old;
end;
$$;
revoke all on function public.log_account_deletion() from public;

create trigger auth_users_log_deletion
  after delete on auth.users
  for each row execute function public.log_account_deletion();

/**
 * After a restore: deletes again the accounts in `p_ids` (from the deletion log) that the restored
 * dump still has. Everything they own goes with them (the foreign keys cascade). Returns how many
 * accounts were deleted again. Their files are removed by the script through the storage API.
 */
create or replace function public.reapply_deletions(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from auth.users u where u.id = any (p_ids);
  get diagnostics n = row_count;
  insert into public.deleted_accounts (user_id)
  select unnest(p_ids)
  on conflict (user_id) do nothing;
  return n;
end;
$$;
revoke all on function public.reapply_deletions(uuid[]) from public;
revoke execute on function public.reapply_deletions(uuid[]) from anon, authenticated;
