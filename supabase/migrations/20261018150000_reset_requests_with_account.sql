-- Forgotten password requests (DECISIONS 81): they hold an email address and a free note, sent
-- without an account. They now go 30 days after they were SENT (handled or not; before, a request
-- never handled stayed for ever: server/index.js cleanup), and with the account: deleting an
-- account deletes the requests made for its email address (linked by the email at that moment).

create or replace function public.log_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deleted_accounts (user_id) values (old.id)
  on conflict (user_id) do update set deleted_at = now();
  if old.email is not null then
    delete from public.password_reset_requests r where r.email = lower(trim(old.email));
  end if;
  return old;
end;
$$;
revoke all on function public.log_account_deletion() from public;
