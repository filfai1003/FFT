import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

export const resources = { en: { translation: en } } as const;
export const supportedLanguages = Object.keys(resources);

function deviceLanguage(): string {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return supportedLanguages.includes(code) ? code : 'en';
}

// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;

/** `t` as seen by helper functions that build several keys dynamically (keeps type-checking fast). */
export type Translate = (key: string, options?: Record<string, unknown>) => string;
