import AsyncStorage from '@react-native-async-storage/async-storage';
import { planKeyOf, planOf, resetPlan, usePlanStore } from './plan';

describe('planOf (the widget task, DECISIONS 118)', () => {
  afterEach(() => resetPlan());

  it('reads the current account from the store and another one from the device', async () => {
    usePlanStore.setState({ userId: 'u1', plan: 'supporter' });
    expect(await planOf('u1')).toBe('supporter');
    await AsyncStorage.setItem(planKeyOf('u2'), JSON.stringify({ plan: 'premium' }));
    expect(await planOf('u2')).toBe('premium');
    // Reading it does not switch the store to that account.
    expect(usePlanStore.getState().userId).toBe('u1');
    expect(await planOf('nobody')).toBeNull();
  });
});
