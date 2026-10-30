import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import tr from './locales/tr.json';

const resources = {
  tr: { translation: tr },
  en: { translation: en },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: ['tr', 'en'],
    // BIST-focused app: Turkish unless the user picked or the browser prefers English.
    fallbackLng: 'tr',
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      // "tr-TR" → "tr", so locale lookups (config/locales.ts) match.
      convertDetectedLanguage: (lng: string) => lng.split('-')[0],
    },
  });

const syncHtmlLang = (lng: string) => document.documentElement.setAttribute('lang', lng);
syncHtmlLang(i18n.resolvedLanguage ?? 'tr');
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
