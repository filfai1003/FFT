import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import '@/i18n';
import { SITE_URL } from '@/lib/legal';
import { renderUI } from '@/test/render';
import { LegalLinks } from './LegalLinks';

describe('LegalLinks', () => {
  it('opens the privacy policy and the terms on the install site', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await renderUI(<LegalLinks pages={['privacy', 'terms']} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Terms of service' }));
    expect(open.mock.calls[0][0]).toMatch(new RegExp(`^${SITE_URL}/privacy(-it)?$`));
    expect(open.mock.calls[1][0]).toMatch(new RegExp(`^${SITE_URL}/terms(-it)?$`));
    open.mockRestore();
  });
});
