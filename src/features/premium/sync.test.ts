import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalClient, getLocalDb, writeLocalFile, type Row } from '@/lib/local-db';
import { usePlanStore } from '@/lib/plan';
import {
  checkSync,
  fetchSyncChoice,
  finishServerCleanup,
  haltSync,
  push,
  pull,
  resendAll,
  resumeSync,
  startSync,
  syncOnce,
  turnSyncOff,
  turnSyncOn,
} from './sync';

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
      readFile: async (k: string) => files.get(k) ?? null,
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
  /** Every call that reached the server (name of the RPC, or storage action). */
  const calls: string[] = [];
  /** The private buckets: bucket -> path -> bytes. */
  const files = new Map<string, Map<string, Uint8Array>>();
  const bucket = (b: string) => {
    if (!files.has(b)) files.set(b, new Map());
    return files.get(b)!;
  };
  let syncChoice: boolean | null = true;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push(name);
    if (offline) return { data: null, error: { message: 'TypeError: Failed to fetch' } };
    if (name === 'my_sync') return { data: syncChoice, error: null };
    if (name === 'set_sync') {
      // Like public.set_sync: off deletes the account's rows (the files go through storage).
      syncChoice = args.p_enabled as boolean;
      if (!syncChoice) {
        tables.clear();
        tombstones.length = 0;
      }
      return { data: null, error: null };
    }
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
    if (name === 'sync_counts') {
      const out: Record<string, number> = {};
      for (const [t, store] of tables)
        out[t] = [...store.values()].filter((r) => r.deleted_at == null).length;
      return { data: out, error: null };
    }
    return { data: null, error: { message: name, code: '42883' } };
  };
  let cursorBase = 0;
  return {
    tables,
    calls,
    bucket,
    syncChoice: () => syncChoice,
    tombstones,
    table,
    setOffline: (v: boolean) => (offline = v),
    /** Another device's change, already on the server. */
    put: (t: string, row: Row) =>
      table(t).set(String(row[pkOf(t)]), { ...row, server_at: clock++ }),
    client: {
      rpc,
      storage: {
        from: (b: string) => ({
          upload: async (path: string, bytes: ArrayBuffer) => {
            calls.push(`upload ${b}/${path}`);
            bucket(b).set(path, new Uint8Array(bytes));
            return { data: null, error: null };
          },
          download: async () => ({ data: null, error: { message: 'none' } }),
          list: async (folder: string) => {
            calls.push(`list ${b}`);
            if (offline) return { data: null, error: { message: 'Failed to fetch' } };
            const names = [...bucket(b).keys()]
              .filter((k) => k.startsWith(`${folder}/`))
              .slice(0, 100)
              .map((k) => ({ name: k.slice(folder.length + 1) }));
            return { data: names, error: null };
          },
          remove: async (paths: string[]) => {
            calls.push(`remove ${b}`);
            if (offline) return { data: null, error: { message: 'Failed to fetch' } };
            const gone = paths.filter((p) => bucket(b).delete(p)).map((name) => ({ name }));
            return { data: gone, error: null };
          },
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
    await phone()
      .from('water_logs')
      .insert({ id: id(1), day: '2026-10-14', ml: 250 });
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

    await phone()
      .from('water_logs')
      .insert({ id: id(2), day: '2026-10-14', ml: 300 });
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

  it('once per device, everything is sent again: a row the server never got arrives', async () => {
    await phone()
      .from('water_logs')
      .insert({ id: id(900), day: '2026-10-14', ml: 330 });
    await syncOnce(U);
    // As if the server had refused it back then and the outbox had dropped it.
    mockServer.table('water_logs').delete(id(900));
    getLocalDb(U).settle(Object.values(getLocalDb(U).outbox));
    await syncOnce(U);
    expect(water(id(900))).toBeUndefined(); // already resent on this device: not again
    await AsyncStorage.removeItem(`fft.sync.resent-2.${U}`);
    await syncOnce(U);
    expect(water(id(900))).toMatchObject({ ml: 330 });
  });

  it('check sync: says when this phone and the server agree, finds what is missing, sends it again', async () => {
    expect((await checkSync(U)).differences).toEqual([]);
    mockServer.table('water_logs').delete(id(900)); // lost on the server
    const check = await checkSync(U);
    expect(check.differences).toEqual([
      expect.objectContaining({ table: 'water_logs', device: expect.any(Number) }),
    ]);
    expect((await resendAll(U)).differences).toEqual([]);
    expect(water(id(900))).toMatchObject({ ml: 330 });
  });

  it('catalogue exercises are never sent', async () => {
    const pushed = [...mockServer.table('exercises').values()];
    expect(pushed.every((e) => e.owner_id === U)).toBe(true);
  });

  it('an account being deleted sends nothing more, until the deletion is called off', async () => {
    haltSync(U);
    await phone()
      .from('water_logs')
      .insert({ id: id(950), day: '2026-10-17', ml: 120 });
    expect(await syncOnce(U)).toBe(false);
    expect(await push(U)).toBe(0);
    expect(water(id(950))).toBeUndefined();
    expect(Object.keys(getLocalDb(U).outbox)).toHaveLength(1);
    resumeSync(U);
    await syncOnce(U);
    expect(water(id(950))).toMatchObject({ ml: 120 });
  });
});

// Keep a copy on the server is optional (DECISIONS 62). Runs after the tests above (same device).
describe('keep a copy on the server: on and off', () => {
  const PHOTO = id(970);
  const photoPath = `${U}/${PHOTO}.jpg`;
  const sentSince = (n: number) => mockServer.calls.slice(n);

  beforeAll(async () => {
    usePlanStore.setState({ userId: U, plan: 'free', sync: 'on', home: 'online' });
    await phone()
      .from('progress_photos')
      .insert({ id: PHOTO, day: '2026-10-17', pose: 'front', storage_path: photoPath });
    await writeLocalFile(`progress-photos/${photoPath}`, new Uint8Array([1, 2, 3]), 'image/jpeg');
    await syncOnce(U);
  });
  afterAll(() => usePlanStore.setState({ userId: null, plan: null, sync: null, home: 'device' }));

  it('on: the photo went up with its row', () => {
    expect(mockServer.table('progress_photos').get(PHOTO)).toMatchObject({ pose: 'front' });
    expect(mockServer.bucket('progress-photos').has(photoPath)).toBe(true);
  });

  it('the server says whether the account keeps a copy', async () => {
    expect(await fetchSyncChoice()).toBe('on');
  });

  it('turning it off deletes the copy and its files; this phone keeps everything', async () => {
    // A file this phone never downloaded goes too (listed on the server).
    mockServer.bucket('user-exercise-images').set(`${U}/other-phone.jpg`, new Uint8Array([9]));
    await turnSyncOff(U);
    expect(mockServer.syncChoice()).toBe(false);
    expect(mockServer.table('water_logs').size).toBe(0);
    expect(mockServer.bucket('progress-photos').size).toBe(0);
    expect(mockServer.bucket('user-exercise-images').size).toBe(0);
    expect(usePlanStore.getState()).toMatchObject({ sync: 'off', home: 'device' });
    expect(localWater(id(950))).toMatchObject({ ml: 120 });
    expect(getLocalDb(U).tables.progress_photos.some((r) => r.id === PHOTO)).toBe(true);
    expect(getLocalDb(U).tracking).toBe(false);
    expect(getLocalDb(U).outbox).toEqual({});
    expect(await fetchSyncChoice()).toBe('off');
  });

  it('off: nothing is sent or fetched, whatever happens on the phone', async () => {
    const before = mockServer.calls.length;
    getLocalDb(U).tracking = true; // even if something noted a change
    await phone()
      .from('water_logs')
      .insert({ id: id(980), day: '2026-10-17', ml: 400 });
    expect(await syncOnce(U)).toBe(false);
    expect(await push(U)).toBe(0);
    expect(await pull(U, { full: true })).toBe(false);
    expect(sentSince(before)).toEqual([]);
    expect(water(id(980))).toBeUndefined();
    getLocalDb(U).tracking = false;
  });

  it('turning it on again sends the whole phone, photos included', async () => {
    await turnSyncOn(U);
    expect(mockServer.syncChoice()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ sync: 'on', home: 'online' });
    // Every own row is queued, also the ones written while it was off.
    expect(Object.keys(getLocalDb(U).outbox)).toEqual(
      expect.arrayContaining([
        `water_logs:${id(950)}`,
        `water_logs:${id(980)}`,
        `progress_photos:${PHOTO}`,
      ]),
    );
    await syncOnce(U);
    expect(water(id(950))).toMatchObject({ ml: 120 });
    expect(water(id(980))).toMatchObject({ ml: 400 });
    expect(mockServer.table('progress_photos').get(PHOTO)).toMatchObject({ pose: 'front' });
    expect(mockServer.bucket('progress-photos').has(photoPath)).toBe(true);
    expect(getLocalDb(U).outbox).toEqual({});
  });

  it('turning it off without network changes nothing; the sync goes on', async () => {
    mockServer.setOffline(true);
    await expect(turnSyncOff(U)).rejects.toThrow();
    mockServer.setOffline(false);
    expect(mockServer.syncChoice()).toBe(true);
    expect(usePlanStore.getState()).toMatchObject({ sync: 'on', home: 'online' });
    await phone()
      .from('water_logs')
      .insert({ id: id(990), day: '2026-10-17', ml: 90 });
    await syncOnce(U);
    expect(water(id(990))).toMatchObject({ ml: 90 });
  });

  it('files the network dropped during a turn-off are removed at the next start', async () => {
    const realFrom = mockServer.client.storage.from;
    let failing = true;
    mockServer.client.storage.from = (b: string) => {
      const real = realFrom(b);
      return {
        ...real,
        remove: async (paths: string[]) =>
          failing ? { data: null, error: { message: 'Failed to fetch' } } : real.remove(paths),
      };
    };
    await turnSyncOff(U);
    expect(mockServer.bucket('progress-photos').has(photoPath)).toBe(true); // still there
    failing = false;
    expect(await finishServerCleanup(U)).toBe(true);
    expect(mockServer.bucket('progress-photos').size).toBe(0);
    mockServer.client.storage.from = realFrom;
  });
});
