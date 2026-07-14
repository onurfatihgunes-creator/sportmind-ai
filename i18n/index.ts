import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform } from 'react-native';

import en from './locales/en.json';
import tr from './locales/tr.json';
import de from './locales/de.json';
import ar from './locales/ar.json';

export const LANGUAGE_STORAGE_KEY = 'sportmind-ai-language';
export const SUPPORTED_LANGUAGES = ['en', 'tr', 'de', 'ar'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const RTL_LANGUAGES: SupportedLanguage[] = ['ar'];

function detectDeviceLanguage(): SupportedLanguage {
  const deviceTag = Localization.getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(deviceTag) ? (deviceTag as SupportedLanguage) : 'en';
}

export async function initI18n() {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  const initialLanguage = (stored as SupportedLanguage | null) ?? detectDeviceLanguage();

  // Re-apply RTL on every boot (including after the reload triggered by a language change) —
  // I18nManager's flag is in-memory only and does not survive a fresh page/app load on its own.
  const shouldBeRTL = RTL_LANGUAGES.includes(initialLanguage);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
  }
  // react-native-web doesn't drive the browser's own bidi/direction from I18nManager, so set it directly.
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.dir = shouldBeRTL ? 'rtl' : 'ltr';
  }

  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      tr: { translation: tr },
      de: { translation: de },
      ar: { translation: ar },
    },
    lng: initialLanguage,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });

  return initialLanguage;
}

export async function setAppLanguage(language: SupportedLanguage) {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  await i18n.changeLanguage(language);
}

export default i18n;
