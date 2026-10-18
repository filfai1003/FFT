-- Deleting an account leaves nothing (DECISIONS 84). Every table with a foreign key to auth.users
-- already cascades; these have none and are handled when the account row is deleted:
-- * app_errors: the error reports sent while signed in (user_id, no key: reports are sent
--   before sign-in too) go with the account;
-- * admin_audit: the entries naming the account (its id or email in the details) keep their
--   action and time, the details are replaced by "account deleted";
-- * oauth_clients: an AI app registration used only by this account goes with it (one used by
--   others stays: it is the app's, not the person's);
-- * password_reset_requests: already deleted by email (DECISIONS 81).
-- deleted_accounts keeps the id on purpose (DECISIONS 79). verify/db.test.mjs checks all of it
-- and fails when a new table holds user data that deletion does not reach.

create or replace function public.before_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.oauth_clients c
  where exists (select 1 from public.api_tokens t where t.client_id = c.id and t.user_id = old.id)
    and not exists (select 1 from public.api_tokens t where t.client_id = c.id and t.user_id <> old.id)
    and not exists (select 1 from public.oauth_codes k where k.client_id = c.id and k.user_id <> old.id);
  return old;
end;
$$;
revoke all on function public.before_account_deletion() from public;

create trigger auth_users_before_deletion
  before delete on auth.users
  for each row execute function public.before_account_deletion();

create or replace function public.log_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mail text := lower(trim(coalesce(old.email, '')));
begin
  insert into public.deleted_accounts (user_id) values (old.id)
  on conflict (user_id) do update set deleted_at = now();
  if mail <> '' then
    delete from public.password_reset_requests r where r.email = mail;
  end if;
  delete from public.app_errors e where e.user_id = old.id;
  update public.admin_audit a
  set detail = jsonb_build_object('account', 'deleted')
  where a.detail::text like '%' || old.id::text || '%'
     or (mail <> '' and lower(a.detail::text) like '%' || mail || '%');
  return old;
end;
$$;
revoke all on function public.log_account_deletion() from public;
