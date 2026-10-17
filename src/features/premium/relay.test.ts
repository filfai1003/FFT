import { getLocalClient, getLocalDb, type Row } from '@/lib/local-db';
import { usePlanStore } from '@/lib/plan';
import {
  parseSecretCode,
  relayKeyFromCode,
  sealText,
  openText,
  randomBytes,
} from '@/lib/vault-crypto';
import {
  InvalidCodeError,
  joinRelay,
  loadRelay,
  relayOnce,
  removeRelayDevice,
  startRelay,
} from './relay';

const U = '22222222-3333-4444-8555-666666666666';
const OTHER = '99999999-aaaa-4bbb-8ccc-000000000001';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

jest.mock('@/lib/local-db/kv', () => {
  const texts = new Map<string, string>();
  const files = new Map<string, Uint8Array>();
  return {
    kv: {
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

// The phone's secure storage (Keychain / Keystore), in memory.
jest.mock('@/lib/secure-storage', () => {
  const store = new Map<string, string>();
  return {
    authStorage: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});

/** The server's mailbox, with the rules of …_relay.sql (own account only). */
const mockRelay = (() => {
  const devices = new Map<string, { device_id: string; name: string }>();
  const messages: { id: string; to: string; from: string; payload: string }[] = [];
  let n = 0;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === 'relay_register') {
      devices.set(String(args.p_device), {
        device_id: String(args.p_device),
        name: String(args.p_name),
      });
      return { data: null, error: null };
    }
    if (name === 'relay_list')
      return {
        data: [...devices.values()].map((d) => ({ ...d, last_seen_at: null, created_at: '' })),
        error: null,
      };
    if (name === 'relay_remove') {
      const d = String(args.p_device);
      devices.delete(d);
      for (let i = messages.length - 1; i >= 0; i--)
        if (messages[i].to === d || messages[i].from === d) messages.splice(i, 1);
      return { data: null, error: null };
    }
    if (name === 'relay_send') {
      for (const m of args.p_messages as { to: string; from: string; payload: string }[]) {
        if (!devices.has(m.to) || !devices.has(m.from))
          return { data: null, error: { message: 'row-level security', code: '42501' } };
        messages.push({ id: `m${++n}`, ...m });
      }
      return { data: null, error: null };
    }
    if (name === 'relay_fetch')
      return {
        data: messages
          .filter((m) => m.to === args.p_device)
          .slice(0, 20)
          .map((m) => ({ id: m.id, from: m.from, payload: m.payload })),
        error: null,
      };
    if (name === 'relay_ack') {
      const ids = args.p_ids as string[];
      for (let i = messages.length - 1; i >= 0; i--)
        if (ids.includes(messages[i].id) && messages[i].to === args.p_device) messages.splice(i, 1);
      return { data: null, error: null };
    }
    return { data: null, error: { message: name, code: '42883' } };
  };
  return { devices, messages, client: { rpc } };
})();
jest.mock('@/lib/supabase', () => ({ getAuthClient: () => mockRelay.client }));

const phone = () => getLocalClient(U);
const water = (key: string) => getLocalDb(U).tables.water_logs.find((r) => r.id === key);
type Message = {
  kind: 'rows' | 'file';
  rows?: { t: string; r: Row }[];
  deletes?: { t: string; id: string; at: string }[];
};

let key: Uint8Array;
let me = '';
/** What the other phone received (opened with the key, as it would). */
const inboxOfOther = (): Message[] =>
  mockRelay.messages
    .filter((m) => m.to === OTHER)
    .map((m) => JSON.parse(openText(key, m.payload, `relay:${OTHER}:${m.from}`)) as Message);
/** The other phone sends a sealed message here. */
const fromOther = (m: Message, withKey = key) =>
  mockRelay.messages.push({
    id: `o${mockRelay.messages.length + 100}`,
    to: me,
    from: OTHER,
    payload: sealText(withKey, JSON.stringify({ v: 1, ...m }), `relay:${me}:${OTHER}`),
  });

beforeAll(async () => {
  await getLocalDb(U).ready;
  usePlanStore.setState({ userId: U, plan: 'free', sync: 'off', home: 'device', categories: null });
  await phone()
    .from('water_logs')
    .insert({ id: id(1), day: '2026-10-17', ml: 250 });
});

describe('encrypted relay between phones (DECISIONS 65)', () => {
  it('the first phone makes a code (never sent to the server) and pairs itself', async () => {
    const code = await startRelay(U);
    expect(code?.qr).toMatch(/^FFTRELAY1:([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/);
    key = relayKeyFromCode(parseSecretCode(code!.text)!);
    me = (await loadRelay(U))!.deviceId;
    expect([...mockRelay.devices.keys()]).toEqual([me]);
    expect(JSON.stringify([...mockRelay.devices.values()])).not.toContain(code!.text);
  });

  it('a newly paired phone gets the whole database, sealed', async () => {
    mockRelay.devices.set(OTHER, { device_id: OTHER, name: 'Other' });
    await relayOnce(U);
    const got = inboxOfOther();
    const rows = got.flatMap((m) => m.rows ?? []);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ t: 'water_logs', r: expect.objectContaining({ ml: 250 }) }),
      ]),
    );
    expect(mockRelay.messages.every((m) => !m.payload.includes('250'))).toBe(true);
    expect((await loadRelay(U))!.sentFull).toEqual([OTHER]);
    mockRelay.messages.length = 0;
  });

  it('then only what changed goes, once', async () => {
    await phone().from('water_logs').update({ ml: 300 }).eq('id', id(1));
    await relayOnce(U);
    const rows = inboxOfOther().flatMap((m) => m.rows ?? []);
    expect(rows).toHaveLength(1);
    expect(rows[0].r).toMatchObject({ id: id(1), ml: 300 });
    expect(getLocalDb(U).outbox).toEqual({});
    await relayOnce(U);
    expect(inboxOfOther().flatMap((m) => m.rows ?? [])).toHaveLength(1);
    mockRelay.messages.length = 0;
  });

  it('a change from the other phone is applied (newest wins) and deleted from the server', async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    fromOther({
      kind: 'rows',
      rows: [{ t: 'water_logs', r: { ...water(id(1)), ml: 999, updated_at: later } }],
      deletes: [],
    });
    fromOther({
      kind: 'rows',
      rows: [
        { t: 'water_logs', r: { ...water(id(1)), ml: 1, updated_at: '2020-01-01T00:00:00.000Z' } },
      ],
      deletes: [],
    });
    expect(await relayOnce(U)).toBe(true);
    expect(water(id(1))?.ml).toBe(999);
    expect(mockRelay.messages.filter((m) => m.to === me)).toEqual([]);
  });

  it('a message sealed with another key is dropped, not applied', async () => {
    fromOther(
      {
        kind: 'rows',
        rows: [
          {
            t: 'water_logs',
            r: { ...water(id(1)), ml: 5, updated_at: new Date(Date.now() + 120_000).toISOString() },
          },
        ],
        deletes: [],
      },
      randomBytes(32),
    );
    await relayOnce(U);
    expect(water(id(1))?.ml).toBe(999);
    expect(mockRelay.messages.filter((m) => m.to === me)).toEqual([]);
  });

  it('only the shared categories are exchanged (DECISIONS 63)', async () => {
    usePlanStore.setState({ categories: ['body', 'training', 'photos'] });
    await phone()
      .from('water_logs')
      .insert({ id: id(2), day: '2026-10-17', ml: 100 });
    await relayOnce(U);
    expect(inboxOfOther().flatMap((m) => m.rows ?? [])).toEqual([]);
    fromOther({
      kind: 'rows',
      rows: [
        {
          t: 'water_logs',
          r: {
            id: id(3),
            user_id: U,
            day: '2026-10-17',
            ml: 70,
            updated_at: new Date().toISOString(),
          },
        },
      ],
      deletes: [],
    });
    await relayOnce(U);
    expect(water(id(3))).toBeUndefined();
    usePlanStore.setState({ categories: null });
  });

  it('nothing runs while the account keeps a copy on the server', async () => {
    usePlanStore.setState({ sync: 'on' });
    expect(await relayOnce(U)).toBe(false);
    usePlanStore.setState({ sync: 'off' });
  });

  it('a phone removed elsewhere stops by itself; a typed code pairs it again', async () => {
    const code = (await startRelay(U))!;
    await removeRelayDevice(U, OTHER);
    expect(mockRelay.devices.has(OTHER)).toBe(false);
    mockRelay.devices.delete(me); // removed from the other phone
    await relayOnce(U);
    expect(await loadRelay(U)).toBeNull();
    await expect(joinRelay(U, 'not a code')).rejects.toBeInstanceOf(InvalidCodeError);
    await joinRelay(U, code.text.toLowerCase());
    const again = await loadRelay(U);
    expect(again?.deviceId).not.toBe(me);
    expect(mockRelay.devices.has(again!.deviceId)).toBe(true);
  });
});
