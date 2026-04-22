import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ja from './ja.json';

if (localStorage.getItem('language') === 'en') {
  localStorage.setItem('language', 'ja');
}

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja } },
  lng: 'ja',
  fallbackLng: 'ja',
  supportedLngs: ['ja'],
  interpolation: { escapeValue: false },
});

export default i18n;
