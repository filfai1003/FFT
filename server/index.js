// The small server next to Supabase: it runs the database migrations at start, serves the Edge
// Functions (`off`, `delete-account`, `ai`) that Kong exposes at /functions/v1/<name>, and the
// personal API of paid plans (REST at /v1, MCP at /mcp; see api.js) on its own public domain,
// with the sign-in for AI apps that connect to the MCP server (OAuth, see oauth.js).
import { Buffer } from 'node:buffer';
import http from 'node:http';
import pg from 'pg';
import { createApi, pgDatabase } from './api.js';
import { createApkPublisher } from './apk.js';
import { clientIp, createOAuth } from './oauth.js';
import { migrate } from './migrate.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
// Dates stay plain YYYY-MM-DD strings (no time zone shifts).
pg.types.setTypeParser(1082, (v) => v);
// Decimals (weights, macros) as numbers, as the app has them: the coach tools give the same answers.
pg.types.setTypeParser(1700, (v) => Number(v));
/** The public address of this service (the MCP address is <BASE>/mcp). */
const BASE = (process.env.PUBLIC_URL ?? 'https://fft-api.up.railway.app').replace(/\/+$/, '');
const api = createApi(pgDatabase(pool), { base: BASE });

/** Email + password checked by the auth service itself (the same sign-in as the app). */
async function signIn(email, password) {
  if (!email || !password) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.user?.id ?? null;
}
const oauth = createOAuth({
  sql: async (text, params) => (await pool.query(text, params)).rows,
  signIn,
  base: BASE,
  // AI apps besides Claude and ChatGPT that may receive a sign-in (checked by the owner first).
  extraRedirectHosts: (process.env.OAUTH_REDIRECT_HOSTS ?? '').split(','),
});

// The GitHub workflow that publishes a new APK (off unless APK_UPLOAD_TOKEN_SHA256 is set).
const publishApk = createApkPublisher({
  tokenSha256: process.env.APK_UPLOAD_TOKEN_SHA256,
  supabaseUrl: process.env.SUPABASE_URL,
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
});

async function serveInternal(req, res, raw) {
  let body = null;
  try {
    body = raw.length && raw.length < 4096 ? JSON.parse(raw.toString('utf8')) : null;
  } catch {
    body = null;
  }
  const out =
    req.method === 'POST'
      ? await publishApk({ headers: req.headers, body })
      : { status: 405, body: { error: 'POST only' } };
  res.writeHead(out.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(out.body));
}

async function serveOAuth(req, res, url, raw) {
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
  if (raw.length > 64 * 1024) return void res.writeHead(413).end();
  const text = raw.toString('utf8');
  let body;
  if (text) {
    body = /application\/json/.test(req.headers['content-type'] ?? '')
      ? JSON.parse(text)
      : Object.fromEntries(new URLSearchParams(text));
  }
  const out = await oauth({
    method: req.method,
    path: url.pathname.replace(/\/+$/, ''),
    query: Object.fromEntries(url.searchParams),
    body,
    headers: req.headers,
    ip: clientIp(req.headers['x-forwarded-for'], req.socket.remoteAddress),
  });
  if (!out) return void res.writeHead(404).end('not found');
  res.writeHead(out.status, { ...cors, ...out.headers });
  res.end(out.body);
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers':
    'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
};

async function serveApi(req, res, url, raw) {
  if (req.method === 'OPTIONS') return void res.writeHead(204, cors).end();
  let body;
  if (raw.length > 64 * 1024) return void res.writeHead(413, cors).end();
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400, { ...cors, 'content-type': 'application/json' });
      return void res.end(JSON.stringify({ error: 'the body must be JSON' }));
    }
  }
  const out = await api({
    method: req.method,
    path: url.pathname.replace(/\/+$/, '') || '/',
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
    body,
  });
  res.writeHead(out.status, {
    ...cors,
    'content-type': 'application/json',
    ...(out.headers ?? {}),
  });
  res.end(out.body == null ? '' : JSON.stringify(out.body));
}

