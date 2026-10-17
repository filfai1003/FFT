import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import '@/i18n';
import { useSessionStore } from '@/features/auth/session-store';
import { usePlanStore } from '@/lib/plan';
import { WrongSecretError } from '@/lib/vault-crypto';
import { renderUI } from '@/test/render';
import { EncryptedApiCard, TurnEncryptionOnSheet, VaultUnlockScreen } from './Encryption';

const mockSetUp = jest.fn(async (..._a: unknown[]) => 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789');
const mockOn = jest.fn(async (..._a: unknown[]) => undefined);
const mockUnlock = jest.fn(async (..._a: unknown[]): Promise<void> => undefined);
jest.mock('./vault', () => ({
  setUpEncryption: (...a: unknown[]) => mockSetUp(...a),
  turnEncryptionOn: (...a: unknown[]) => mockOn(...a),
  turnEncryptionOff: jest.fn(),
  changePassphrase: jest.fn(),
  unlockEncryption: (...a: unknown[]) => mockUnlock(...a),
}));
jest.mock('@/features/auth/api', () => ({ signOut: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const U = '11111111-2222-4333-8444-555555555555';
const withQuery = (ui: React.ReactElement) =>
  renderUI(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

beforeEach(() => {
  useSessionStore.setState({ status: 'signedIn', session: null, userId: U });
  jest.clearAllMocks();
});

describe('end-to-end encryption screens', () => {
  it('turning it on: says what it means, checks the passphrase, shows the recovery key once', async () => {
    await withQuery(<TurnEncryptionOnSheet visible onClose={jest.fn()} />);
    expect(screen.getByText(/API and AI apps .* stop working/)).toBeTruthy();
    expect(screen.getByText(/cannot be read by anyone/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Passphrase'), 'short');
    await fireEvent.press(screen.getByRole('button', { name: 'Make my key' }));
    expect(screen.getByText('Use at least 10 characters.')).toBeTruthy();
    expect(mockSetUp).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Passphrase'), 'a long passphrase');
    await fireEvent.changeText(screen.getByLabelText('Passphrase again'), 'a long passphrasE');
    await fireEvent.press(screen.getByRole('button', { name: 'Make my key' }));
    expect(screen.getByText('The two passphrases are not the same.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Passphrase again'), 'a long passphrase');
    await fireEvent.press(screen.getByRole('button', { name: 'Make my key' }));
    await waitFor(() =>
      expect(screen.getByText('ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789')).toBeTruthy(),
    );
    expect(mockSetUp).toHaveBeenCalledWith(U, 'a long passphrase');
    // Encrypting waits for "I saved it".
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on encryption' }));
    expect(mockOn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I saved my recovery key' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Turn on encryption' }));
    await waitFor(() => expect(mockOn).toHaveBeenCalledWith(U));
  });

  it('another device: a wrong passphrase is said clearly; the recovery key is one tap away', async () => {
    mockUnlock.mockRejectedValueOnce(new WrongSecretError());
    const onDone = jest.fn();
    await withQuery(<VaultUnlockScreen onDone={onDone} onLater={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Passphrase'), 'nope nope nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Open my data' }));
    await waitFor(() => expect(screen.getByText('That is not the right passphrase.')).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Use my recovery key instead' }));
    await fireEvent.changeText(screen.getByLabelText('Recovery key'), 'ABCD');
    await fireEvent.press(screen.getByRole('button', { name: 'Open my data' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockUnlock).toHaveBeenLastCalledWith(U, 'ABCD', 'recovery');
    expect(screen.getByRole('button', { name: 'Not now' })).toBeTruthy();
  });

  it('the API page says the API is off while the copy is encrypted', async () => {
    usePlanStore.setState({ userId: U, sync: 'on', encrypted: true });
    await withQuery(<EncryptedApiCard />);
    expect(screen.getByText('API and AI apps are off')).toBeTruthy();
  });
});
