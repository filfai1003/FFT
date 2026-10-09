import { catalogue } from './catalogue';
import { columns, LOCAL_USER_ID, tableNames, withDefaults, type Row } from './schema';

/** Where the on-device database and its files live (IndexedDB on the web, files on devices). */
export type Kv = {
  getText(key: string): Promise<string | null>;
  setText(key: string, text: string): Promise<void>;
  putFile(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  fileUrl(key: string): Promise<string | null>;
  removeFile(key: string): Promise<void>;
  clearAll(): Promise<void>;
};

const DB_KEY = 'database.json';
const FORMAT = 1;

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
  readonly ready: Promise<void>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly kv: Kv) {
    this.ready = this.load();
  }

  private async load() {
    const text = await this.kv.getText(DB_KEY);
    let saved: Record<string, Row[]> = {};
    if (text) {
      try {
        const parsed = JSON.parse(text) as { format: number; tables: Record<string, Row[]> };
        if (parsed.format === FORMAT) saved = parsed.tables;
      } catch {
        saved = {}; // unreadable file: start clean rather than crash
      }
    }
    for (const name of tableNames) this.tables[name] = saved[name] ?? [];
    this.seed();
  }

  /** Catalogue exercises and the one local user (profile + settings), created when missing. */
  private seed() {
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
      if (existing) Object.assign(existing, fields);
      else
        exercises.push(
          withDefaults('exercises', {
            id: catalogueId(e.slug),
            owner_id: null,
            slug: e.slug,
            ...fields,
          }),
        );
    }
    if (!this.tables.profiles.some((p) => p.id === LOCAL_USER_ID))
      this.tables.profiles.push(withDefaults('profiles', { id: LOCAL_USER_ID }));
    if (!this.tables.user_settings.some((s) => s.user_id === LOCAL_USER_ID))
      this.tables.user_settings.push(withDefaults('user_settings', { user_id: LOCAL_USER_ID }));
    void this.save();
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
    await this.kv.setText(DB_KEY, JSON.stringify({ format: FORMAT, tables: this.tables }));
  }

  /** Erases everything on the device (delete account) and starts again empty. */
  async wipe() {
    await this.ready;
    await this.kv.clearAll();
    for (const name of tableNames) this.tables[name] = [];
    this.seed();
    await this.save();
  }
}

export { columns };
