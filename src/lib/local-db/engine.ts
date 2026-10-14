import { catalogue } from './catalogue';
import { columns, LOCAL_USER_ID, tableNames, withDefaults, type Row } from './schema';

/** Where the on-device database and its files live (IndexedDB on the web, files on devices). */
export type Kv = {
  getText(key: string): Promise<string | null>;
  setText(key: string, text: string): Promise<void>;
  putFile(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  fileUrl(key: string): Promise<string | null>;
  /** The bytes of a stored file, or null when there is none. */
  readFile(key: string): Promise<Uint8Array | null>;
  removeFile(key: string): Promise<void>;
  clearAll(): Promise<void>;
};

const dbKey = (userId: string) => `database-${userId}.json`;
const FORMAT = 1;
/** Rows made empty by the app (profile, settings): any real version, e.g. from the server, wins. */
const SEEDED_AT = '1970-01-01T00:00:00.000Z';

type SavedDb = { format: number; tables: Record<string, Row[]>; outbox?: Record<string, Pending> };

/** A saved database, or null when the text is missing, cut short or of another format. */
function parseDb(text: string | null): SavedDb | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as SavedDb;
    return parsed?.format === FORMAT && parsed.tables && typeof parsed.tables === 'object'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** The key column of a table. */
export const pkOf = (table: string) => (table === 'user_settings' ? 'user_id' : 'id');

/**
 * A change waiting to be sent to the server (premium sync). One entry per row: a row changed
 * several times is sent once, in its latest state. `at` = when the action happened.
 */
export type Pending = { table: string; key: string; op: 'upsert' | 'delete'; at: string };

const outboxKey = (table: string, key: string) => `${table}:${key}`;

/** A stable UUID-shaped id for a catalogue exercise, so plans keep pointing at it after updates. */
export function catalogueId(slug: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < slug.length; i++) {
    h1 = Math.imul(h1 ^ slug.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + slug.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const tail = hex(h1) + hex(h2);
  return `ca7a1090-0000-4000-8000-${tail.slice(0, 12)}`;
}

/**
 * The offline mode's database: every table is an array of rows kept in memory and saved to the
 * device after each change. It mirrors the Supabase schema, so the app code does not know the
 * difference (see client.ts).
 */
export class LocalDb {
  tables: Record<string, Row[]> = {};
  /** Changes not on the server yet (only while `tracking`: premium accounts). */
  outbox: Record<string, Pending> = {};
  tracking = false;
  private listeners = new Set<() => void>();
  readonly ready: Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  /**
   * True when no saved database could be read at start (a new user on this device, or a file
   * lost): a premium account then takes everything back from the server (see sync.ts).
   */
  freshStart = false;

  /** One database per user: accounts on the same device never see each other's data. */
  constructor(
    readonly kv: Kv,
    readonly userId: string,
  ) {
    this.ready = this.load();
  }

  private async load() {
    const key = dbKey(this.userId);
    // Before accounts had their own file, the account-less mode used `database.json`.
    const text =
      (await this.kv.getText(key)) ??
      (this.userId === LOCAL_USER_ID ? await this.kv.getText('database.json') : null);
    let saved = parseDb(text);
    if (!saved && text) {
      // Unreadable (cut short by a crash): the previous copy, and the bad one is kept aside,
      // never written over, so nothing is lost for good.
      await this.kv.setText(`${key}.unreadable-${Date.now()}`, text);
      saved = parseDb(await this.kv.getText(`${key}.bak`));
    }
    this.freshStart = saved == null;
    this.outbox = saved?.outbox ?? {};
    for (const name of tableNames) this.tables[name] = saved?.tables[name] ?? [];
    if (this.seed() || !text) await this.save();
  }

  /**
   * Catalogue exercises and the one local user (profile + settings), created when missing.
   * True when something changed (only then the database is written).
   */
  private seed(): boolean {
    let changed = false;
    const exercises = this.tables.exercises;
    for (const e of catalogue) {
      const existing = exercises.find((x) => x.owner_id == null && x.slug === e.slug);
      const fields = {
        name: e.name,
        primary_muscle: e.primary,
        secondary_muscles: e.secondary,
        equipment: e.equipment,
        log_type: e.log,
        image_path: e.image,
      };
      if (existing) {
        if (
          Object.entries(fields).some(([k, v]) => JSON.stringify(existing[k]) !== JSON.stringify(v))
        ) {
          Object.assign(existing, fields);
          changed = true;
        }
      } else {
        changed = true;
        exercises.push(
          withDefaults(
            'exercises',
            {
              id: catalogueId(e.slug),
              owner_id: null,
              slug: e.slug,
              ...fields,
            },
            this.userId,
          ),
        );
      }
    }
    if (!this.tables.profiles.some((p) => p.id === this.userId)) {
      this.tables.profiles.push({
        ...withDefaults('profiles', { id: this.userId }, this.userId),
        updated_at: SEEDED_AT,
      });
      changed = true;
    }
    if (!this.tables.user_settings.some((s) => s.user_id === this.userId)) {
      this.tables.user_settings.push({
        ...withDefaults('user_settings', { user_id: this.userId }, this.userId),
        updated_at: SEEDED_AT,
      });
      changed = true;
    }
    return changed;
  }

  /** Called after the app writes (the sync sends the changes soon after). */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notes rows written by the app so the sync sends them (only while tracking). */
  record(table: string, rows: Row[], op: 'upsert' | 'delete') {
    if (!this.tracking || rows.length === 0) return;
    const pk = pkOf(table);
    const now = new Date().toISOString();
    for (const r of rows) {
      const key = String(r[pk]);
      const at = op === 'delete' ? now : String(r.updated_at ?? now);
      this.outbox[outboxKey(table, key)] = { table, key, op, at };
    }
    for (const l of this.listeners) l();
  }

  /** Every row goes to the outbox (first sync of a premium account: the phone's data goes up). */
  markAllDirty() {
    for (const [table, rows] of Object.entries(this.tables)) {
      const pk = pkOf(table);
      for (const r of rows) {
        const key = String(r[pk]);
        this.outbox[outboxKey(table, key)] = {
          table,
          key,
          op: 'upsert',
          at: String(r.updated_at ?? new Date().toISOString()),
        };
      }
    }
    this.scheduleSave();
  }

  /** Forgets sent changes, unless the row changed again meanwhile. */
  settle(sent: Pending[]) {
    for (const p of sent) {
      const k = outboxKey(p.table, p.key);
      if (this.outbox[k]?.at === p.at && this.outbox[k]?.op === p.op) delete this.outbox[k];
    }
    this.scheduleSave();
  }

  /**
   * Rows from the server (other devices). The last change wins: a row this device changed later
   * stays as it is; the same row arriving twice changes nothing. Returns whether anything changed.
   */
  applyRemote(table: string, rows: Row[], deleted: { id: string; at: string }[] = []): boolean {
    const store = (this.tables[table] ??= []);
    const pk = pkOf(table);
    let changed = false;
    for (const remote of rows) {
      const key = String(remote[pk]);
      const at = String(remote.updated_at ?? '');
      const pending = this.outbox[outboxKey(table, key)];
      if (pending && pending.at > at) continue;
      const local = store.find((r) => String(r[pk]) === key);
      if (local && String(local.updated_at ?? '') > at) continue;
      const known = Object.fromEntries(
        (columns[table] ?? []).filter((c) => c in remote).map((c) => [c, remote[c]]),
      );
      if (local) {
        const next = { ...local, ...known };
        if (JSON.stringify(next) === JSON.stringify(local)) continue;
        Object.assign(local, next);
      } else store.push(withDefaults(table, known, this.userId));
      changed = true;
    }
    for (const d of deleted) {
      const pending = this.outbox[outboxKey(table, d.id)];
      if (pending && pending.at > d.at) continue;
      const i = store.findIndex((r) => String(r[pk]) === d.id);
      if (i < 0 || String(store[i].updated_at ?? '') > d.at) continue;
      store.splice(i, 1);
      changed = true;
    }
    if (changed) this.scheduleSave();
    return changed;
  }

  /** Saves soon (several writes in a row become one). */
  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 150);
  }

  async save() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    // One write at a time, in order: the last one always holds the latest state.
    const text = JSON.stringify({ format: FORMAT, tables: this.tables, outbox: this.outbox });
    this.saving = this.saving.catch(() => {}).then(() => this.kv.setText(dbKey(this.userId), text));
    await this.saving;
  }

  /** Writes what is pending and waits for it (before the app restarts for an update). */
  async flush() {
    await this.ready;
    if (this.saveTimer) await this.save();
    await this.saving.catch(() => {});
  }

  /** Empties the tables but keeps the files (they now belong to another user, see moveLocalData). */
  async wipeTables() {
    await this.ready;
    for (const name of tableNames) this.tables[name] = [];
    this.outbox = {};
    this.seed();
    await this.save();
  }

  /** Erases this user's data on the device (delete account) and starts again empty. */
  async wipe() {
    await this.ready;
    const files = [
      ...this.tables.progress_photos.map((p) => `progress-photos/${p.storage_path}`),
      ...this.tables.exercises
        .filter((e) => e.owner_id != null && e.image_path)
        .map((e) => `user-exercise-images/${e.image_path}`),
    ];
    for (const key of files) await this.kv.removeFile(key);
    for (const name of tableNames) this.tables[name] = [];
    this.outbox = {};
    this.seed();
    await this.save();
  }
}

export { columns };
