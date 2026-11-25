import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslation from './locales/en/translation.json';
import neTranslation from './locales/ne/translation.json';
import zhTranslation from './locales/zh/translation.json';
import enMonitoring from './locales/en/monitoring.json';
import neMonitoring from './locales/ne/monitoring.json';
import zhMonitoring from './locales/zh/monitoring.json';

const savedLang = localStorage.getItem('ezpm2gui-language') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...enTranslation, monitoring: enMonitoring } },
      ne: { translation: { ...neTranslation, monitoring: neMonitoring } },
      zh: { translation: { ...zhTranslation, monitoring: zhMonitoring } },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
