import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncHealthConsent } from './consent-server';

const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getAuthClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));

const U = 'aaaaaaaa-0000-4000-8000-00000000000a';

describe('the health data consent, told to the server (DECISIONS 80)', () => {
  beforeEach(async () => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ error: null });
    await AsyncStorage.clear();
  });

  it('given and never withdrawn: nothing is sent (no row means given)', async () => {
    expect(await syncHealthConsent(U, false)).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('withdrawn: sent once; given again: sent once', async () => {
    expect(await syncHealthConsent(U, true)).toBe(true);
    expect(await syncHealthConsent(U, true)).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenLastCalledWith('set_health_consent', { p_granted: false });
    expect(await syncHealthConsent(U, false)).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenLastCalledWith('set_health_consent', { p_granted: true });
  });

  it('offline: not marked as told, so it is sent again later', async () => {
    mockRpc.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } });
    expect(await syncHealthConsent(U, true)).toBe(false);
    expect(await syncHealthConsent(U, true)).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});