const handlers = {};
let loading = '';
// The functions are written for Deno; this is the little of Deno they use.
globalThis.Deno = {
  env: { get: (key) => process.env[key] },
  serve: (handler) => {
    handlers[loading] = handler;
  },
};
for (const name of ['off', 'delete-account', 'ai']) {
  loading = name;
  await import(`./fn/${name}/index.ts`);
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '/health') return void res.writeHead(200).end('ok');
    const isApi = path === '/mcp' || path === '/v1' || path.startsWith('/v1/');
    const isOAuth = path.startsWith('/oauth/') || path.startsWith('/.well-known/');
    const isInternal = path === '/internal/apk';
    const handler = handlers[path.split('/').pop() ?? ''];
    if (!isApi && !isOAuth && !isInternal && !handler)
      return void res.writeHead(404).end('not found');
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      if (isInternal) return void (await serveInternal(req, res, Buffer.concat(chunks)));
      if (isApi) return void (await serveApi(req, res, url, Buffer.concat(chunks)));
      if (isOAuth) return void (await serveOAuth(req, res, url, Buffer.concat(chunks)));
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? Buffer.concat(chunks) : undefined,
      });
      const response = await handler(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('error');
    }
  })
  .listen(Number(process.env.PORT ?? 3000), '::', () => console.log('functions listening'));

/**
 * What the privacy policy promises about retention: password requests 30 days, the admin
 * change log and the sign-in log 12 months, error reports 60 days. Runs at start and every day.
 * Clean-up of the AI app sign-in too.
 */
async function cleanup() {
  const rules = [
    // Password requests: 30 days after they were sent, handled or not (DECISIONS 82).
    `delete from public.password_reset_requests where created_at < now() - interval '30 days'`,
    `delete from public.admin_audit where created_at < now() - interval '12 months'`,
    `delete from auth.audit_log_entries where created_at < now() - interval '12 months'`,
    `delete from public.app_errors where created_at < now() - interval '60 days'`,
    // Relay between phones (DECISIONS 65): a message is deleted once delivered, and in any case
    // after 30 days (a phone that never came back).
    `delete from public.relay_messages where created_at < now() - interval '30 days'`,
    // AI app sign-in (DECISIONS 74): one-time codes live 5 minutes; an app that registered but
    // never got a connection in 30 days is forgotten (it registers again if it comes back).
    `delete from public.oauth_codes where expires_at < now() - interval '1 day'`,
    // Deletion log (DECISIONS 80): needed only while a backup older than the deletion exists (6 months).
    `delete from public.deleted_accounts where deleted_at < now() - interval '7 months'`,
    // Connections past their 30 idle / 90 days end, so the app no longer lists them.
    `update public.api_tokens set deleted_at = now()
       where client_id is not null and deleted_at is null
         and (refresh_expires_at < now() or ends_at < now())`,
    `delete from public.oauth_clients c where c.created_at < now() - interval '30 days'
       and not exists (select 1 from public.api_tokens t where t.client_id = c.id)`,
  ];
  for (const sql of rules) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.error('cleanup failed:', e.message);
    }
  }
  await purgeDeleted().catch((e) => console.error('purge failed:', e.message));
}

/**
 * Rows deleted more than 7 days ago go for good, with their files (DECISIONS 79). The database
 * deletes the rows and queues their files in `files_to_delete` in the same transaction (DECISIONS
 * 98); the queue is then emptied through the storage API (removing them from storage.objects alone
 * would leave the bytes on the disk). An entry goes only once storage confirmed the removal, so a
 * failure is tried again at the next clean-up instead of leaving the file behind.
 */
async function purgeDeleted() {
  const { rows } = await pool.query('select public.purge_deleted(7) as out');
  if (rows[0]?.out?.removed) console.log(`purge: ${rows[0].out.removed} deleted rows removed`);
  await removeQueuedFiles();
}

async function removeQueuedFiles() {
  const { rows } = await pool.query(
    'select id, bucket, path from public.files_to_delete order by created_at limit 5000',
  );
  const byBucket = new Map();
  for (const f of rows) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f]);
  for (const [bucket, items] of byBucket)
    for (let i = 0; i < items.length; i += 100) {
      const part = items.slice(i, i + 100);
      const ids = part.map((f) => f.id);
      let error = null;
      try {
        const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ prefixes: part.map((f) => f.path) }),
        });
        if (!res.ok) error = `status ${res.status}`;
      } catch (e) {
        error = String(e?.message ?? e).slice(0, 200);
      }
      if (!error) {
        await pool.query('delete from public.files_to_delete where id = any ($1::uuid[])', [ids]);
        continue;
      }
      console.error(`purge: removing files from ${bucket} failed (${error}); kept for a retry`);
      await pool.query(
        `update public.files_to_delete set attempts = attempts + 1, last_error = $2
         where id = any ($1::uuid[])`,
        [ids, error],
      );
    }
}

migrate('./migrations')
  .then(async () => {
    void cleanup();
    setInterval(() => void cleanup(), 24 * 60 * 60 * 1000);
    // The API runs each request as the user (row level security): the server's role must be
    // allowed to become `authenticated`.
    await pool.query('begin; set local role authenticated; rollback');
    console.log('api ready');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
