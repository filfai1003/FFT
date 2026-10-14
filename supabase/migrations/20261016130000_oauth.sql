-- Sign in with FFT for AI apps (Claude, ChatGPT…): OAuth 2.1 for the MCP server, so a user adds
-- FFT as a connector by its address and signs in, instead of copying a token.
--
-- Only the api service touches these tables (it owns them: row level security is on, with no
-- policy, so no user can read or write them). A connection is an api_tokens row, like a personal
-- token: it shows in the app's token list and can be revoked there.

-- Apps that registered themselves (dynamic client registration, RFC 7591).
create table public.oauth_clients (
  id            text primary key,
  name          text not null,
  redirect_uris text[] not null,
  -- Only for apps that asked for a secret (client_secret_post / basic); public apps use PKCE alone.
  secret_hash   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
alter table public.oauth_clients enable row level security;
revoke all on public.oauth_clients from anon, authenticated;

-- One-time codes between the sign-in page and the token request (PKCE, a few minutes).
create table public.oauth_codes (
  code_hash      text primary key,
  client_id      text not null references public.oauth_clients (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
alter table public.oauth_codes enable row level security;
revoke all on public.oauth_codes from anon, authenticated;

-- A connection = a token row: the access token expires, the refresh token renews it.
alter table public.api_tokens
  add column client_id text references public.oauth_clients (id) on delete cascade,
  add column refresh_hash text unique,
  add column expires_at timestamptz;

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
  where token_hash = p_hash and deleted_at is null
    and (expires_at is null or expires_at > now());
  if t.id is null or public.plan_of(t.user_id) not in ('supporter', 'premium') then
    return null;
  end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = t.id;
  end if;
  return t.user_id;
end;
$$;
revoke all on function public.api_token_user(text) from public;
revoke execute on function public.api_token_user(text) from anon, authenticated;
