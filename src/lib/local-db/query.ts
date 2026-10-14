import type { LocalDb } from './engine';
import {
  checkRow,
  columns,
  relations,
  uniqueViolation,
  withDefaults,
  type DbError,
  type Row,
} from './schema';
import { computeView, isView, lastSets } from './views';

// --- select strings: "id, name, plan_days(*, plan_exercises(id, exercises(name)))" ----------------

type Embed = { name: string; inner: boolean; sub: SelectNode };
type SelectNode = { all: boolean; cols: string[]; embeds: Embed[] };

function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function parseSelect(text: string): SelectNode {
  const node: SelectNode = { all: false, cols: [], embeds: [] };
  for (const part of splitTop(text)) {
    const open = part.indexOf('(');
    if (open < 0) {
      if (part === '*') node.all = true;
      else node.cols.push(part);
      continue;
    }
    const head = part.slice(0, open);
    const inner = head.includes('!inner');
    node.embeds.push({
      name: head.replace('!inner', '').trim(),
      inner,
      sub: parseSelect(part.slice(open + 1, part.lastIndexOf(')'))),
    });
  }
  return node;
}

// --- helpers -------------------------------------------------------------------------------------

const clone = <T>(v: T): T => (v == null ? v : (JSON.parse(JSON.stringify(v)) as T));

function compare(a: unknown, b: unknown, textKey: boolean): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const x = String(a);
  const y = String(b);
  if (textKey) return x.localeCompare(y, undefined, { sensitivity: 'base' });
  return x < y ? -1 : x > y ? 1 : 0;
}

