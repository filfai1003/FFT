import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBackground } from './background-store';

describe('background store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useBackground.setState({ mode: 'dots', loaded: false });
  });

  it('starts on the dots', async () => {
    await useBackground.getState().load();
    expect(useBackground.getState()).toMatchObject({ mode: 'dots', loaded: true });
  });

  it('keeps the chosen mode', async () => {
    await AsyncStorage.setItem('fft.background', 'black');
    await useBackground.getState().load();
    expect(useBackground.getState().mode).toBe('black');
  });

  it('turns the removed animated background into the dots', async () => {
    await AsyncStorage.setItem('fft.background', 'waves');
    await useBackground.getState().load();
    expect(useBackground.getState().mode).toBe('dots');
  });
});
