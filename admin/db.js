import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { PANEL_ROLE, panelRoleSetup } from './roles.js';

/**
 * Two ways into the database:
 *  - `ro`: the role admin_ro, which can only read. Used all the time. It cannot write whatever the SQL
 *    says (not even with tricks like COMMIT or SET TRANSACTION READ WRITE), because the role itself
 *    has no right to.
 *  - `rw`: the role admin_panel (admin/roles.js), used only in sudo mode. It changes data like the
 *    owner did but cannot change or delete the admin log and owns nothing (DECISIONS 97). The
 *    database owner (`owner`) is used only at start, to set up both roles.
 */
export function createDb({ databaseUrl, roPassword }) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(roPassword))
    throw new Error('ADMIN_RO_PASSWORD must be 16+ plain characters');
  const rwUrl = new URL(databaseUrl);
  const roUrl = new URL(databaseUrl);
  roUrl.username = 'admin_ro';
  roUrl.password = roPassword;

  const panelPassword = randomBytes(24).toString('base64url');
  const panelUrl = new URL(databaseUrl);
  panelUrl.username = PANEL_ROLE;
  panelUrl.password = panelPassword;

  const owner = new pg.Pool({ connectionString: rwUrl.toString(), max: 1 });
  const rw = new pg.Pool({ connectionString: panelUrl.toString(), max: 4 });
  const ro = new pg.Pool({ connectionString: roUrl.toString(), max: 4 });
  for (const p of [owner, rw, ro]) p.on('error', (e) => console.error('pool error', e.message));

  /** Creates the two roles (or refreshes their passwords and rights) at start. */
  async function setup() {
    for (const sql of panelRoleSetup(panelPassword)) await owner.query(sql);
    await owner.query(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'admin_ro') then create role admin_ro login; end if;
    end $$`);
    await owner.query(`alter role admin_ro with login password '${roPassword}'`);
    await owner.query('grant pg_read_all_data to admin_ro');
    // Row level security protects users from each other; the admin has to see everything.
    await owner.query('alter role admin_ro bypassrls');
    await owner.query(`alter role admin_ro set default_transaction_read_only = on`);
    await owner.query(`alter role admin_ro set statement_timeout = '15s'`);
  }

  const jsonValue = (v) => {
    if (Buffer.isBuffer(v)) return `\\x${v.toString('hex')}`;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'bigint') return String(v);
    return v;
  };

  const shape = (res, limit = 1000) => {
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    const columns = (last.fields ?? []).map((f) => f.name);
    const rows = (last.rows ?? []).slice(0, limit).map((r) => columns.map((c) => jsonValue(r[c])));
    return {
      command: last.command,
      columns,
      rows,
      rowCount: last.rowCount ?? rows.length,
      truncated: (last.rows ?? []).length > limit,
    };
  };

  /**
   * Runs SQL. `sudo` uses the owner and can keep the change (`commit`); otherwise the read-only role,
   * and in both cases the transaction is rolled back unless `commit` is set.
   */
  async function run(sql, { sudo = false, commit = false, params = [], audit = null } = {}) {
    const client = await (sudo ? rw : ro).connect();
    const started = Date.now();
    try {
      await client.query('begin');
      try {
        await client.query(`set local statement_timeout = '20s'`);
        const res = await client.query(params.length ? { text: sql, values: params } : sql);
        if (audit) {
          await client.query('insert into public.admin_audit (action, detail) values ($1, $2)', [
            audit.action,
            JSON.stringify(audit.detail),
          ]);
        }
        const out = shape(res);
        await client.query(sudo && commit ? 'commit' : 'rollback');
        return { ...out, ms: Date.now() - started, committed: sudo && commit };
      } catch (e) {
        await client.query('rollback').catch(() => undefined);
        throw e;
      }
    } finally {
      client.release();
    }
  }

  return { setup, run, rw, ro, shape, roUrl: roUrl.toString() };
}
