-- An error report from a phone that still has the session of a deleted account (the sign-in token
-- stays valid up to an hour) is stored without the account id (DECISIONS 86): the account's
-- reports went with it (DECISIONS 85), and a later one must not bring its id back.
-- Same function as in 20261016190000_app_errors.sql otherwise.

create or replace function public.report_error(
  p_kind text,
  p_message text,
  p_stack text default null,
  p_context jsonb default null,
  p_platform text default null,
  p_app_version text default null,
  p_update_id text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  msg text := left(coalesce(nullif(trim(p_message), ''), '(no message)'), 1000);
  st text := left(p_stack, 8000);
begin
  -- The account no longer exists: the report is kept as an account-less one.
  if uid is not null and not exists (select 1 from auth.users u where u.id = uid) then
    uid := null;
  end if;
  -- Quietly ignored past the limits: 30 an hour per account (or for all account-less phones
  -- together, 300), 3000 an hour in all. Kept 60 days.
  if (select count(*) from public.app_errors
      where created_at > now() - interval '1 hour'
        and user_id is not distinct from uid) >= (case when uid is null then 300 else 30 end)
     or (select count(*) from public.app_errors where created_at > now() - interval '1 hour') >= 3000
  then
    return;
  end if;
  if random() < 0.01 then
    delete from public.app_errors where created_at < now() - interval '60 days';
  end if;
  insert into public.app_errors
    (user_id, fingerprint, kind, message, stack, context, platform, app_version, update_id)
  values (
    uid,
    md5(left(coalesce(p_kind, ''), 40) || '|' || regexp_replace(msg, '[0-9a-f]{8}-[0-9a-f-]{27}|[0-9]+', '#', 'gi')
        || '|' || regexp_replace(
             coalesce(array_to_string((regexp_split_to_array(coalesce(st, ''), E'\n'))[1:3], E'\n'), ''),
             '[0-9]+', '#', 'g')),
    left(coalesce(p_kind, 'error'), 40),
    msg,
    st,
    case when p_context is null or length(p_context::text) > 4000 then null else p_context end,
    left(p_platform, 40),
    left(p_app_version, 40),
    left(p_update_id, 80)
  );
end;
$$;

revoke all on function public.report_error(text, text, text, jsonb, text, text, text) from public;
grant execute on function public.report_error(text, text, text, jsonb, text, text, text)
  to anon, authenticated;
