import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { useOnboardingStore } from './draft-store';
import { OnboardingFlow } from './OnboardingFlow';

jest.mock('@/lib/mode', () => ({ getMode: () => 'local' }));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn() }));
jest.mock('@/features/premium/ConnectAiButtons', () => ({ ConnectAiButtons: () => null }));
jest.mock('@/features/premium/ServerCopy', () => ({ SyncNeededCard: () => null }));
jest.mock('@/lib/plan', () => ({
  ...jest.requireActual('@/lib/plan'),
  useSyncChoice: () => 'off',
}));
jest.mock('@/features/legal/LegalLinks', () => ({ LegalLinks: () => null }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const disabled = (name: string) =>
  screen.getByRole('button', { name }).props.accessibilityState?.disabled === true;

describe('onboarding: only the name and 18+ are required (DECISIONS 103)', () => {
  beforeEach(() => useOnboardingStore.getState().reset());

  it('"About you" first: the other details are optional, "Skip setup" needs name and 18+', async () => {
    await renderUI(<OnboardingFlow />);
    expect(screen.getByText('About you')).toBeTruthy();
    expect(screen.getByText('Birth date (optional)')).toBeTruthy();
    // Progress once: the bar (read as the step), no second "Step x of y" line.
    expect(screen.getByLabelText(/^Step 1 of [0-9]+$/)).toBeTruthy();
    expect(screen.queryByText(/^Step 1 of/)).toBeNull();
    expect(disabled('Continue')).toBe(true);
    expect(disabled('Skip setup')).toBe(true);

    await fireEvent.changeText(screen.getByLabelText('Name'), 'Alex');
    expect(disabled('Continue')).toBe(true);
    await fireEvent(screen.getByRole('switch', { name: 'I am 18 or older' }), 'valueChange', true);
    expect(disabled('Continue')).toBe(false);
    expect(disabled('Skip setup')).toBe(false);

    // A birth date typed must still be 18+.
    await fireEvent.changeText(screen.getByLabelText('Year of birth'), '2015');
    await fireEvent.changeText(screen.getByLabelText('Day of birth'), '01');
    await fireEvent.changeText(screen.getByLabelText('Month of birth'), '01');
    expect(disabled('Continue')).toBe(true);
  });

  it('a disabled "Continue" says why under it, and reads it as its hint', async () => {
    const reason = (text: string) => screen.queryByText(text, { includeHiddenElements: true });
    await renderUI(<OnboardingFlow />);
    expect(reason('Enter your name to continue.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).props.accessibilityHint).toBe(
      'Enter your name to continue.',
    );
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Alex');
    expect(reason('Confirm you are 18 or older to continue.')).toBeTruthy();
    await fireEvent(screen.getByRole('switch', { name: 'I am 18 or older' }), 'valueChange', true);
    expect(reason('Confirm you are 18 or older to continue.')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Continue' }).props.accessibilityHint,
    ).toBeUndefined();
  });

  it('"Skip setup" goes to the health data consent, which cannot be skipped', async () => {
    useOnboardingStore.getState().patch({ name: 'Alex', adultConfirmed: true });
    await renderUI(<OnboardingFlow />);
    await fireEvent.press(screen.getByRole('button', { name: 'Skip setup' }));
    expect(screen.getByText('Your health data')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip this step' })).toBeNull();
    expect(disabled('Start using the app')).toBe(true);
  });

  it('later steps have "Skip"', async () => {
    useOnboardingStore.getState().patch({ name: 'Alex', adultConfirmed: true });
    await renderUI(<OnboardingFlow />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Your goal')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip this step' }));
    expect(screen.getByText('Your routine')).toBeTruthy();
  });
});
