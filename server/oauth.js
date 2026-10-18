// Sign in with FFT for AI apps: OAuth 2.1 (authorization code + PKCE, dynamic client registration,
// refresh tokens) as the MCP specification asks. In Claude or ChatGPT the user adds the connector
// by the MCP address; the app finds this server through /.well-known, registers itself, sends
// the user to our sign-in page (FFT email and password), and receives a token. A connection is an
// api_tokens row: it shows in the app's list of connected apps and is revoked there like any token.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ACCESS_DAYS = 7;
/** A refresh token dies after this many days without use (each use renews it). */
const REFRESH_IDLE_DAYS = 30;
/** A connection ends this many days after the sign-in, used or not: sign in again. */
const CONNECTION_MAX_DAYS = 90;
const CODE_MINUTES = 5;
/** Sign-in attempts per address and minute (passwords are not to be guessed). */
const LOGINS_PER_MINUTE = 10;
/** App registrations per address and hour, and from everywhere together per hour. */
const REGISTRATIONS_PER_HOUR = 10;
const REGISTRATIONS_PER_HOUR_ALL = 200;

/**
 * The AI apps whose sign-in FFT supports (DECISIONS 73): a code is only ever sent to these hosts
 * (https, default port), or to a program on the user's own computer (loopback, any port, as
 * desktop apps and Claude Code do). Any other redirect is refused at registration and at sign-in.
 * The owner can add hosts, after checking them, with the OAUTH_REDIRECT_HOSTS variable.
 */
export const TRUSTED_REDIRECT_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com', 'chat.openai.com'];
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];
const isLoopback = (host) => LOOPBACK.includes(host);

