import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAiAccessStore } from '@/features/ai/access';
import { useConversations } from '@/features/ai/agent/conversations';
import { useAiSettings } from '@/features/ai/settings-store';
import { forgetAccountOnDevice } from './forget-device';

jest.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));
const mockSecure = new Map<string, string>();
jest.mock('@/lib/secure-storage', () => ({
  authStorage: {
    getItem: async (k: string) => mockSecure.get(k) ?? null,
    setItem: async (k: string, v: string) => void mockSecure.set(k, v),
    removeItem: async (k: string) => void mockSecure.delete(k),
  },
}));

const U = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b';

describe('"Delete everything" forgets every per-account key on the device (DECISIONS 82)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockSecure.clear();
    for (const k of [
      `fft.sync.${U}`,
      `fft.sync.sealed.${U}`,
      `fft.sync.resent-2.${U}`,
      `fft.relay.${U}`,
      `fft.plan.${U}`,
      `fft.consent-server.${U}`,
      `fft.sync.${OTHER}`,
    ])
      await AsyncStorage.setItem(k, 'x');
    mockSecure.set(`fft.relay-code.${U}`, 'code');
    mockSecure.set(`fft.vault-key.${U}`, 'key');
    mockSecure.set('fft.ai-settings', JSON.stringify({ provider: 'openai', apiKey: 'sk-mine' }));
    useAiAccessStore.setState({
      byUser: { [U]: { profile: true } as never, [OTHER]: { profile: true } as never },
    });
    useConversations.getState().create(U);
    await useAiSettings.getState().load();
  });

  it('removes the account keys, its AI choices, conversations and the AI key', async () => {
    await forgetAccountOnDevice(U);
    const left = await AsyncStorage.getAllKeys();
    expect(left.filter((k) => k.includes(U))).toEqual([]);
    expect(left).toContain(`fft.sync.${OTHER}`);
    expect(mockSecure.has(`fft.relay-code.${U}`)).toBe(false);
    expect(mockSecure.has(`fft.vault-key.${U}`)).toBe(false);
    expect(mockSecure.has('fft.ai-settings')).toBe(false);
    expect(useAiSettings.getState().apiKey).toBe('');
    expect(Object.keys(useAiAccessStore.getState().byUser)).toEqual([OTHER]);
    expect(
      Object.values(useConversations.getState().conversations).filter((c) => c.userId === U),
    ).toEqual([]);
  });

  it('keeping the data on the phone keeps the AI settings', async () => {
    await forgetAccountOnDevice(U, { keepAiSettings: true });
    expect(mockSecure.has('fft.ai-settings')).toBe(true);
  });
});
