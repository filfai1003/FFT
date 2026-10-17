import { getLocales } from 'expo-localization';
import { Linking } from 'react-native';

/**
 * The privacy policy, the terms and the delete-account page live on the install site (`site/`,
 * Railway service `site`). EXPO_PUBLIC_FFT_SITE_URL overrides the address (a local copy, for instance).
 */
export const SITE_URL = (
  process.env.EXPO_PUBLIC_FFT_SITE_URL ?? 'https://fft.up.railway.app'
).replace(/\/+$/, '');

export type LegalPage = 'privacy' | 'terms' | 'deleteAccount';

/** The page in Italian when the phone is set to Italian (the pages exist in English and Italian). */
export function legalUrl(page: LegalPage, languageCode?: string | null): string {
  if (page === 'deleteAccount') return `${SITE_URL}/delete-account`;
  return `${SITE_URL}/${page}${languageCode === 'it' ? '-it' : ''}`;
}

export function openLegal(page: LegalPage) {
  let language: string | null = null;
  try {
    language = getLocales()[0]?.languageCode ?? null;
  } catch {
    language = null;
  }
  void Linking.openURL(legalUrl(page, language)).catch(() => undefined);
}
