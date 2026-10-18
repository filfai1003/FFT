import { createLocalClient } from '@/lib/local-db/client';
import { LocalDb, type Kv } from '@/lib/local-db/engine';
import { LOCAL_USER_ID } from '@/lib/local-db/schema';
import { emptyDraft } from './logic';
import { completeOnboarding } from './submit';

function memoryKv(): Kv {
  const texts = new Map<string, string>();
  return {
    getText: async (k) => texts.get(k) ?? null,
    setText: async (k, v) => void texts.set(k, v),
    putFile: async () => undefined,
    fileUrl: async () => null,
    readFile: async () => null,
    removeFile: async () => undefined,
    clearAll: async () => texts.clear(),
  };
}

const mockClient = createLocalClient(new LocalDb(memoryKv(), LOCAL_USER_ID));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockClient }));

const now = new Date(2026, 9, 18, 10);

describe('finishing the onboarding with only the required inputs (DECISIONS 103)', () => {
  it('refuses without the name or the 18+ confirmation', async () => {
    expect(await completeOnboarding(emptyDraft, LOCAL_USER_ID, 'My meals', now)).toBe(
      'NAME_AND_AGE_REQUIRED',
    );
    expect(
      await completeOnboarding({ ...emptyDraft, name: 'Alex' }, LOCAL_USER_ID, 'My meals', now),
    ).toBe('NAME_AND_AGE_REQUIRED');
  });

  it('a skipped setup leaves the details empty, keeps a safe default target, no weight row', async () => {
    const error = await completeOnboarding(
      { ...emptyDraft, name: ' Alex ', adultConfirmed: true, consentHealth: true },
      LOCAL_USER_ID,
      'My meals',
      now,
    );
    expect(error).toBeNull();
    const { data: profile } = await mockClient
      .from('profiles')
      .select('*')
      .eq('id', LOCAL_USER_ID)
      .single();
    expect(profile).toMatchObject({
      name: 'Alex',
      birth_date: null,
      sex: null,
      height_cm: null,
      goal: null,
      activity_level: null,
      diet_mode: 'tracking',
      adult_confirmed_at: now.toISOString(),
      onboarding_completed_at: now.toISOString(),
    });
    const { data: weights } = await mockClient.from('body_metrics').select('id');
    expect(weights).toEqual([]);
    const { data: goals } = await mockClient
      .from('nutrition_goals')
      .select('kcal, maintenance_kcal, protein_g');
    expect(goals).toEqual([{ kcal: 2000, maintenance_kcal: null, protein_g: 125 }]);
  });
});
