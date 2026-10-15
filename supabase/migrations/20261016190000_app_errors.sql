-- Automatic error reporting without an external service: the app sends its crashes and failures
-- here (report_error), the admin panel groups them (Errors tab). Only the error itself is sent:
-- message, stack, where it happened, platform and app version; no user data.

create table public.app_errors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,
  -- Same message and same first stack lines = same problem (grouped in the admin panel).
  fingerprint text not null,
  kind        text not null,
  message     text not null,
  stack       text,
  context     jsonb,
  platform    text,
  app_version text,
  update_id   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index app_errors_fingerprint_idx on public.app_errors (fingerprint, created_at desc);
create index app_errors_created_idx on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

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
