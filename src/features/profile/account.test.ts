import { useConversations } from '@/features/ai/agent/conversations';
import { useSessionStore as useAuth } from '@/features/auth/session-store';
import { haltSync, pull, resumeSync } from '@/features/premium/sync';
import { setCurrentUserId } from '@/lib/current-user';
import { getLocalClient, getLocalDb, LOCAL_USER_ID } from '@/lib/local-db';
import { getMode, setMode } from '@/lib/mode';
import { usePlanStore } from '@/lib/plan';
import { deleteAccountKeepData } from './account';

const ACC = 'dddddddd-0000-4000-8000-000000000004';
const OTHER = 'eeeeeeee-0000-4000-8000-000000000005';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** What happened, in order (server calls, sync calls). */
const mockSteps: string[] = [];
const mockServer = {
  deleteError: null as { message: string } | null,
  /** The account-less database as it was when the server was asked to delete the account. */
  localAtDelete: null as unknown,
};

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
jest.mock('@/lib/supabase', () => {
  const { getLocalClient: local, LOCAL_USER_ID: LOCAL } = jest.requireActual('@/lib/local-db');
  const { getCurrentUserId } = jest.requireActual('@/lib/current-user');
  const { kv } = jest.requireMock('@/lib/local-db/kv');
  const auth = {
    functions: {
      invoke: async (name: string) => {
        mockSteps.push(`server:${name}`);
        mockServer.localAtDelete = await kv.getText(`database-${LOCAL}.json`);
        return { data: null, error: mockServer.deleteError };
      },
    },
    auth: {
      signOut: async () => {
        mockSteps.push('signOut');
        return { error: null };
      },
      onAuthStateChange: () => undefined,
      getSession: async () => ({ data: { session: null } }),
    },
  };
  return {
    isSupabaseConfigured: true,
    getAuthClient: () => auth,
    getSupabase: () => local(getCurrentUserId() ?? LOCAL),
  };
});
jest.mock('@/features/premium/sync', () => ({
  pull: jest.fn(async () => void mockSteps.push('pull')),
  haltSync: jest.fn(() => void mockSteps.push('halt')),
  resumeSync: jest.fn(() => void mockSteps.push('resume')),
  syncKeysOf: (userId: string) => [`fft.sync.${userId}`],
  useSyncStatus: { getState: () => ({ lastAt: null }) },
}));
jest.mock('@/features/session/sync', () => ({
  syncPendingSessions: jest.fn(async () => void mockSteps.push('finishedWorkouts')),
}));
jest.mock('@/features/widgets/update', () => ({ updateWidgets: jest.fn() }));

const queryClient = { clear: jest.fn() };

async function signedIn(userId: string) {
  await setMode('cloud');
  setCurrentUserId(userId);
  useAuth.setState({ status: 'signedIn', session: null, userId });
  usePlanStore.setState({ userId, plan: 'premium', sync: 'on', home: 'online' });
  mockSteps.length = 0;
  mockServer.deleteError = null;
  mockServer.localAtDelete = null;
  jest.clearAllMocks();
}

async function water(userId: string) {
  const res = await getLocalClient(userId).from('water_logs').select('id, user_id');
  return res.data as { id: string; user_id: string }[];
}

// The tests share the device (one account-less database): they run in this order on purpose.
describe('delete the account, keep the data on this phone', () => {
  it('the server refuses: the account and its data stay, the copy is removed, the sync goes on', async () => {
    await signedIn(ACC);
    await getLocalClient(ACC)
      .from('water_logs')
      .insert({ id: id(1), day: '2026-10-16', ml: 250 });
    mockServer.deleteError = { message: 'offline' };

    expect(await deleteAccountKeepData(queryClient)).toEqual({
      ok: false,
      reason: 'failed',
      message: 'offline',
    });
    expect(mockSteps).toEqual([
      'finishedWorkouts',
      'pull',
      'halt',
      'server:delete-account',
      'resume',
    ]);
    expect(await water(ACC)).toEqual([{ id: id(1), user_id: ACC }]);
    expect(await water(LOCAL_USER_ID)).toEqual([]);
    expect(getMode()).toBe('cloud');
    expect(useAuth.getState().userId).toBe(ACC);
  });

  it('copies first, then deletes the server account, then erases the account here and goes on without one', async () => {
    await signedIn(ACC);
    const chat = useConversations.getState().create(ACC);

    const res = await deleteAccountKeepData(queryClient);
    expect(res).toEqual({ ok: true, missingFiles: 0 });
    expect(mockSteps).toEqual([
      'finishedWorkouts',
      'pull',
      'halt',
      'server:delete-account',
      'signOut',
    ]);
    // the copy was complete before the server was asked
    expect(String(mockServer.localAtDelete)).toContain(id(1));
    expect(resumeSync).not.toHaveBeenCalled();

    expect(await water(LOCAL_USER_ID)).toEqual([{ id: id(1), user_id: LOCAL_USER_ID }]);
    expect(getLocalDb(ACC).tables.water_logs).toEqual([]);
    expect(getLocalDb(ACC).outbox).toEqual({});
    expect(useConversations.getState().conversations[chat].userId).toBe(LOCAL_USER_ID);
    expect(getMode()).toBe('offline');
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', userId: LOCAL_USER_ID });
    expect(usePlanStore.getState()).toMatchObject({ userId: null, plan: null, sync: null });
    expect(queryClient.clear).toHaveBeenCalled();
  });

  it('this phone already has account-less data: nothing is deleted, nothing is asked of the server', async () => {
    await signedIn(OTHER);
    await getLocalClient(OTHER)
      .from('water_logs')
      .insert({ id: id(2), day: '2026-10-16', ml: 90 });

    expect(await deleteAccountKeepData(queryClient)).toEqual({ ok: false, reason: 'not-empty' });
    expect(mockSteps).toEqual(['finishedWorkouts', 'pull', 'halt', 'resume']);
    expect(haltSync).toHaveBeenCalledWith(OTHER);
    expect(pull).toHaveBeenCalledWith(OTHER);
    expect(await water(OTHER)).toEqual([{ id: id(2), user_id: OTHER }]);
    expect(await water(LOCAL_USER_ID)).toEqual([{ id: id(1), user_id: LOCAL_USER_ID }]);
    expect(getMode()).toBe('cloud');
  });
});
