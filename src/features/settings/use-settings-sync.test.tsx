import { act } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { useSessionStore } from '@/features/auth/session-store';
import { usePreferencesStore } from './preferences-store';
import { useSettingsSync } from './use-settings-sync';

// A builder like supabase-js / local-db: nothing runs until then() is called.
const mockRan: { op: string; payload?: unknown }[] = [];
function mockBuilder(op: string, payload?: unknown) {
  const self = {
    select: () => mockBuilder('select'),
    update: (p: unknown) => mockBuilder('update', p),
    eq: () => self,
    maybeSingle: () => self,
    then(ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) {
      mockRan.push({ op, payload });
      return Promise.resolve({ data: null, error: null }).then(ok, bad);
    },
  };
  return self;
}
jest.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: () => mockBuilder('from') }),
}));

function Probe() {
  useSettingsSync();
  return null;
}

describe('settings sync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRan.length = 0;
  });
  afterEach(() => jest.useRealTimers());

  it('really saves a changed setting (the update query is run, not only built)', async () => {
    useSessionStore.setState({ userId: 'u1' } as never);
    await renderUI(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => usePreferencesStore.getState().set('weightUnit', 'lb'));
    await act(async () => {
      jest.advanceTimersByTime(700);
      await Promise.resolve();
    });
    const saved = mockRan.find((r) => r.op === 'update');
    expect(saved).toBeTruthy();
    expect(saved?.payload).toMatchObject({ weight_unit: 'lb' });
  });
});
