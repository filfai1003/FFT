// FFT admin panel: browse the data, run SQL, edit in sudo mode, set the accounts' plans.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createAuth, createLimiter, SUDO_MS } from './auth.js';
import { createDb } from './db.js';

const { DATABASE_URL, ADMIN_RO_PASSWORD, PORT = '3000' } = process.env;
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD ?? '').trim();
if (!DATABASE_URL || !ADMIN_PASSWORD || !ADMIN_RO_PASSWORD) {
  console.error('Missing DATABASE_URL, ADMIN_PASSWORD or ADMIN_RO_PASSWORD');
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 16) {
  console.error('ADMIN_PASSWORD needs 16+ characters');
  process.exit(1);
}
// The cookie-signing key is made at every start: nothing to configure, and a restart signs everyone out.
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

const here = path.dirname(fileURLToPath(import.meta.url));
const auth = createAuth({ password: ADMIN_PASSWORD, secret: SESSION_SECRET });
const limiter = createLimiter();
const db = createDb({ databaseUrl: DATABASE_URL, roPassword: ADMIN_RO_PASSWORD });
await db.setup();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const quote = (id) => `"${String(id).replace(/"/g, '""')}"`;
const SCHEMAS = ['public', 'auth', 'storage'];
// Same as DEFAULT_MODEL in supabase/functions/ai/index.ts (used when no model is set here).
const AI_DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';

const TABLES_SQL = `
  select n.nspname as schema, c.relname as name, c.relkind as kind, greatest(c.reltuples, 0)::bigint as estimate,
    coalesce((select array_agg(a.attname order by k.ord)
      from pg_index i
      cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
      where i.indrelid = c.oid and i.indisprimary), '{}') as pk
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any($1) and c.relkind in ('r', 'v', 'm', 'p')
  order by 1, 2`;

const COLUMNS_SQL = `
  select column_name as name, data_type as type, is_nullable = 'YES' as nullable
  from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position`;

/** A table of the catalogue (so names from the browser are never put in SQL unchecked). */
async function tableInfo(schema, name) {
  const tables = (await db.ro.query(TABLES_SQL, [SCHEMAS])).rows;
  const t = tables.find((x) => x.schema === schema && x.name === name);
  if (!t) throw new HttpError(404, 'Unknown table');
  const columns = (await db.ro.query(COLUMNS_SQL, [schema, name])).rows;
  return { ...t, columns };
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new HttpError(413, 'Too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {});
      } catch {
        reject(new HttpError(400, 'Bad JSON'));
      }
    });
    req.on('error', reject);
  });

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
    .split(',')
    .pop()
    .trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

const pkWhere = (info, pk, start) => {
  if (info.pk.length === 0) throw new HttpError(400, 'This table has no primary key: use SQL');
  const parts = info.pk.map((c, i) => {
    if (!(c in pk)) throw new HttpError(400, `Missing key ${c}`);
    return `${quote(c)}::text = $${start + i}`;
  });
  return { sql: parts.join(' and '), values: info.pk.map((c) => String(pk[c])) };
};

const columnNames = (info) => new Set(info.columns.map((c) => c.name));

