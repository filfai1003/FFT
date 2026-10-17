// The small server next to Supabase: it runs the database migrations at start, serves the Edge
// Functions (`off`, `delete-account`, `ai`) that Kong exposes at /functions/v1/<name>, and the
// personal API of paid plans (REST at /v1, MCP at /mcp; see api.js) on its own public domain,
// with the sign-in for AI apps that connect to the MCP server (OAuth, see oauth.js).
import { Buffer } from 'node:buffer';
import http from 'node:http';
import pg from 'pg';
import { createApi, pgDatabase } from './api.js';
import { createOAuth } from './oauth.js';
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
});

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
    ip: String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
      .split(',')[0]
      .trim(),
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
    const handler = handlers[path.split('/').pop() ?? ''];
    if (!isApi && !isOAuth && !handler) return void res.writeHead(404).end('not found');
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
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
 * What the privacy policy promises about retention: handled password requests 30 days, the admin
 * change log and the sign-in log 12 months, error reports 60 days. Runs at start and every day.
 */
async function cleanup() {
  const rules = [
    `delete from public.password_reset_requests where handled_at < now() - interval '30 days'`,
    `delete from public.admin_audit where created_at < now() - interval '12 months'`,
    `delete from auth.audit_log_entries where created_at < now() - interval '12 months'`,
    `delete from public.app_errors where created_at < now() - interval '60 days'`,
    // Relay between phones (DECISIONS 65): a message is deleted once delivered, and in any case
    // after 30 days (a phone that never came back).
    `delete from public.relay_messages where created_at < now() - interval '30 days'`,
  ];
  for (const sql of rules) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.error('cleanup failed:', e.message);
    }
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
