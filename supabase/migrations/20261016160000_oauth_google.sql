-- Sign in with Google for AI apps (MCP): while the user is on Google, the app's request waits here
-- (a few minutes), with the PKCE verifier the api service uses to get the Google sign-in from the
-- auth service. Only the api service touches it (row level security on, no policy).

create table public.oauth_pending (
  id             text primary key,
  client_id      text not null references public.oauth_clients (id) on delete cascade,
  redirect_uri   text not null,
  state          text,
  code_challenge text not null,
  verifier       text not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
alter table public.oauth_pending enable row level security;
revoke all on public.oauth_pending from anon, authenticated;
