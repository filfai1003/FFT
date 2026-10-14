import { getLocalClient, getLocalDb, type Row } from '@/lib/local-db';
import { push, pull, startSync, syncOnce } from './sync';

const U = '11111111-2222-4333-8444-555555555555';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

jest.mock('@/lib/local-db/kv', () => {
  const texts = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  return {
    kv: {
      files,
      getText: async (k: string) => texts.get(k) ?? null,
      setText: async (k: string, v: string) => void texts.set(k, v),
      putFile: async (k: string, b: Uint8Array) => void files.set(k, b),
      fileUrl: async (k: string) => (files.has(k) ? `mem:${k}` : null),
      removeFile: async (k: string) => void files.delete(k),
      clearAll: async () => undefined,
    },
  };
});

/** The server, with the same rules as sync_push / sync_pull (supabase/migrations/…_sync.sql). */
const mockServer = (() => {
  const tables = new Map<string, Map<string, Row & { server_at: number }>>();
  const tombstones: { table: string; id: string; at: string; server_at: number }[] = [];
  let clock = 1;
  let offline = false;
  const pkOf = (t: string) => (t === 'user_settings' ? 'user_id' : 'id');
  const table = (t: string) => {
    if (!tables.has(t)) tables.set(t, new Map());
    return tables.get(t)!;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (offline) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    if (name === 'sync_push') {
      const t = args.p_table as string;
      const store = table(t);
      for (const row of args.p_rows as Row[]) {
        const key = String(row[pkOf(t)]);
        const old = store.get(key);
        if (old && String(old.updated_at) > String(row.updated_at)) continue; // newest wins
        store.set(key, { ...row, server_at: clock++ });
      }
      for (const d of args.p_deletes as { id: string; at: string }[]) {
        const old = store.get(d.id);
        if (!old || String(old.updated_at) > d.at) continue;
        store.delete(d.id);
        tombstones.push({ table: t, id: d.id, at: new Date().toISOString(), server_at: clock++ });
      }
      return { data: null, error: null };
    }
    if (name === 'sync_pull') {
      const since = new Date(args.p_since as string).getTime() === 0 ? 0 : cursorBase;
      const out: Record<string, unknown> = { now: new Date(Date.now()).toISOString() };
      for (const [t, store] of tables)
        out[t] = [...store.values()]
          .filter((r) => r.server_at > since)
          .map(({ server_at: _s, ...r }) => r);
      out.tombstones = tombstones.filter((x) => x.server_at > since);
      cursorBase = clock;
      return { data: out, error: null };
    }
    return { data: null, error: { message: name, code: '42883' } };
  };
  let cursorBase = 0;
  return {
    tables,
    tombstones,
    table,
    setOffline: (v: boolean) => (offline = v),
    /** Another device's change, already on the server. */
    put: (t: string, row: Row) => table(t).set(String(row[pkOf(t)]), { ...row, server_at: clock++ }),
    client: {
      rpc,
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          download: async () => ({ data: null, error: { message: 'none' } }),
          remove: async () => ({ data: null, error: null }),
        }),
      },
    },
  };
})();
jest.mock('@/lib/supabase', () => ({ getAuthClient: () => mockServer.client }));

const phone = () => getLocalClient(U);
const water = (key: string) => mockServer.table('water_logs').get(key);
const localWater = (key: string) => getLocalDb(U).tables.water_logs.find((r) => r.id === key);

beforeAll(async () => {
  await getLocalDb(U).ready;
  await startSync(U); // premium on this device: everything is tracked from now on
});

describe('premium sync', () => {
  it('works on the device first, then sends the change in the background', async () => {
    await phone().from('water_logs').insert({ id: id(1), day: '2026-10-14', ml: 250 });
    expect(localWater(id(1))?.ml).toBe(250); // instant, no server involved
    expect(water(id(1))).toBeUndefined();
    await syncOnce(U);
    expect(water(id(1))?.ml).toBe(250);
    expect(getLocalDb(U).outbox).toEqual({});
  });

  it('offline: changes wait in the outbox and go when the network is back', async () => {
    mockServer.setOffline(true);
    await phone().from('water_logs').update({ ml: 500 }).eq('id', id(1));
    await expect(syncOnce(U)).rejects.toThrow();
    expect(localWater(id(1))?.ml).toBe(500);
    expect(Object.keys(getLocalDb(U).outbox)).toHaveLength(1);
    mockServer.setOffline(false);
    await syncOnce(U);
    expect(water(id(1))?.ml).toBe(500);
  });

  it('the same change made twice is sent and stored once', async () => {
    await phone().from('water_logs').update({ ml: 750 }).eq('id', id(1));
    await phone().from('water_logs').update({ ml: 750 }).eq('id', id(1));
    expect(Object.keys(getLocalDb(U).outbox)).toHaveLength(1);
    await push(U);
    expect([...mockServer.table('water_logs').keys()].filter((k) => k === id(1))).toHaveLength(1);
    expect(water(id(1))?.ml).toBe(750);
  });

  it('another device changed it later: its change wins here too', async () => {
    mockServer.put('water_logs', {
      ...water(id(1)),
      ml: 1000,
      updated_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await pull(U);
    expect(localWater(id(1))?.ml).toBe(1000);
  });

  it('this device changed it later than the other: this change wins everywhere', async () => {
    mockServer.put('water_logs', {
      ...water(id(1)),
      ml: 111,
      updated_at: '2026-01-01T00:00:00.000Z', // made long ago on an offline phone
    });
    await phone().from('water_logs').update({ ml: 1250 }).eq('id', id(1));
    await syncOnce(U);
    expect(localWater(id(1))?.ml).toBe(1250);
    expect(water(id(1))?.ml).toBe(1250);
  });

  it('deletions go both ways', async () => {
    await phone().from('water_logs').delete().eq('id', id(1));
    await syncOnce(U);
    expect(water(id(1))).toBeUndefined();

    await phone().from('water_logs').insert({ id: id(2), day: '2026-10-14', ml: 300 });
    await syncOnce(U);
    // Another device deletes it.
    mockServer.table('water_logs').delete(id(2));
    mockServer.tombstones.push({
      table: 'water_logs',
      id: id(2),
      at: new Date(Date.now() + 60_000).toISOString(),
      server_at: 10_000,
    });
    await pull(U, { full: true });
    expect(localWater(id(2))).toBeUndefined();
  });

  it('catalogue exercises are never sent', async () => {
    const pushed = [...mockServer.table('exercises').values()];
    expect(pushed.every((e) => e.owner_id === U)).toBe(true);
  });
});
