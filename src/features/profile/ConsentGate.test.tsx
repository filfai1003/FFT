import '@/i18n';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { POLICY_VERSION } from '@/features/onboarding/logic';
import { consentOutdated, type Consent } from './account';
import { ConsentGate } from './ConsentGate';

const mockMutate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({}),
}));
jest.mock('./account', () => ({
  ...jest.requireActual('./account'),
  useSetConsent: () => ({ mutate: mockMutate, isPending: false }),
  deleteAccount: jest.fn(),
  logOutAnyway: jest.fn(),
}));
jest.mock('./export', () => ({
  deliverFile: jest.fn(),
  exportFileNames: { full: () => 'x.zip' },
  fullExportZip: jest.fn(),
}));
jest.mock('@/lib/legal', () => ({ openLegal: jest.fn() }));

const consent = (policyVersion: string | null, withdrawnAt: string | null = null): Consent => ({
  id: '1',
  type: 'health_data',
  grantedAt: '2026-10-01T10:00:00Z',
  withdrawnAt,
  policyVersion,
});

describe('confirming the consent again after the text changed (DECISIONS 99)', () => {
  beforeEach(() => mockMutate.mockReset());

  it('asks only when the consent in force is for an older version', () => {
    expect(consentOutdated([consent('v1-2026-10')])).toBe(true);
    expect(consentOutdated([consent(null)])).toBe(true);
    expect(consentOutdated([consent(POLICY_VERSION)])).toBe(false);
    // Withdrawn is the other gate, never this one.
    expect(consentOutdated([consent('v1-2026-10', '2026-10-02T10:00:00Z')])).toBe(false);
    expect(consentOutdated([])).toBe(false);
  });

  it('"I agree, continue" records the consent and opens the app, even if recording fails', async () => {
    const onContinue = jest.fn();
    await renderUI(<ConsentGate reconfirm onContinue={onContinue} />);
    expect(screen.getByRole('header', { name: 'Please confirm your consent' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'I agree, continue' }));
    expect(mockMutate).toHaveBeenCalledWith(
      { type: 'health_data', granted: true },
      expect.anything(),
    );
    const callbacks = mockMutate.mock.calls[0][1] as { onError: () => void };
    callbacks.onError();
    expect(onContinue).toHaveBeenCalled();
  });
});
