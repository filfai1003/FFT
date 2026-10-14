// The small server next to Supabase: it runs the database migrations at start, serves the Edge
// Functions (`off`, `delete-account`, `ai`) that Kong exposes at /functions/v1/<name>, and the
// personal API of paid plans (REST at /v1, MCP at /mcp; see api.js) on its own public domain.
import { Buffer } from 'node:buffer';
import http from 'node:http';
import pg from 'pg';
import { createApi, pgDatabase } from './api.js';
import { migrate } from './migrate.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
// Dates stay plain YYYY-MM-DD strings (no time zone shifts).
pg.types.setTypeParser(1082, (v) => v);
const api = createApi(pgDatabase(pool));
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
    const handler = handlers[path.split('/').pop() ?? ''];
    if (!isApi && !handler) return void res.writeHead(404).end('not found');
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      if (isApi) return void (await serveApi(req, res, url, Buffer.concat(chunks)));
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

migrate('./migrations')
  .then(async () => {
    // The API runs each request as the user (row level security): the server's role must be
    // allowed to become `authenticated`.
    await pool.query('begin; set local role authenticated; rollback');
    console.log('api ready');
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
