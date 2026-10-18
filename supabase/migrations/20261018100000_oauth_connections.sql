-- Connected AI apps (OAuth, server/oauth.js): how long a connection lives and where it sends the
-- user back (DECISIONS 73).
--
-- redirect_host: the host the app receives its sign-in codes on (claude.ai, chatgpt.com, or a
--   program on the user's computer: localhost), so the app can show the user where each
--   connection goes. Null for personal tokens.
-- refresh_expires_at: the refresh token stops working after 30 days without use (renewed at each
--   use); in any case a connection ends 90 days after the sign-in (created_at).
-- prev_refresh_hash: the refresh token replaced at the last renewal. It is never valid again: if it
--   comes back, someone kept a copy, and the connection is ended.

alter table public.api_tokens
  add column redirect_host text,
  add column refresh_expires_at timestamptz,
  add column prev_refresh_hash text;

create index api_tokens_prev_refresh_idx on public.api_tokens (prev_refresh_hash)
  where prev_refresh_hash is not null;

-- Connections made before the allowlist: an app with any redirect address outside it loses its
-- connections now (the user can sign in again from a supported app).
update public.api_tokens t
set deleted_at = now()
from public.oauth_clients c
where t.client_id = c.id and t.deleted_at is null
  and exists (
    select 1 from unnest(c.redirect_uris) u
    where u !~ '^(https://(claude\.ai|claude\.com|chatgpt\.com|chat\.openai\.com)(/[^#@]*)?|https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?(/[^#@]*)?)$'
  );

-- The others: where their access goes, from the app's first address.
update public.api_tokens t
set redirect_host = substring(c.redirect_uris[1] from '^https?://([^/:]+|\[::1\])')
from public.oauth_clients c
where t.client_id = c.id and t.deleted_at is null;

-- Live connections made before this change start their 30 days now.
update public.api_tokens
set refresh_expires_at = now() + interval '30 days'
where client_id is not null and deleted_at is null;

-- When each app registered (the server limits registrations per hour).
create index oauth_clients_created_idx on public.oauth_clients (created_at);
