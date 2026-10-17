import { Linking } from 'react-native';

/**
 * The privacy policy, the terms and the delete-account page live on the install site (`site/`,
 * Railway service `site`). EXPO_PUBLIC_FFT_SITE_URL overrides the address (a local copy, for instance).
 */
export const SITE_URL = (
  process.env.EXPO_PUBLIC_FFT_SITE_URL ?? 'https://fft.up.railway.app'
).replace(/\/+$/, '');

export type LegalPage = 'privacy' | 'terms' | 'deleteAccount';

/** The pages exist in English only (DECISIONS 67), whatever the phone's language. */
export function legalUrl(page: LegalPage): string {
  if (page === 'deleteAccount') return `${SITE_URL}/delete-account`;
  return `${SITE_URL}/${page}`;
}

export function openLegal(page: LegalPage) {
  void Linking.openURL(legalUrl(page)).catch(() => undefined);
}
