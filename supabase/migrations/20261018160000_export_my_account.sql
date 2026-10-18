-- The export (Privacy & data > Export) also holds what the server keeps about the account
-- itself, not only the synced tables (DECISIONS 83): the email and sign-in dates, plan, AI credit
-- and usage, API tokens and connected AI apps (never their hashes), the server copy settings,
-- the consent state, paired phones, the error reports sent while signed in, the password reset
-- requests for the email, and the admin log entries that name the account.

create or replace function public.export_my_account()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mail text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select lower(u.email) into mail from auth.users u where u.id = uid;
  return jsonb_build_object(
    'account', (
      -- Only these fields of the auth record (never the password hash or tokens).
      select jsonb_build_object(
        'id', x ->> 'id', 'email', x ->> 'email', 'created_at', x -> 'created_at',
        'last_sign_in_at', x -> 'last_sign_in_at')
      from (select to_jsonb(u) as x from auth.users u where u.id = uid) s),
    'plan', (select coalesce(jsonb_agg(to_jsonb(p) - 'user_id'), '[]') from public.user_plans p where p.user_id = uid),
    'ai_credit', (select to_jsonb(c) - 'user_id' from public.ai_credit c where c.user_id = uid),
    'ai_usage', (
      select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at), '[]')
      from public.ai_usage a where a.user_id = uid),
    'api_tokens', (
      select coalesce(jsonb_agg(
        to_jsonb(t) - 'user_id' - 'token_hash' - 'refresh_hash' - 'prev_refresh_hash'
        order by t.created_at), '[]')
      from public.api_tokens t where t.user_id = uid),
    'server_copy', (select to_jsonb(s) - 'user_id' from public.account_sync s where s.user_id = uid),
    'consent_state', (select to_jsonb(c) - 'user_id' from public.account_consent c where c.user_id = uid),
    'end_to_end_encryption_key_set', exists (
      select 1 from public.vault_keys k where k.user_id = uid and k.deleted_at is null),
    'paired_phones', (
      select coalesce(jsonb_agg(to_jsonb(d) - 'user_id'), '[]')
      from public.relay_devices d where d.user_id = uid),
    'error_reports', (
      select coalesce(jsonb_agg(to_jsonb(e) - 'user_id' order by e.created_at), '[]')
      from public.app_errors e where e.user_id = uid),
    'password_reset_requests', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]')
      from public.password_reset_requests r where mail is not null and r.email = mail),
    'admin_log_entries', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'created_at', l.created_at, 'action', l.action, 'detail', l.detail) order by l.created_at), '[]')
      from public.admin_audit l
      where l.detail::text like '%' || uid::text || '%'
         or (mail is not null and lower(l.detail::text) like '%' || mail || '%'))
  );
end;
$$;
revoke all on function public.export_my_account() from public;
grant execute on function public.export_my_account() to authenticated;
revoke execute on function public.export_my_account() from anon;
