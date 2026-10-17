-- Read only or read and write (DECISIONS 59): every personal token and every connected AI app
-- (OAuth) has a permission. 'read' can only call the tools that do not change data; 'write' can do
-- everything, as before. Existing tokens and connections keep 'write', so nothing breaks.

alter table public.api_tokens
  add column scope text not null default 'write' check (scope in ('read', 'write'));

-- The permission chosen on the sign-in page travels with the one-time code to the connection.
alter table public.oauth_codes
  add column scope text not null default 'write' check (scope in ('read', 'write'));

-- New argument: drop the old signature (a second overload would make p_name-only calls
-- ambiguous). Calls with p_name only (older apps) still work through the default.
drop function if exists public.create_api_token(text);

/** Makes a token for the caller with the given permission and returns it (shown once). */
create function public.create_api_token(p_name text, p_scope text default 'write')
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
revoke all on function public.create_api_token(text, text) from public;
grant execute on function public.create_api_token(text, text) to authenticated;
revoke execute on function public.create_api_token(text, text) from anon;

/**
 * Server only: the user and the permission of a live token (no row otherwise). Notes when it was
 * last used (at most once a minute). The api service uses this one.
 */
create or replace function public.api_token_access(p_hash text)
returns table (user_id uuid, scope text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.api_tokens;
begin
  select * into t from public.api_tokens
  where token_hash = p_hash and deleted_at is null
    and (expires_at is null or expires_at > now());
  if t.id is null then
    return;
  end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = t.id;
  end if;
  user_id := t.user_id;
  scope := t.scope;
  return next;
end;
$$;
revoke all on function public.api_token_access(text) from public;
revoke execute on function public.api_token_access(text) from anon, authenticated;

-- Kept for a server still running the previous version during a deploy: the user only.
create or replace function public.api_token_user(p_hash text)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select a.user_id from public.api_token_access(p_hash) a;
$$;
revoke all on function public.api_token_user(text) from public;
revoke execute on function public.api_token_user(text) from anon, authenticated;
