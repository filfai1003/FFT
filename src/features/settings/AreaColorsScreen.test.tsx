import '@/i18n';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useAppearanceStore } from '@/design/appearance-store';
import { areaFamilies } from '@/design/tokens';
import { usePlanStore } from '@/lib/plan';
import { useToastStore } from '@/lib/toast-store';
import { renderUI } from '@/test/render';
import { LookSection } from '@/features/profile/SettingsScreen';
import { AreaColorsScreen } from './AreaColorsScreen';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getState: () => ({ routes: [] }) }),
}));

/** The swatches of one area (its radio group). */
const row = (area: string) => within(screen.getByLabelText(area));

describe('Area colours (DECISIONS 118)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    useAppearanceStore.getState().reset();
    usePlanStore.setState({ plan: 'supporter' });
  });
  afterAll(() => usePlanStore.setState({ plan: null }));

  it('Supporter: a swatch changes the area, the theme follows, Reset brings the defaults back (with undo)', async () => {
    await renderUI(<AreaColorsScreen />);
    // Three radio groups, one per area, the default checked.
    expect(screen.getByLabelText('Training')).toBeTruthy();
    expect(screen.getByLabelText('Nutrition')).toBeTruthy();
    expect(screen.getByLabelText('Streak and achievements')).toBeTruthy();
    expect(screen.queryByText('Supporter')).toBeNull();

    const trainingBlue = row('Training').getByRole('radio', { name: 'Blue' });
    await fireEvent.press(trainingBlue);
    expect(useAppearanceStore.getState().areaColors).toEqual({ training: 'blue' });
    expect(row('Training').getByRole('radio', { name: 'Blue' })).toBeChecked();
    // The preview (tiles and ring track in the soft colour) follows.
    expect(JSON.stringify(screen.toJSON())).toContain(areaFamilies.blue.light.soft);

    await fireEvent.press(screen.getByRole('button', { name: 'Reset to default' }));
    expect(useAppearanceStore.getState().areaColors).toEqual({});
    await act(async () => {
      const toast = useToastStore.getState().toast!;
      useToastStore.getState().runAction(toast.id);
    });
    expect(useAppearanceStore.getState().areaColors).toEqual({ training: 'blue' });
  });

  it('a colour another area shows cannot be taken and says which area has it', async () => {
    await renderUI(<AreaColorsScreen />);
    // Teal is nutrition's: in the training row it is disabled.
    const taken = row('Training').getByRole('radio', { name: 'Teal, used by Nutrition' });
    expect(taken).toBeDisabled();
    await fireEvent.press(taken);
    expect(useAppearanceStore.getState().areaColors).toEqual({});
    // Nutrition has no pink at all (protein).
    expect(row('Nutrition').queryByRole('radio', { name: 'Pink' })).toBeNull();
    expect(row('Training').getByRole('radio', { name: 'Pink' })).toBeTruthy();
    expect(screen.getByText(/Nutrition is never pink/)).toBeTruthy();
  });

  it('Free: the Supporter tag, the swatches open the plans, the app keeps the defaults', async () => {
    usePlanStore.setState({ plan: 'free' });
    useAppearanceStore.setState({ areaColors: { training: 'blue' } });
    await renderUI(<AreaColorsScreen />);
    expect(screen.getAllByText('Supporter').length).toBeGreaterThan(0);
    // The saved choice is kept, and said so.
    expect(screen.getByText(/Your colours are kept/)).toBeTruthy();
    // The default is checked: that is what the app shows.
    expect(row('Training').getByRole('radio', { name: /^Purple\. Needs Supporter/ })).toBeChecked();
    // The preview tiles (soft colours) stay purple.
    expect(JSON.stringify(screen.toJSON())).not.toContain(areaFamilies.blue.light.soft);
    expect(JSON.stringify(screen.toJSON())).toContain(areaFamilies.purple.light.soft);
    await fireEvent.press(row('Training').getByRole('radio', { name: /^Blue\. Needs Supporter/ }));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/premium');
    expect(useAppearanceStore.getState().areaColors).toEqual({ training: 'blue' });
    await fireEvent.press(screen.getByRole('button', { name: 'What is Supporter?' }));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/premium');
  });

  it('the Look section has an Area colours row with the Supporter tag on Free', async () => {
    usePlanStore.setState({ plan: 'free' });
    await renderUI(<LookSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Area colours, Supporter' }));
    expect(mockPush).toHaveBeenLastCalledWith('/profile/area-colors');
    await act(async () => {
      usePlanStore.setState({ plan: 'premium' });
    });
    expect(screen.getByRole('button', { name: 'Area colours' })).toBeTruthy();
  });
});
