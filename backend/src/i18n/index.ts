import { ja, type TranslationKeys } from './ja';
import { en } from './en';

const translations: Record<string, TranslationKeys> = { ja, en };

export function t(lang: string, path: string): string {
  const dict = translations[lang] || translations['ja'];
  const keys = path.split('.');
  let current: unknown = dict;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export function getAvailableLanguages(): string[] {
  return Object.keys(translations);
}

export function registerLanguage(code: string, translation: TranslationKeys) {
  translations[code] = translation;
}
