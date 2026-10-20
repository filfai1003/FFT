import '@/i18n';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { LabelCheck } from './CreateFoodScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('./CameraModal', () => ({ CameraModal: () => null }));
jest.mock('./label-photo', () => ({ readLabel: jest.fn() }));

describe('Create food: the label check (DECISIONS 112)', () => {
  it('shows the typed macros in their colours, read as one sentence', async () => {
    await renderUI(<LabelCheck kcal={73} protein={10} carbs={3.6} fat={2} />);
    expect(screen.getByLabelText('Protein 10 g, carbs 4 g, fat 2 g')).toBeTruthy();
    expect(screen.queryByText(/Check the label/)).toBeNull();
  });

  it('hints at a typo when the macros and the energy disagree', async () => {
    await renderUI(<LabelCheck kcal={73} protein={10} carbs={36} fat={2} />);
    expect(
      screen.getByText('These macros come to about 202 kcal, not 73. Check the label.'),
    ).toBeTruthy();
  });

  it('stays hidden until a macro is typed', async () => {
    await renderUI(<LabelCheck kcal={73} protein={null} carbs={null} fat={null} />);
    expect(screen.queryByLabelText(/Protein/)).toBeNull();
  });
});
