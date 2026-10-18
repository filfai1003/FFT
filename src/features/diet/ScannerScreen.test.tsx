import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { contrastRatio } from '@/design/contrast';
import { palettes } from '@/design/tokens';
import { usePreferencesStore } from '@/features/settings/preferences-store';
import { renderUI } from '@/test/render';
import { ScannerScreen } from './ScannerScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));
jest.mock('./CreateFoodScreen', () => ({ useLabelReader: () => async () => false }));
jest.mock('./off', () => ({ lookupBarcode: jest.fn() }));

const colorOf = (el: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(el.props.style as never) as { color?: string }).color;

describe('Scanner', () => {
  beforeEach(() => usePreferencesStore.setState({ theme: 'light' }));

  it('uses the dark palette on its black ground even when the app is light', async () => {
    await renderUI(<ScannerScreen />);
    const dark = palettes.dark;
    expect(colorOf(screen.getByText('Scan'))).toBe(dark.textMuted);
    expect(colorOf(screen.getByText('Point the camera at the barcode'))).toBe(dark.textMuted);
    expect(contrastRatio(dark.textMuted, dark.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('torch button: its own glyph, a label and a selected state that follow on/off', async () => {
    await renderUI(<ScannerScreen />);
    const off = screen.getByRole('button', { name: 'Turn on flashlight' });
    expect(off.props.accessibilityState).toEqual({ disabled: false, selected: false });
    await fireEvent.press(off);
    const on = screen.getByRole('button', { name: 'Turn off flashlight' });
    expect(on.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(StyleSheet.flatten(on.props.style)).toMatchObject({
      borderWidth: 2,
      borderColor: palettes.dark.text,
    });
  });
});
