-- Connected AI apps (OAuth, server/oauth.js): how long a connection lives and where it sends the
-- user back (DECISIONS 74).
--
-- redirect_host: the host the app receives its sign-in codes on (claude.ai, chatgpt.com, or a
--   program on the user's computer: localhost), so the app can show the user where each
--   connection goes. Null for personal tokens.
-- refresh_expires_at: the refresh token stops working after 30 days without use (renewed at each
--   use).
-- ends_at: the connection ends at this time in any case (90 days after the sign-in).
-- prev_refresh_hash: the refresh token replaced at the last renewal. It is never valid again: if it
--   comes back, someone kept a copy, and the connection is ended.

alter table public.api_tokens
  add column redirect_host text,
  add column refresh_expires_at timestamptz,
  add column ends_at timestamptz,
  add column prev_refresh_hash text;

create index api_tokens_prev_refresh_idx on public.api_tokens (prev_refresh_hash)
  where prev_refresh_hash is not null;

-- Live connections made before this change keep working: their 30 and 90 days start now, and
-- they get the host of their app's first address.
update public.api_tokens t
set refresh_expires_at = now() + interval '30 days',
    ends_at = now() + interval '90 days',
    redirect_host = substring(c.redirect_uris[1] from '^https?://(\[::1\]|[^/:]+)')
from public.oauth_clients c
where t.client_id = c.id and t.deleted_at is null;

-- When each app registered (the server limits registrations per hour).
create index oauth_clients_created_idx on public.oauth_clients (created_at);