async function api(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'POST /api/login') {
    const key = `login:${clientIp(req)}`;
    const wait = limiter.locked(key);
    if (wait)
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`);
    const { password } = await readBody(req);
    if (!auth.checkPassword(password ?? '')) {
      limiter.fail(key);
      await sleep(700);
      throw new HttpError(401, 'Wrong password');
    }
    limiter.ok(key);
    const session = auth.newSession();
    auth.setCookie(res, req, session);
    return send(res, 200, { ok: true });
  }

  const session = auth.sessionOf(req);
  if (route === 'GET /api/session') {
    return send(res, 200, {
      signedIn: Boolean(session),
      sudoLeftMs: session ? Math.max(0, session.sudoUntil - Date.now()) : 0,
    });
  }
  if (!session) throw new HttpError(401, 'Sign in first');
  // A page of another site cannot add this header (it would need permission first).
  if (req.method !== 'GET' && req.headers['x-admin'] !== '1') throw new HttpError(403, 'Forbidden');
  const sudo = session.sudoUntil > Date.now();
  const needSudo = () => {
    if (!sudo) throw new HttpError(403, 'Sudo mode is needed to change data');
  };

  if (route === 'POST /api/logout') {
    auth.setCookie(res, req, null);
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/sudo') {
    const key = `sudo:${clientIp(req)}`;
    const wait = limiter.locked(key);
    if (wait)
      throw new HttpError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} min.`);
    const { password } = await readBody(req);
    if (!auth.checkPassword(password ?? '')) {
      limiter.fail(key);
      await sleep(700);
      throw new HttpError(401, 'Wrong password');
    }
    limiter.ok(key);
    const next = { ...session, sudoUntil: Date.now() + SUDO_MS };
    auth.setCookie(res, req, next);
    await db.run('select 1', {
      sudo: true,
      commit: true,
      audit: { action: 'sudo.enter', detail: { ip: clientIp(req) } },
    });
    return send(res, 200, { sudoLeftMs: SUDO_MS });
  }

  if (route === 'POST /api/sudo/exit') {
    auth.setCookie(res, req, { ...session, sudoUntil: 0 });
    return send(res, 200, { sudoLeftMs: 0 });
  }

  if (route === 'GET /api/tables') {
    const rows = (await db.ro.query(TABLES_SQL, [SCHEMAS])).rows;
    return send(res, 200, { tables: rows.map((r) => ({ ...r, estimate: Number(r.estimate) })) });
  }

  if (route === 'GET /api/table') {
    const info = await tableInfo(url.searchParams.get('schema'), url.searchParams.get('name'));
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 50));
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const sort = url.searchParams.get('sort');
    const dir = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';
    const q = (url.searchParams.get('q') ?? '').trim();
    const from = `${quote(info.schema)}.${quote(info.name)} as t`;
    const where = q ? 'where t::text ilike $1' : '';
    const values = q ? [`%${q.replace(/[\\%_]/g, '\\$&')}%`] : [];
    const order = sort && columnNames(info).has(sort) ? `order by ${quote(sort)} ${dir}` : '';
    const countRes = await db.run(`select count(*) as n from ${from} ${where}`, { params: values });
    const data = await db.run(
      `select * from ${from} ${where} ${order} limit ${limit} offset ${offset}`,
      {
        params: values,
      },
    );
    return send(res, 200, {
      table: {
        schema: info.schema,
        name: info.name,
        kind: info.kind,
        pk: info.pk,
        columns: info.columns,
      },
      columns: data.columns,
      rows: data.rows,
      total: Number(countRes.rows[0]?.[0] ?? 0),
      ms: data.ms,
    });
  }

  if (route === 'POST /api/sql') {
    const { sql, commit } = await readBody(req);
    if (typeof sql !== 'string' || !sql.trim()) throw new HttpError(400, 'Write some SQL first');
    if (commit) needSudo();
    const out = await db.run(sql, {
      sudo,
      commit: Boolean(commit),
      audit: sudo && commit ? { action: 'sql', detail: { sql: sql.slice(0, 4000) } } : null,
    });
    return send(res, 200, out);
  }

  if (route === 'POST /api/row/update') {
    needSudo();
    const { schema, table, pk, set } = await readBody(req);
    const info = await tableInfo(schema, table);
    const names = columnNames(info);
    const cols = Object.keys(set ?? {}).filter((c) => names.has(c));
    if (cols.length === 0) throw new HttpError(400, 'Nothing to change');
    const where = pkWhere(info, pk ?? {}, cols.length + 1);
    const out = await db.run(
      `update ${quote(schema)}.${quote(table)} set ${cols.map((c, i) => `${quote(c)} = $${i + 1}`).join(', ')}
       where ${where.sql} returning *`,
      {
        sudo: true,
        commit: true,
        params: [...cols.map((c) => (set[c] === null ? null : String(set[c]))), ...where.values],
        audit: { action: 'row.update', detail: { schema, table, pk, set } },
      },
    );
    return send(res, 200, out);
  }

  if (route === 'POST /api/row/insert') {
    needSudo();
    const { schema, table, values } = await readBody(req);
    const info = await tableInfo(schema, table);
    const names = columnNames(info);
    const cols = Object.keys(values ?? {}).filter((c) => names.has(c));
    const text = cols.length
      ? `insert into ${quote(schema)}.${quote(table)} (${cols.map(quote).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`
      : `insert into ${quote(schema)}.${quote(table)} default values returning *`;
    const out = await db.run(text, {
      sudo: true,
      commit: true,
      params: cols.map((c) => (values[c] === null ? null : String(values[c]))),
      audit: { action: 'row.insert', detail: { schema, table, values } },
    });
    return send(res, 200, out);
  }

  if (route === 'POST /api/row/delete') {
    needSudo();
    const { schema, table, pk } = await readBody(req);
    const info = await tableInfo(schema, table);
    const where = pkWhere(info, pk ?? {}, 1);
    const out = await db.run(
      `delete from ${quote(schema)}.${quote(table)} where ${where.sql} returning *`,
      {
        sudo: true,
        commit: true,
        params: where.values,
        audit: { action: 'row.delete', detail: { schema, table, pk } },
      },
    );
    return send(res, 200, out);
  }

  if (route === 'GET /api/users') {
    const q = (url.searchParams.get('q') ?? '').trim();
    const out = await db.run(
      `select u.id, u.email, u.created_at, u.last_sign_in_at,
              -- same rule as public.plan_of (computed here: the read-only role cannot call it)
              coalesce(p.plan, case when v.user_id is not null then 'premium' end, 'free') as plan,
              coalesce(p.note, v.note) as note,
              round(c.balance_micros / 1000000.0, 2) as ai_credit_eur
       from auth.users u
       left join public.user_plans p on p.user_id = u.id and p.deleted_at is null
       left join public.vip_users v on v.user_id = u.id and v.deleted_at is null
       left join public.ai_credit c on c.user_id = u.id
       where ($1::text = '' or u.email ilike $2)
       order by u.created_at desc limit 300`,
      { params: [q, `%${q.replace(/[\\%_]/g, '\\$&')}%`] },
    );
    return send(res, 200, out);
  }

  if (route === 'POST /api/plan') {
    // free / premium (DECISIONS 42, 47). Old VIP rows are cleared: plans replace them.
    needSudo();
    const { userId, plan, note } = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(userId))) throw new HttpError(400, 'Bad user id');
    if (!['free', 'premium'].includes(plan)) throw new HttpError(400, 'Bad plan');
    const out =
      plan === 'free'
        ? await db.run(
            `with a as (delete from public.user_plans where user_id = $1 returning user_id),
                  b as (delete from public.vip_users where user_id = $1 returning user_id)
             select $1::uuid as user_id`,
            {
              sudo: true,
              commit: true,
              params: [userId],
              audit: { action: 'plan.set', detail: { userId, plan } },
            },
          )
        : await db.run(
            `with b as (delete from public.vip_users where user_id = $1 returning user_id)
             insert into public.user_plans (user_id, plan, note) values ($1, $2, $3)
             on conflict (user_id) do update
               set plan = excluded.plan, note = excluded.note, deleted_at = null
             returning user_id`,
            {
              sudo: true,
              commit: true,
              params: [userId, plan, note ? String(note).slice(0, 200) : null],
              audit: { action: 'plan.set', detail: { userId, plan, note } },
            },
          );
    return send(res, 200, out);
  }

  if (route === 'GET /api/ai') {
    // The coach model (public.app_settings) and what the included AI cost in the last 30 days.
    const setting = await db.run(
      `select value, updated_at from public.app_settings where key = 'ai_model' and deleted_at is null`,
    );
    const usage = await db.run(
      `select model, count(*) as requests, count(distinct user_id) as users,
              sum(prompt_tokens + completion_tokens) as tokens,
              round(sum(cost_micros) / 1000000.0, 4) as cost_eur
       from public.ai_usage where created_at > now() - interval '30 days'
       group by model order by sum(cost_micros) desc`,
    );
    return send(res, 200, {
      model: setting.rows[0]?.[0] ?? null,
      updatedAt: setting.rows[0]?.[1] ?? null,
      defaultModel: AI_DEFAULT_MODEL,
      usage,
    });
  }

  if (route === 'POST /api/ai-model') {
    // An OpenRouter model id ("provider/model"); empty = back to the default.
    needSudo();
    const model = String((await readBody(req)).model ?? '').trim();
    if (model && !/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(model))
      throw new HttpError(400, 'Use an OpenRouter model id, like anthropic/claude-haiku-4.5');
    const out = model
      ? await db.run(
          `insert into public.app_settings (key, value) values ('ai_model', $1)
           on conflict (key) do update set value = excluded.value, deleted_at = null
           returning value`,
          {
            sudo: true,
            commit: true,
            params: [model],
            audit: { action: 'ai.model', detail: { model } },
          },
        )
      : await db.run(`delete from public.app_settings where key = 'ai_model' returning key`, {
          sudo: true,
          commit: true,
          audit: { action: 'ai.model', detail: { model: null } },
        });
    return send(res, 200, out);
  }

  if (route === 'GET /api/errors') {
    // App errors (report_error), grouped: the same message and stack = one problem.
    const days = Math.min(60, Math.max(1, Number(url.searchParams.get('days')) || 7));
    const out = await db.run(
      `select fingerprint, max(kind) as kind, count(*)::int as times,
              count(distinct coalesce(user_id::text, 'anon'))::int as accounts,
              min(created_at) as first_seen, max(created_at) as last_seen,
              (array_agg(message order by created_at desc))[1] as message,
              (array_agg(stack order by created_at desc))[1] as stack,
              (array_agg(context order by created_at desc))[1] as context,
              string_agg(distinct platform, ', ') as platforms,
              string_agg(distinct coalesce(update_id, app_version), ', ') as versions
       from public.app_errors
       where created_at > now() - make_interval(days => $1)
       group by fingerprint
       order by max(created_at) desc limit 200`,
      { params: [days] },
    );
    return send(res, 200, out);
  }

  if (route === 'POST /api/errors/clear') {
    // A problem fixed: its reports go, so a new one shows up as new.
    needSudo();
    const { fingerprint } = await readBody(req);
    if (!/^[0-9a-f]{32}$/.test(String(fingerprint))) throw new HttpError(400, 'Bad fingerprint');
    const out = await db.run(`delete from public.app_errors where fingerprint = $1`, {
      sudo: true,
      commit: true,
      params: [fingerprint],
      audit: { action: 'errors.clear', detail: { fingerprint } },
    });
    return send(res, 200, out);
  }

  if (route === 'GET /api/password-resets') {
    // Forgot password requests from the sign-in screen: open first, then the last week's.
    const out = await db.run(
      `select r.id, r.email, r.note, r.created_at, r.handled_at,
              exists (select 1 from auth.users u where lower(u.email) = r.email) as has_account
       from public.password_reset_requests r
       where r.deleted_at is null
         and (r.handled_at is null or r.handled_at > now() - interval '7 days')
       order by (r.handled_at is null) desc, r.created_at desc limit 200`,
    );
    return send(res, 200, out);
  }

  if (route === 'POST /api/password-reset') {
    // A temporary password for the request's account, shown once to the admin, who emails it by
    // hand. The user changes it in the app (Profile -> Password).
    needSudo();
    const { id } = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new HttpError(400, 'Bad request id');
    // Easy to read and to type: no 0/O, 1/l/I.
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const temp = Array.from(crypto.randomBytes(12), (b) => alphabet[b % alphabet.length]).join('');
    const found = await db.run(
      `select r.email, exists (select 1 from auth.users u where lower(u.email) = r.email)
       from public.password_reset_requests r where r.id = $1 and r.deleted_at is null`,
      { params: [id] },
    );
    const email = found.rows[0]?.[0];
    if (!email) throw new HttpError(404, 'No such request');
    if (!found.rows[0][1]) throw new HttpError(404, 'No account with this email');
    const out = await db.run(
      `with u as (
         update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 10)),
                               updated_at = now()
         where lower(email) = $1 returning id),
       r as (update public.password_reset_requests set handled_at = now() where id = $3 returning id)
       select (select count(*) from u) as accounts`,
      {
        sudo: true,
        commit: true,
        params: [email, temp, id],
        audit: { action: 'password.temporary', detail: { email } },
      },
    );
    if (Number(out.rows[0]?.[0] ?? 0) === 0) throw new HttpError(404, 'No account with this email');
    return send(res, 200, { email, password: temp });
  }

  if (route === 'POST /api/password-reset/dismiss') {
    needSudo();
    const { id } = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw new HttpError(400, 'Bad request id');
    const out = await db.run(
      `update public.password_reset_requests set handled_at = now() where id = $1 returning email`,
      {
        sudo: true,
        commit: true,
        params: [id],
        audit: { action: 'password.dismiss', detail: { id } },
      },
    );
    return send(res, 200, out);
  }

  if (route === 'GET /api/backup') {
    // A full copy of the data (public, auth, storage) as compressed SQL, made with the read-only role.
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const child = spawn(
      'pg_dump',
      [
        '--no-owner',
        '--no-privileges',
        '--schema=public',
        '--schema=auth',
        '--schema=storage',
        db.roUrl,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    await new Promise((resolve) => {
      let started = false;
      const gzip = createGzip();
      child.stdout.on('data', (chunk) => {
        if (!started) {
          started = true;
          res.writeHead(200, {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="fft-backup-${stamp}.sql.gz"`,
            'Cache-Control': 'no-store',
          });
          gzip.pipe(res);
        }
        gzip.write(chunk);
      });
      child.on('error', (e) => {
        if (!started) send(res, 500, { error: `pg_dump is not available: ${e.message}` });
        resolve();
      });
      child.on('close', (code) => {
        if (code !== 0) {
          if (started) res.destroy();
          else send(res, 500, { error: `Backup failed: ${stderr.slice(0, 300)}` });
        } else gzip.end();
        resolve();
      });
    });
    await db
      .run('select 1', {
        sudo: true,
        commit: true,
        audit: { action: 'backup.download', detail: { ip: clientIp(req) } },
      })
      .catch(() => undefined);
    return;
  }

  if (route === 'POST /api/reset') {
    // Deletes every account and, through the cascades, everything that belongs to them. Keeps the tables
    // and the catalogue (exercises, foods). Needs sudo mode, the password again and the word RESET.
    needSudo();
    const { confirm, password } = await readBody(req);
    const key = `sudo:${clientIp(req)}`;
    if (limiter.locked(key)) throw new HttpError(429, 'Too many attempts');
    if (confirm !== 'RESET') throw new HttpError(400, 'Type RESET to confirm');
    if (!auth.checkPassword(password ?? '')) {
      limiter.fail(key);
      await sleep(700);
      throw new HttpError(401, 'Wrong password');
    }
    const before = Number((await db.rw.query('select count(*) as n from auth.users')).rows[0].n);
    const out = await db.run('delete from auth.users', {
      sudo: true,
      commit: true,
      audit: { action: 'db.reset', detail: { accounts: before } },
    });
    return send(res, 200, { accounts: before, ms: out.ms });
  }

  if (route === 'GET /api/audit') {
    const out = await db.run(
      'select created_at, action, detail from public.admin_audit order by created_at desc limit 200',
    );
    return send(res, 200, out);
  }

  throw new HttpError(404, 'Not found');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
};

async function staticFile(res, pathname) {
  const clean = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(here, 'public', path.normalize(clean).replace(/^([/\\])+/, ''));
  if (!file.startsWith(path.join(here, 'public'))) throw new HttpError(404, 'Not found');
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': clean.startsWith('/fonts/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(body);
  } catch {
    throw new HttpError(404, 'Not found');
  }
}

http
  .createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    );
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/health') return void res.writeHead(200).end('ok');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
      await staticFile(res, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      // Database errors are useful to the admin (a typo in SQL, a constraint).
      const message = e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Error';
      send(res, 400, { error: message });
    }
  })
  .listen(Number(PORT), '::', () => console.log(`admin listening on ${PORT}`));