/** The host a redirect sends the user to, or null when it is not an approved one. */
export function redirectHost(u, extraHosts = []) {
  let url;
  try {
    url = new URL(String(u));
  } catch {
    return null;
  }
  if (url.hash || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (isLoopback(host)) return ['http:', 'https:'].includes(url.protocol) ? host : null;
  if (url.protocol !== 'https:' || url.port) return null;
  return [...TRUSTED_REDIRECT_HOSTS, ...extraHosts].includes(host) ? host : null;
}

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const secret = (prefix) => `${prefix}${randomBytes(32).toString('hex')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * "read" = read only, "write" = read and write. The user picks on the sign-in page, where Read
 * only is preselected (DECISIONS 73); without a choice (an older page) the connection is read only.
 */
const SCOPES = ['read', 'write'];
const chosenScope = (p) => (SCOPES.includes(p.access) ? p.access : 'read');
const SYNC_OFF =
  'Your FFT data is kept only on your phone, so there is nothing an AI app could use. To connect one, turn on Keep a copy on the server in the FFT app (Profile > Privacy & data), then sign in again.';
const ENCRYPTED =
  'Your copy on the server is end-to-end encrypted: our server cannot read it, so an AI app cannot use it. To connect one, turn the encryption off in the FFT app (Profile > Privacy & data), then sign in again.';

/**
 * The caller's address behind Railway's proxy: the LAST X-Forwarded-For value, the one the proxy
 * added itself (the first ones are whatever the caller sent, so anyone could pick a new one for
 * each try). Same rule as the admin panel.
 */
export function clientIp(forwardedFor, remoteAddress = '') {
  const hops = String(forwardedFor ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return hops.at(-1) ?? String(remoteAddress ?? '');
}

/**
 * Failed sign-ins per account (email), whatever address they come from: after LOCK_AFTER wrong
 * passwords within LOCK_MINUTES the email is locked for LOCK_MINUTES (the app's own sign-in is not
 * affected; this page signs in through the server, so the auth service's limits per address do
 * not see the caller).
 */
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
function lockouts() {
  const seen = new Map();
  const now = () => Date.now();
  return {
    locked(key) {
      const s = seen.get(key);
      return Boolean(s && s.until > now());
    },
    fail(key) {
      let s = seen.get(key);
      if (!s || s.since < now() - LOCK_MINUTES * 60000) s = { since: now(), n: 0, until: 0 };
      s.n += 1;
      if (s.n >= LOCK_AFTER) s.until = now() + LOCK_MINUTES * 60000;
      if (seen.size > 10000) seen.clear();
      seen.set(key, s);
    },
    ok(key) {
      seen.delete(key);
    },
  };
}

/** A counter per key and time window: true once the key went over `max` in the window. */
function limiter(windowMs, max) {
  const seen = new Map();
  return (key) => {
    const slot = Math.floor(Date.now() / windowMs);
    const a = seen.get(key);
    if (!a || a.slot !== slot) {
      if (seen.size > 10000) seen.clear();
      seen.set(key, { slot, n: 1 });
      return false;
    }
    a.n += 1;
    return a.n > max;
  };
}

/**
 * `sql(text, params)` runs as the tables' owner (the api service). `signIn(email, password)`
 * returns the user id or null (any account can connect AI apps). `base` = the public address.
 * `extraRedirectHosts`: hosts the owner approved besides TRUSTED_REDIRECT_HOSTS.
 */
export function createOAuth({ sql, signIn, base, extraRedirectHosts = [] }) {
  const extraHosts = extraRedirectHosts.map((h) => String(h).trim().toLowerCase()).filter(Boolean);
  const hostOf = (u) => redirectHost(u, extraHosts);
  const tooMany = limiter(60000, LOGINS_PER_MINUTE);
  const tooManyRegistrations = limiter(3600000, REGISTRATIONS_PER_HOUR);
  const accounts = lockouts();

  const json = (status, body, headers = {}) => ({
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
    body: JSON.stringify(body),
  });
  const oauthError = (error, description, status = 400) =>
    json(status, { error, error_description: description });

  const metadata = {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: SCOPES,
  };
  const resource = {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'FFT',
  };

  async function register(body, ip) {
    if (tooManyRegistrations(ip))
      return oauthError('temporarily_unavailable', 'too many registrations, try later', 429);
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (uris.length === 0 || uris.length > 10 || !uris.every((u) => hostOf(u) != null))
      return oauthError(
        'invalid_redirect_uri',
        'FFT signs in only supported AI apps (claude.ai, chatgpt.com) or an app on this computer (localhost)',
      );
    const [recent] = await sql(
      `select count(*)::int as n from public.oauth_clients where created_at > now() - interval '1 hour'`,
    );
    if ((recent?.n ?? 0) >= REGISTRATIONS_PER_HOUR_ALL)
      return oauthError('temporarily_unavailable', 'too many registrations, try later', 429);
    const name =
      String(body.client_name ?? 'AI app')
        .trim()
        .slice(0, 60) || 'AI app';
    const method = body.token_endpoint_auth_method ?? 'none';
    if (!metadata.token_endpoint_auth_methods_supported.includes(method))
      return oauthError('invalid_client_metadata', 'unsupported token_endpoint_auth_method');
    const clientId = `fftc_${randomBytes(16).toString('hex')}`;
    const clientSecret = method === 'none' ? null : secret('fftcs_');
    await sql(
      `insert into public.oauth_clients (id, name, redirect_uris, secret_hash) values ($1, $2, $3, $4)`,
      [clientId, name, uris, clientSecret ? sha256(clientSecret) : null],
    );
    return json(201, {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: method,
    });
  }

  async function clientOf(id) {
    const [c] = await sql(
      `select id, name, redirect_uris, secret_hash from public.oauth_clients
       where id = $1 and deleted_at is null`,
      [String(id ?? '')],
    );
    return c ?? null;
  }

  /** The sign-in page (also shown again with a message after a wrong password). */
  function page(p, client, host, message) {
    const hidden = [
      'client_id',
      'redirect_uri',
      'state',
      'code_challenge',
      'code_challenge_method',
      'scope',
      'resource',
    ]
      .map((k) => `<input type="hidden" name="${k}" value="${esc(p[k])}">`)
      .join('');
    // Read only preselected; after a wrong password, what the user picked.
    const access = chosenScope(p);
    const choice = (value, title, detail) =>
      `<label class="opt"><input type="radio" name="access" value="${value}"${access === value ? ' checked' : ''}><span><b>${title}</b><br><span class="muted">${detail}</span></span></label>`;
    const target = new URL(p.redirect_uri);
    // Where the access goes, in plain words: the name is the app's own claim, the host is not.
    const where = isLoopback(host)
      ? `a program on this computer (<b>${esc(target.host)}</b>)`
      : `<b>${esc(host)}</b>`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to FFT</title>
<style>
:root{--bg:#F6F5F2;--surface:#fff;--text:#191917;--muted:#67645E;--border:#E7E4DE;--control:#8A867F;--accent:#D71921;--danger:#B3261E}
@media (prefers-color-scheme:dark){:root{--bg:#121211;--surface:#1C1C1A;--text:#F4F3F0;--muted:#A9A69F;--border:#2E2D2A;--control:#77746D;--danger:#F2867E}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text);font:16px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
main{width:100%;max-width:380px;background:var(--surface);border:1px solid var(--border);border-radius:24px;padding:28px}
h1{font-size:26px;margin:0 0 6px}p{margin:0 0 20px;color:var(--muted)}b{color:var(--text)}
label{display:block;font-size:13px;color:var(--muted);margin:14px 0 6px}
input[type=email],input[type=password]{width:100%;font-size:16px;padding:14px;border:1px solid var(--control);border-radius:14px;background:var(--surface);color:var(--text)}
button{width:100%;margin-top:22px;padding:15px;font-size:16px;font-weight:600;border:0;border-radius:16px;background:var(--accent);color:#fff;cursor:pointer}
.err{color:var(--danger);margin:14px 0 0}
fieldset{border:0;margin:18px 0 0;padding:0}legend{font-size:13px;color:var(--muted);padding:0;margin:0 0 6px}
.opt{display:flex;gap:12px;align-items:flex-start;margin:0 0 8px;padding:12px 14px;min-height:52px;border:1px solid var(--control);border-radius:14px;color:var(--text);font-size:15px;cursor:pointer}
.opt:has(input:checked){border:2px solid var(--text);padding:11px 13px}
.opt input{margin:3px 0 0;width:20px;height:20px;accent-color:var(--text);flex:none}
.muted{color:var(--muted);font-size:14px}
.host{border:1px solid var(--control);border-radius:14px;padding:12px 14px;color:var(--text)}
</style></head><body><main>
<h1>FFT</h1>
<p><b>${esc(client.name)}</b> wants to use your FFT data: training, diet, body and supplements.</p>
<p class="host">If you allow, access to your data goes to ${where}. Continue only if that is where you started connecting FFT.</p>
<form method="post" action="/oauth/authorize">${hidden}
<fieldset><legend>What it can do</legend>
${choice('read', 'Read only', 'Read your data. It cannot change anything.')}
${choice('write', 'Read and write', 'Read your data and add or change entries, goals and plans.')}
</fieldset>
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus value="${esc(p.email)}">
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}
<button type="submit">Sign in and allow</button>
</form></main></body></html>`;
    return {
      status: message ? 400 : 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        // The form posts only here, and its answer redirects only to the app's own address.
        'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${target.origin}; frame-ancestors 'none'`,
        'referrer-policy': 'no-referrer',
      },
      body: html,
    };
  }

  /** Checks an authorization request; returns { client, host } or an error response. */
  async function checkRequest(p) {
    const client = await clientOf(p.client_id);
    if (!client) return { error: oauthError('invalid_client', 'unknown client_id') };
    if (!client.redirect_uris.includes(p.redirect_uri))
      return { error: oauthError('invalid_request', 'redirect_uri is not registered') };
    // Checked again here: an app registered before the list (or a host taken off it) gets no code.
    const host = hostOf(p.redirect_uri);
    if (!host)
      return { error: oauthError('invalid_request', 'redirect_uri is not an approved app') };
    if (p.response_type && p.response_type !== 'code')
      return { error: oauthError('unsupported_response_type', 'only code') };
    if (!p.code_challenge || (p.code_challenge_method ?? 'S256') !== 'S256')
      return { error: oauthError('invalid_request', 'PKCE with S256 is required') };
    return { client, host };
  }

  async function authorizeForm(p) {
    const { client, host, error } = await checkRequest(p);
    return error ?? page(p, client, host, null);
  }

  async function authorizeSubmit(p, ip) {
    const { client, host, error } = await checkRequest(p);
    if (error) return error;
    if (tooMany(ip))
      return page(p, client, host, 'Too many attempts. Wait a minute and try again.');
    const email = String(p.email ?? '').trim();
    const account = email.toLowerCase();
    // Same answer whether the account exists or not.
    if (accounts.locked(account))
      return page(
        p,
        client,
        host,
        `Too many wrong passwords for this email. Wait ${LOCK_MINUTES} minutes and try again.`,
      );
    const userId = await signIn(email, String(p.password ?? ''));
    if (!userId) {
      accounts.fail(account);
      return page(p, client, host, 'Wrong email or password.');
    }
    accounts.ok(account);
    // The AI app would read and write the copy on the server: none when the user keeps the data
    // on the phone only (DECISIONS 62).
    const [synced] = await sql(
      'select public.sync_enabled_of($1) as on, public.vault_on_of($1) as encrypted',
      [userId],
    );
    if (synced?.on !== true) return page(p, client, host, SYNC_OFF);
    // End-to-end encrypted (DECISIONS 64): the server cannot read the data for the AI app.
    if (synced?.encrypted === true) return page(p, client, host, ENCRYPTED);
    const code = secret('fftac_');
    await sql(
      `insert into public.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at, scope)
       values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6), $7)`,
      [
        sha256(code),
        client.id,
        userId,
        p.redirect_uri,
        p.code_challenge,
        CODE_MINUTES,
        chosenScope(p),
      ],
    );
    const back = new URL(p.redirect_uri);
    back.searchParams.set('code', code);
    if (p.state) back.searchParams.set('state', p.state);
    back.searchParams.set('iss', base);
    return {
      status: 302,
      headers: { location: back.toString(), 'cache-control': 'no-store' },
      body: '',
    };
  }

  /** The app proves who it is: its secret when it has one (public apps rely on PKCE). */
  async function authClient(p, headers) {
    let id = p.client_id;
    let given = p.client_secret;
    const basic = /^Basic (.+)$/i.exec(String(headers.authorization ?? ''));
    if (basic) {
      const [u, s] = Buffer.from(basic[1], 'base64').toString('utf8').split(':');
      id = decodeURIComponent(u ?? '');
      given = decodeURIComponent(s ?? '');
    }
    const client = await clientOf(id);
    if (!client) return null;
    if (client.secret_hash) {
      const a = Buffer.from(sha256(String(given ?? '')));
      const b = Buffer.from(client.secret_hash);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    }
    return client;
  }

  /**
   * New access and refresh tokens for a connection. On a renewal `usedRefresh` is the hash given:
   * the update happens only while it is still the current one (two renewals at once: one wins),
   * and it is kept in prev_refresh_hash to recognise it if it comes back. Neither token outlives
   * the connection's 90 days.
   */
  async function issue(row, usedRefresh = null) {
    const access = secret('fft_');
    const refresh = secret('fftr_');
    const [done] = await sql(
      `update public.api_tokens set token_hash = $2, refresh_hash = $3, prefix = $4,
         ends_at = coalesce(ends_at, now() + make_interval(days => $7)),
         expires_at = least(now() + make_interval(days => $5), coalesce(ends_at, now() + make_interval(days => $7))),
         refresh_expires_at = least(now() + make_interval(days => $6), coalesce(ends_at, now() + make_interval(days => $7))),
         prev_refresh_hash = coalesce($8::text, prev_refresh_hash)
       where id = $1 and ($8::text is null or refresh_hash = $8::text)
       returning greatest(0, extract(epoch from expires_at - now()))::int as expires_in`,
      [
        row.id,
        sha256(access),
        sha256(refresh),
        access.slice(0, 10),
        ACCESS_DAYS,
        REFRESH_IDLE_DAYS,
        CONNECTION_MAX_DAYS,
        usedRefresh,
      ],
    );
    if (!done) return oauthError('invalid_grant', 'the refresh token was already used');
    return json(200, {
      access_token: access,
      token_type: 'Bearer',
      expires_in: done.expires_in,
      refresh_token: refresh,
      scope: row.scope,
    });
  }

  async function token(p, headers) {
    const client = await authClient(p, headers);
    if (!client) return oauthError('invalid_client', 'unknown client or wrong secret', 401);
    if (p.grant_type === 'authorization_code') {
      const [code] = await sql(
        `update public.oauth_codes set deleted_at = now()
         where code_hash = $1 and deleted_at is null and expires_at > now()
         returning client_id, user_id, redirect_uri, code_challenge, scope`,
        [sha256(String(p.code ?? ''))],
      );
      if (!code || code.client_id !== client.id || code.redirect_uri !== p.redirect_uri)
        return oauthError('invalid_grant', 'the code is wrong, used or expired');
      const verifier = String(p.code_verifier ?? '');
      if (b64url(createHash('sha256').update(verifier).digest()) !== code.code_challenge)
        return oauthError('invalid_grant', 'code_verifier does not match');
      // One connection per app and account: signing in again replaces the old one.
      await sql(
        `update public.api_tokens set deleted_at = now()
         where client_id = $1 and user_id = $2 and deleted_at is null`,
        [client.id, code.user_id],
      );
      const [row] = await sql(
        `insert into public.api_tokens (user_id, name, prefix, token_hash, client_id, scope, redirect_host)
         values ($1, $2, 'fft_', $3, $4, $5, $6) returning id, scope`,
        [
          code.user_id,
          client.name,
          sha256(secret('pending_')),
          client.id,
          code.scope,
          hostOf(code.redirect_uri),
        ],
      );
      return issue(row);
    }
    if (p.grant_type === 'refresh_token') {
      const given = sha256(String(p.refresh_token ?? ''));
      const [row] = await sql(
        // The connection keeps the permission chosen at sign-in.
        `select id, scope, refresh_hash = $1 as current,
                -- No dates yet (made by the previous server during a deploy): live, dated now.
                coalesce(refresh_expires_at > now(), true) and coalesce(ends_at > now(), true) as live
         from public.api_tokens
         where (refresh_hash = $1 or prev_refresh_hash = $1) and client_id = $2 and deleted_at is null`,
        [given, client.id],
      );
      if (!row) return oauthError('invalid_grant', 'the refresh token was revoked or is wrong');
      if (!row.current || !row.live) {
        // A replaced refresh token came back (someone kept a copy), or the connection was unused
        // too long or is too old: it ends, and the user signs in again from the AI app.
        await sql(`update public.api_tokens set deleted_at = now() where id = $1`, [row.id]);
        return oauthError(
          'invalid_grant',
          row.current
            ? 'the connection expired: sign in again'
            : 'the refresh token was already used',
        );
      }
      return issue(row, given);
    }
    return oauthError('unsupported_grant_type', 'authorization_code or refresh_token');
  }

  /** → a response { status, headers, body (string) } or null when the path is not OAuth. */
  return async function handle({ method, path, query, body, headers, ip }) {
    if (method === 'GET' && path.startsWith('/.well-known/oauth-protected-resource'))
      return json(200, resource, { 'access-control-allow-origin': '*' });
    if (
      method === 'GET' &&
      (path.startsWith('/.well-known/oauth-authorization-server') ||
        path.startsWith('/.well-known/openid-configuration'))
    )
      return json(200, metadata, { 'access-control-allow-origin': '*' });
    if (path === '/oauth/register' && method === 'POST') return register(body ?? {}, ip);
    if (path === '/oauth/authorize' && method === 'GET') return authorizeForm(query);
    if (path === '/oauth/authorize' && method === 'POST') return authorizeSubmit(body ?? {}, ip);
    if (path === '/oauth/token' && method === 'POST') return token(body ?? {}, headers);
    return null;
  };
}
