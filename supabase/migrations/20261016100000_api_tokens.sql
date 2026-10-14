-- Personal API tokens (Supporter and Premium): the REST API (/v1) and the MCP server (/mcp) of the
-- api service read and write the user's online data with one of these instead of a sign-in.
--
-- The token is made here and shown once (the app shows it, the user copies it); only its SHA-256
-- is stored. The api service turns a token into a user with api_token_user() (server only) and
-- then runs every query as that user, so the usual row level security applies.

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 60),
  -- The first characters of the token, so the user can tell their tokens apart.
  prefix       text not null,
  token_hash   text not null unique,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Revoked tokens stop working at once.
  deleted_at   timestamptz
);
create index api_tokens_user_idx on public.api_tokens (user_id);
create trigger api_tokens_updated_at before update on public.api_tokens
  for each row execute function public.set_updated_at();

alter table public.api_tokens enable row level security;
-- Users see their tokens (never the token itself: only its hash is here). Changes go through
-- the functions below.
create policy api_tokens_select_own on public.api_tokens
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.api_tokens from anon;
revoke insert, update, delete on public.api_tokens from authenticated;

/** Makes a token for the caller and returns it (the only time it can be read). */
create or replace function public.create_api_token(p_name text)
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
  if public.plan_of(uid) not in ('supporter', 'premium') then
    raise exception 'API tokens are part of Supporter and Premium' using errcode = '42501';
  end if;
  if (select count(*) from public.api_tokens t where t.user_id = uid and t.deleted_at is null) >= 10 then
    raise exception 'at most 10 tokens' using errcode = '54000';
  end if;
  -- Two random UUIDs: 244 random bits.
  token := 'fft_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (user_id, name, prefix, token_hash)
  values (uid, trim(p_name), left(token, 10), encode(sha256(convert_to(token, 'UTF8')), 'hex'));
  return token;
end;
$$;

/** Revokes (or, for UNDO, restores) one of the caller's tokens. */
create or replace function public.set_api_token_revoked(p_id uuid, p_revoked boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.api_tokens
  set deleted_at = case when p_revoked then now() else null end
  where id = p_id and user_id = (select auth.uid());
$$;

/**
 * Server only: the user a token belongs to, when the token is live and the plan still includes
 * the API; null otherwise. Notes when it was last used (at most once a minute).
 */
create or replace function public.api_token_user(p_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.api_tokens;
begin
  select * into t from public.api_tokens
  where token_hash = p_hash and deleted_at is null;
  if t.id is null or public.plan_of(t.user_id) not in ('supporter', 'premium') then
    return null;
  end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = t.id;
  end if;
  return t.user_id;
end;
$$;

revoke all on function public.create_api_token(text) from public;
revoke all on function public.set_api_token_revoked(uuid, boolean) from public;
revoke all on function public.api_token_user(text) from public;
grant execute on function public.create_api_token(text) to authenticated;
grant execute on function public.set_api_token_revoked(uuid, boolean) to authenticated;
revoke execute on function public.create_api_token(text) from anon;
revoke execute on function public.set_api_token_revoked(uuid, boolean) from anon;
revoke execute on function public.api_token_user(text) from anon, authenticated;
