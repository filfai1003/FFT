import '@/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react-native';
import { renderUI } from '@/test/render';
import { PremiumScreen } from './PremiumScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('Plans page (DECISIONS 100)', () => {
  it('shows Free, Supporter and Premium, each building on the one before', async () => {
    await renderUI(
      <QueryClientProvider client={new QueryClient()}>
        <PremiumScreen />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByText('Supporter')).toBeTruthy();
    expect(screen.getByText('Premium')).toBeTruthy();
    expect(screen.getByText('Everything in Free')).toBeTruthy();
    expect(screen.getByText('Everything in Supporter')).toBeTruthy();
    // Nothing is on sale yet.
    expect(screen.getAllByText('Coming soon')).toHaveLength(2);
  });
});
