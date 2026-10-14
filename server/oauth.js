// Sign in with FFT for AI apps: OAuth 2.1 (authorization code + PKCE, dynamic client registration,
// refresh tokens) as the MCP specification asks. In Claude or ChatGPT the user adds the connector
// by the MCP address; the app finds this server through /.well-known, registers itself, sends
// the user to our sign-in page (FFT email and password), and receives a token. A connection is an
// api_tokens row: it shows in the app's token list and is revoked there like any token.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const ACCESS_DAYS = 7;
const CODE_MINUTES = 5;
/** Sign-in attempts per address and minute (passwords are not to be guessed). */
const LOGINS_PER_MINUTE = 10;

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const secret = (prefix) => `${prefix}${randomBytes(32).toString('hex')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** https anywhere, or http only on this computer (desktop apps listening locally). */
const allowedRedirect = (u) => {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
};

/**
 * `sql(text, params)` runs as the tables' owner (the api service). `signIn(email, password)`
 * returns the user id or null. `planOf(userId)` returns the plan. `base` = the public address.
 */
export function createOAuth({ sql, signIn, planOf, base }) {
  const attempts = new Map();
  const tooMany = (ip) => {
    const minute = Math.floor(Date.now() / 60000);
    const a = attempts.get(ip);
    if (!a || a.minute !== minute) {
      if (attempts.size > 10000) attempts.clear();
      attempts.set(ip, { minute, n: 1 });
      return false;
    }
    a.n += 1;
    return a.n > LOGINS_PER_MINUTE;
  };

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
    scopes_supported: ['fft'],
  };
  const resource = {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: ['fft'],
    bearer_methods_supported: ['header'],
    resource_name: 'FFT',
  };

  async function register(body) {
    const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (uris.length === 0 || uris.length > 10 || !uris.every(allowedRedirect))
      return oauthError(
        'invalid_redirect_uri',
        'redirect_uris must be https (or http on localhost)',
      );
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
  function page(p, client, message) {
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
</style></head><body><main>
<h1>FFT</h1>
<p><b>${esc(client.name)}</b> wants to read and change your FFT data: training, diet, body and supplements.</p>
<form method="post" action="/oauth/authorize">${hidden}
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
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
        'referrer-policy': 'no-referrer',
      },
      body: html,
    };
  }

  /** Checks an authorization request; returns { client } or an error response. */
  async function checkRequest(p) {
    const client = await clientOf(p.client_id);
    if (!client) return { error: oauthError('invalid_client', 'unknown client_id') };
    if (!client.redirect_uris.includes(p.redirect_uri))
      return { error: oauthError('invalid_request', 'redirect_uri is not registered') };
    if (p.response_type && p.response_type !== 'code')
      return { error: oauthError('unsupported_response_type', 'only code') };
    if (!p.code_challenge || (p.code_challenge_method ?? 'S256') !== 'S256')
      return { error: oauthError('invalid_request', 'PKCE with S256 is required') };
    return { client };
  }

  async function authorizeForm(p) {
    const { client, error } = await checkRequest(p);
    return error ?? page(p, client, null);
  }

  async function authorizeSubmit(p, ip) {
    const { client, error } = await checkRequest(p);
    if (error) return error;
    if (tooMany(ip)) return page(p, client, 'Too many attempts. Wait a minute and try again.');
    const userId = await signIn(String(p.email ?? '').trim(), String(p.password ?? ''));
    if (!userId) return page(p, client, 'Wrong email or password.');
    const plan = await planOf(userId);
    if (plan !== 'supporter' && plan !== 'premium')
      return page(p, client, 'Connecting AI apps is part of Supporter and Premium.');
    const code = secret('fftac_');
    await sql(
      `insert into public.oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
       values ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
      [sha256(code), client.id, userId, p.redirect_uri, p.code_challenge, CODE_MINUTES],
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

  async function issue(row) {
    const access = secret('fft_');
    const refresh = secret('fftr_');
    await sql(
      `update public.api_tokens set token_hash = $2, refresh_hash = $3, prefix = $4,
         expires_at = now() + make_interval(days => $5) where id = $1`,
      [row.id, sha256(access), sha256(refresh), access.slice(0, 10), ACCESS_DAYS],
    );
    return json(200, {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_DAYS * 86400,
      refresh_token: refresh,
      scope: 'fft',
    });
  }

  async function token(p, headers) {
    const client = await authClient(p, headers);
    if (!client) return oauthError('invalid_client', 'unknown client or wrong secret', 401);
    if (p.grant_type === 'authorization_code') {
      const [code] = await sql(
        `update public.oauth_codes set deleted_at = now()
         where code_hash = $1 and deleted_at is null and expires_at > now()
         returning client_id, user_id, redirect_uri, code_challenge`,
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
        `insert into public.api_tokens (user_id, name, prefix, token_hash, client_id)
         values ($1, $2, 'fft_', $3, $4) returning id`,
        [code.user_id, client.name, sha256(secret('pending_')), client.id],
      );
      return issue(row);
    }
    if (p.grant_type === 'refresh_token') {
      const [row] = await sql(
        `select id, user_id from public.api_tokens
         where refresh_hash = $1 and client_id = $2 and deleted_at is null`,
        [sha256(String(p.refresh_token ?? '')), client.id],
      );
      if (!row) return oauthError('invalid_grant', 'the refresh token was revoked or is wrong');
      const plan = await planOf(row.user_id);
      if (plan !== 'supporter' && plan !== 'premium')
        return oauthError('invalid_grant', 'the plan no longer includes connected apps');
      return issue(row);
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
    if (path === '/oauth/register' && method === 'POST') return register(body ?? {});
    if (path === '/oauth/authorize' && method === 'GET') return authorizeForm(query);
    if (path === '/oauth/authorize' && method === 'POST') return authorizeSubmit(body ?? {}, ip);
    if (path === '/oauth/token' && method === 'POST') return token(body ?? {}, headers);
    return null;
  };
}
