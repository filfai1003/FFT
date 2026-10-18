-- Error reports keep only what tells a bug apart, never what a user typed (DECISIONS 96).
-- The app now sends only the error's kind and code, SQLSTATE, table or function name, screen and
-- app version (src/lib/error-report.ts). Older apps still send full messages, so the server strips
-- them as well, for every report:
--   message: at most 200 characters; quoted text that is not a plain identifier, e-mail addresses
--            and runs of 4+ digits are replaced ('?', '?@?', '#');
--   stack:   only the stack frame lines ("at fn (file:1:2)" or "fn@file:1:2"), at most 40 and 4000
--            characters: the first line of a JavaScript stack repeats the message;
--   context: only the keys the app uses (table, fn, key, screen, step, widget, via, what, action,
--            code, sqlstate, count, bytes) with numbers or short plain values.
-- Same function as in 20261018191000_report_error_deleted_account.sql otherwise.

create or replace function public.error_report_text(p_text text, p_frame boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(p_text, ''),
              '"[^"]*[^A-Za-z0-9_."][^"]*"|"[^"]{41,}"', '"?"', 'g'),
            '''[^'']*[^A-Za-z0-9_.''][^'']*''|''[^'']{41,}''', '''?''', 'g'),
          case when p_frame then '$^' else '[^\s@''"]+@[^\s@''"]+' end, '?@?', 'g'),
        '\([^)]*\)=\([^)]*\)', '(?)=(?)', 'g'),
      '[0-9]{4,}', '#', 'g'),
    200);
$$;

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
  msg text := coalesce(nullif(trim(public.error_report_text(p_message)), ''), '(no message)');
  st text;
  ctx jsonb;
begin
  select left(string_agg(public.error_report_text(trim(l), true), E'\n' order by n), 4000)
    into st
    from (
      select l, n from regexp_split_to_table(coalesce(p_stack, ''), E'\n') with ordinality as x(l, n)
      where l ~ '^\s*at\s' or l ~ '^[^\s@]*@\S*:[0-9]+(:[0-9]+)?\s*$'
      order by n
      limit 40
    ) frames;

  if jsonb_typeof(p_context) = 'object' then
    select jsonb_object_agg(e.key, e.value) into ctx
      from jsonb_each(p_context) e
     where e.key in ('table', 'fn', 'key', 'screen', 'step', 'widget', 'via', 'what', 'action',
                     'code', 'sqlstate', 'count', 'bytes')
       and (jsonb_typeof(e.value) = 'number'
            or (jsonb_typeof(e.value) = 'string' and e.value #>> '{}' ~ '^[A-Za-z0-9_.:/ -]{0,60}$'));
  end if;

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
    ctx,
    left(p_platform, 40),
    left(p_app_version, 40),
    left(p_update_id, 80)
  );
end;
$$;

revoke all on function public.report_error(text, text, text, jsonb, text, text, text) from public;
grant execute on function public.report_error(text, text, text, jsonb, text, text, text)
  to anon, authenticated;