function like(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

type Filter = { path: string; test: (value: unknown) => boolean };
type Order = { col: string; ascending: boolean };
type Result = { data: unknown; error: DbError | null; count?: number | null };

/**
 * The slice of the supabase-js query builder the app uses (select / insert / upsert / update /
 * delete, eq / is / in / gte / lte / lt / gt / not / ilike, order / limit / range, single /
 * maybeSingle, embedded selects), run against the on-device tables.
 */
export class LocalQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;
  private selectText = '*';
  private returning = false;
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private max: number | null = null;
  private offset = 0;
  private mode: 'many' | 'single' | 'maybe' = 'many';

  constructor(
    private readonly db: LocalDb,
    private readonly table: string,
  ) {}

  select(text = '*') {
    if (this.op === 'select') this.selectText = text;
    else {
      this.returning = true;
      this.selectText = text;
    }
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.op = 'upsert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private where(path: string, test: (value: unknown) => boolean) {
    this.filters.push({ path, test });
    return this;
  }
  eq(path: string, value: unknown) {
    return this.where(path, (v) => v === value);
  }
  neq(path: string, value: unknown) {
    return this.where(path, (v) => v !== value);
  }
  is(path: string, value: null | boolean) {
    return this.where(path, (v) => (value === null ? v == null : v === value));
  }
  in(path: string, values: readonly unknown[]) {
    return this.where(path, (v) => values.includes(v));
  }
  gte(path: string, value: unknown) {
    return this.where(path, (v) => v != null && compare(v, value, false) >= 0);
  }
  lte(path: string, value: unknown) {
    return this.where(path, (v) => v != null && compare(v, value, false) <= 0);
  }
  gt(path: string, value: unknown) {
    return this.where(path, (v) => v != null && compare(v, value, false) > 0);
  }
  lt(path: string, value: unknown) {
    return this.where(path, (v) => v != null && compare(v, value, false) < 0);
  }
  ilike(path: string, pattern: string) {
    return this.where(path, (v) => typeof v === 'string' && like(pattern, v));
  }
  like(path: string, pattern: string) {
    return this.ilike(path, pattern);
  }
  not(path: string, operator: string, value: unknown) {
    if (operator === 'is')
      return this.where(path, (v) => (value === null ? v != null : v !== value));
    if (operator === 'eq') return this.where(path, (v) => v !== value);
    throw new Error(`Offline mode: .not(…, '${operator}') is not supported`);
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  range(from: number, to: number) {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  // --- execution -------------------------------------------------------------------------------

  private async run(): Promise<Result> {
    await this.db.ready;
    try {
      const rows = this.op === 'select' ? this.read() : this.write();
      if ('error' in rows) return { data: null, error: rows.error };
      return this.finish(rows.rows, this.op === 'select' || this.returning);
    } catch (e) {
      return {
        data: null,
        error: { message: e instanceof Error ? e.message : String(e), code: 'XX000' },
      };
    }
  }

  private source(): Row[] {
    return isView(this.table)
      ? computeView(this.table, this.db.tables, this.db.userId)
      : (this.db.tables[this.table] ?? []);
  }

  /** The row a filter path reads: `col`, or `relation.col` through an embedded relation. */
  private valueAt(row: Row, path: string): { present: boolean; value: unknown } {
    const dot = path.indexOf('.');
    if (dot < 0) return { present: true, value: row[path] };
    const rel = relations[this.table]?.[path.slice(0, dot)];
    if (!rel) return { present: true, value: undefined };
    const target = (this.db.tables[rel.table] ?? []).find((r) => r[rel.foreign] === row[rel.local]);
    return { present: target != null, value: target?.[path.slice(dot + 1)] };
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const { present, value } = this.valueAt(row, f.path);
      return present && f.test(value);
    });
  }

  private read(): { rows: Row[] } {
    let rows = this.source().filter((r) => this.matches(r));
    for (const o of [...this.orders].reverse()) {
      const text = o.col === 'name';
      rows = [...rows].sort((a, b) => {
        const x = a[o.col];
        const y = b[o.col];
        // Like Postgres: nulls last when ascending, first when descending.
        if (x == null || y == null)
          return x == null && y == null ? 0 : (x == null ? 1 : -1) * (o.ascending ? 1 : -1);
        return compare(x, y, text) * (o.ascending ? 1 : -1);
      });
    }
    if (this.max != null || this.offset)
      rows = rows.slice(this.offset, this.max == null ? undefined : this.offset + this.max);
    return { rows };
  }

  private write(): { rows: Row[] } | { error: DbError } {
    const table = this.table;
    const store = (this.db.tables[table] ??= []);
    const changed: Row[] = [];

    if (this.op === 'update') {
      const patch = this.payload as Row;
      const targets = store.filter((r) => this.matches(r));
      const next: Row[] = targets.map((r) => ({
        ...r,
        ...patch,
        updated_at: new Date().toISOString(),
      }));
      for (const row of next) {
        const error =
          checkRow(table, row) ??
          uniqueViolation(
            table,
            store.map((r) => next.find((n) => n.id === r.id && n.id != null) ?? r),
            row,
          );
        if (error) return { error };
      }
      targets.forEach((r, i) => Object.assign(r, next[i]));
      changed.push(...targets);
    } else if (this.op === 'delete') {
      for (const r of store.filter((x) => this.matches(x))) {
        store.splice(store.indexOf(r), 1);
        changed.push(r);
      }
    } else {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      const pk = table === 'user_settings' ? 'user_id' : 'id';
      const staged: { existing: Row | null; row: Row }[] = [];
      for (const input of incoming) {
        const existing =
          input[pk] != null ? (store.find((r) => r[pk] === input[pk]) ?? null) : null;
        if (existing && this.op === 'insert')
          return {
            error: {
              message: `duplicate key value violates unique constraint "${table}_pkey"`,
              code: '23505',
            },
          };
        const row = existing
          ? { ...existing, ...input, updated_at: new Date().toISOString() }
          : withDefaults(table, input, this.db.userId);
        const others = store.filter((r) => r !== existing);
        const error =
          checkRow(table, row) ??
          uniqueViolation(table, [...others, ...staged.map((s) => s.row)], row);
        if (error) return { error };
        staged.push({ existing, row });
      }
      for (const { existing, row } of staged) {
        if (existing) Object.assign(existing, row);
        else store.push(row);
        changed.push(existing ?? row);
      }
    }
    if (changed.length) {
      this.db.scheduleSave();
      this.db.record(table, changed, this.op === 'delete' ? 'delete' : 'upsert');
    }
    return { rows: changed };
  }

  private project(row: Row, node: SelectNode, table: string): Row {
    const out: Row = {};
    if (node.all) Object.assign(out, row);
    for (const c of node.cols) out[c] = row[c] ?? null;
    for (const e of node.embeds) {
      const rel = relations[table]?.[e.name];
      if (!rel) throw new Error(`Offline mode: unknown relation ${table}.${e.name}`);
      const related = (this.db.tables[rel.table] ?? []).filter(
        (r) => r[rel.foreign] === row[rel.local],
      );
      out[e.name] = rel.many
        ? related.map((r) => this.project(r, e.sub, rel.table))
        : related[0]
          ? this.project(related[0], e.sub, rel.table)
          : null;
    }
    return out;
  }

  private finish(rows: Row[], withData: boolean): Result {
    if (!withData) return { data: null, error: null };
    const node = parseSelect(this.selectText);
    const projected = rows.map((r) => clone(this.project(r, node, this.table)));
    if (this.mode === 'many') return { data: projected, error: null };
    if (projected.length === 1) return { data: projected[0], error: null };
    if (projected.length === 0 && this.mode === 'maybe') return { data: null, error: null };
    return {
      data: null,
      error: {
        message: 'JSON object requested, multiple (or no) rows returned',
        code: 'PGRST116',
      },
    };
  }
}

/** `rpc(...)`: the one database function the app calls. */
export async function runRpc(
  db: LocalDb,
  name: string,
  args: Record<string, unknown>,
): Promise<Result> {
  await db.ready;
  if (name === 'last_sets') {
    return {
      data: clone(lastSets(db.tables, (args.p_exercise_ids as string[]) ?? [])),
      error: null,
    };
  }
  return {
    data: null,
    error: { message: `Offline mode: function ${name} is not available`, code: '42883' },
  };
}

export { columns };
