import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBackground } from './background-store';

describe('background store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useBackground.setState({ mode: 'dots', health: 'untested', loaded: false });
  });

  it('starts on the plain dots', async () => {
    await useBackground.getState().load();
    expect(useBackground.getState()).toMatchObject({
      mode: 'dots',
      health: 'untested',
      loaded: true,
    });
  });

  it('keeps the chosen mode and a healthy result', async () => {
    await AsyncStorage.setItem('fft.background', 'waves');
    await AsyncStorage.setItem('fft.waves-health', 'ok');
    await useBackground.getState().load();
    expect(useBackground.getState()).toMatchObject({ mode: 'waves', health: 'ok' });
  });

  it('switches the waves off when the last start with them never got to ok', async () => {
    await AsyncStorage.setItem('fft.background', 'waves');
    await AsyncStorage.setItem('fft.waves-health', 'trying');
    await useBackground.getState().load();
    expect(useBackground.getState().health).toBe('failed');
    expect(await AsyncStorage.getItem('fft.waves-health')).toBe('failed');
  });
});
