-- Admin log entries about an account are found by exact matches, never by substring
-- (DECISIONS 86). The export and the deletion looked for the email anywhere in the details with
-- LIKE: "x@gmail.com" also matched "max@gmail.com" (and "_" is a LIKE wildcard), so one account
-- received, or anonymised on deletion, another account's entries.
--
-- admin_audit_about(): the keys admin/server.js writes, compared whole:
--   userId (plan.set, password.temporary), email (password.temporary), id and q (the parameters of
--   GET /api/user?id= and GET /api/users?q=, logged as read.*), and the row actions' pk / values /
--   set (row.reveal, row.update, row.insert, row.delete) by their id, user_id, owner_id or email.
-- text_names(): free text (the SQL of an admin query, a note) names the id or the email as a whole
--   token: not preceded or followed by a character that could be part of an address.
--
-- The export returns the matching entries without the admin's IP address and without SQL text (an
-- admin query can name other people); the deletion also anonymises entries whose free text names
-- the account as a whole token.

create or replace function public.text_names(p_text text, p_needle text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_needle, '') <> '' and p_text is not null
    and p_text ~* (
      '(^|[^a-z0-9._%+-])'
      || regexp_replace(p_needle, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')
      || '($|[^a-z0-9_%+.-]|\.($|[^a-z0-9_-]))');
$$;
revoke all on function public.text_names(text, text) from public;

create or replace function public.admin_audit_about(p_detail jsonb, p_uid uuid, p_mail text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_detail is not null and jsonb_typeof(p_detail) = 'object' and (
    (p_uid is not null and p_uid::text in (
       p_detail ->> 'userId', p_detail ->> 'user_id', p_detail ->> 'id', p_detail ->> 'q',
       p_detail -> 'pk' ->> 'id', p_detail -> 'pk' ->> 'user_id',
       p_detail -> 'values' ->> 'id', p_detail -> 'values' ->> 'user_id',
       p_detail -> 'values' ->> 'owner_id',
       p_detail -> 'set' ->> 'user_id', p_detail -> 'set' ->> 'owner_id'))
    or (coalesce(p_mail, '') <> '' and lower(p_mail) in (
       lower(p_detail ->> 'email'), lower(trim(p_detail ->> 'q')),
       lower(p_detail -> 'pk' ->> 'email'), lower(p_detail -> 'values' ->> 'email'),
       lower(p_detail -> 'set' ->> 'email')))
  );
$$;
revoke all on function public.admin_audit_about(jsonb, uuid, text) from public;

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
      -- Exact matches only; never the admin's IP address or the text of an admin query.
      select coalesce(jsonb_agg(jsonb_build_object(
        'created_at', l.created_at, 'action', l.action,
        'detail', case when jsonb_typeof(l.detail) = 'object' then l.detail - 'ip' - 'sql' end)
        order by l.created_at), '[]')
      from public.admin_audit l
      where public.admin_audit_about(l.detail, uid, mail)
         or (l.action in ('sql', 'read.sql')
             and (public.text_names(l.detail ->> 'sql', uid::text)
                  or public.text_names(l.detail ->> 'sql', mail))))
  );
end;
$$;
revoke all on function public.export_my_account() from public;
grant execute on function public.export_my_account() to authenticated;
revoke execute on function public.export_my_account() from anon;

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
  -- Entries about the account (exact keys), and entries whose free text names it as a whole
  -- token; never entries that only contain it inside a longer address.
  update public.admin_audit a
  set detail = jsonb_build_object('account', 'deleted')
  where public.admin_audit_about(a.detail, old.id, mail)
     or public.text_names(a.detail::text, old.id::text)
     or public.text_names(a.detail::text, mail);
  return old;
end;
$$;
revoke all on function public.log_account_deletion() from public;
