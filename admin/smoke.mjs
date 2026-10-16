// Checks the access rules of a running admin panel. Usage:
//   ADMIN_URL=http://localhost:3100 ADMIN_PASSWORD=… node admin/smoke.mjs
const base = process.env.ADMIN_URL ?? 'http://localhost:3100';
const password = process.env.ADMIN_PASSWORD ?? '';
let cookie = '';
let ok = 0;
let bad = 0;

async function call(path, body, { admin = true, useCookie = true } = {}) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'X-Admin': '1' } : {}),
      ...(useCookie && cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function check(name, cond, extra = '') {
  if (cond) ok++;
  else bad++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`);
}

check(
  'no sign-in: data refused',
  (await call('/api/tables', undefined, { useCookie: false })).status === 401,
);
check(
  'wrong password refused',
  (await call('/api/login', { password: 'nope' }, { useCookie: false })).status === 401,
);
check('sign in works', (await call('/api/login', { password })).status === 200);
check('tables list', (await call('/api/tables')).data.tables?.length > 5);

const select = await call('/api/sql', { sql: 'select count(*) as n from public.profiles' });
check(
  'read-only select works',
  select.status === 200 && select.data.columns[0] === 'n',
  JSON.stringify(select.data),
);

for (const sql of [
  "update public.profiles set name = 'x'",
  'delete from public.profiles',
  'drop table public.vip_users',
  'commit; update public.profiles set name = $$x$$',
  'set transaction read write; delete from public.profiles',
  'create table public.sneaky (a int)',
]) {
  const r = await call('/api/sql', { sql });
  check(`read-only cannot: ${sql.slice(0, 40)}`, r.status !== 200, JSON.stringify(r.data));
}

check(
  'commit refused without sudo',
  (await call('/api/sql', { sql: 'select 1', commit: true })).status === 403,
);
check(
  'plan change refused without sudo',
  (await call('/api/plan', { userId: '00000000-0000-0000-0000-000000000000', plan: 'premium' }))
    .status === 403,
);
check(
  'AI model change refused without sudo',
  (await call('/api/ai-model', { model: 'anthropic/claude-haiku-4.5' })).status === 403,
);
check('AI tab readable', (await call('/api/ai')).status === 200);
check('password resets readable', (await call('/api/password-resets')).status === 200);
check('errors readable', (await call('/api/errors')).status === 200);
check('overview readable', (await call('/api/overview')).status === 200);
check('a person: bad id refused', (await call('/api/user?id=x')).status === 400);
check(
  'temporary password for a person refused without sudo',
  (await call('/api/user/temp-password', { userId: '00000000-0000-0000-0000-000000000000' }))
    .status === 403,
);
check(
  'clearing errors refused without sudo',
  (await call('/api/errors/clear', { fingerprint: '0'.repeat(32) })).status === 403,
);
check(
  'temporary password refused without sudo',
  (await call('/api/password-reset', { id: '00000000-0000-0000-0000-000000000000' })).status ===
    403,
);
check(
  'row update refused without sudo',
  (
    await call('/api/row/update', {
      schema: 'public',
      table: 'profiles',
      pk: { id: 'x' },
      set: { name: 'x' },
    })
  ).status === 403,
);
check(
  'no X-Admin header: change refused',
  (await call('/api/sudo/exit', {}, { admin: false })).status === 403,
);
check(
  'wrong sudo password refused',
  (await call('/api/sudo', { password: 'nope' })).status === 401,
);
check(
  'unknown table refused',
  (await call('/api/table?schema=public&name=nope%22%3B')).status === 404,
);

check(
  'reset refused without sudo',
  (await call('/api/reset', { confirm: 'RESET', password })).status === 403,
);
check('sudo works', (await call('/api/sudo', { password })).status === 200);
const rollback = await call('/api/sql', {
  sql: 'create table public.zz_test (a int); insert into public.zz_test values (1); select * from public.zz_test',
});
check(
  'sudo run rolls back by default',
  rollback.status === 200 && rollback.data.committed === false,
  JSON.stringify(rollback.data),
);
const gone = await call('/api/sql', { sql: "select to_regclass('public.zz_test') as t" });
check('rolled back for real', gone.data.rows?.[0]?.[0] === null, JSON.stringify(gone.data));

check(
  'reset needs the word RESET',
  (await call('/api/reset', { confirm: 'yes', password })).status === 400,
);
check(
  'reset needs the password',
  (await call('/api/reset', { confirm: 'RESET', password: 'nope' })).status === 401,
);

const users = await call('/api/users');
check('users list', users.status === 200, JSON.stringify(users.data));
const first = users.data.rows?.[0];
if (first) {
  // Restores the plan the account had, whatever it was.
  const before = first[4];
  const grant = await call('/api/plan', {
    userId: first[0],
    plan: 'premium',
    note: 'smoke test',
  });
  check('plan set', grant.status === 200, JSON.stringify(grant.data));
  const after = await call('/api/users');
  check(
    'plan shows in the list',
    after.data.rows.find((r) => r[0] === first[0])?.[4] === 'premium',
  );
  const back = await call('/api/plan', { userId: first[0], plan: before });
  check('plan restored', back.status === 200, JSON.stringify(back.data));
  check(
    'bad plan refused',
    (await call('/api/plan', { userId: first[0], plan: 'gold' })).status === 400,
  );
}
const audit = await call('/api/audit');
check(
  'audit has entries',
  audit.status === 200 && audit.data.rows.length > 0,
  JSON.stringify(audit.data),
);
check('sudo exit works', (await call('/api/sudo/exit', {})).status === 200);
check(
  'after exit: commit refused again',
  (await call('/api/sql', { sql: 'select 1', commit: true })).status === 403,
);

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
