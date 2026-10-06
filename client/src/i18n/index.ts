import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from './locales/fr';
import en from './locales/en';
import ar from './locales/ar';

export const LANGUAGES = [
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const stored = (() => {
  try {
    return (localStorage.getItem('technova-lang') as LanguageCode | null) ?? 'fr';
  } catch {
    return 'fr';
  }
})();

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, en: { translation: en }, ar: { translation: ar } },
  lng: stored,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyLanguage(lng: LanguageCode) {
  const dir = LANGUAGES.find((l) => l.code === lng)?.dir ?? 'ltr';
  document.documentElement.lang = lng;
  document.documentElement.dir = dir;
  try {
    localStorage.setItem('technova-lang', lng);
  } catch {
    /* storage unavailable */
  }
  void i18n.changeLanguage(lng);
}

applyLanguage(stored);

/** Picks the localized name of a catalog entity (name / nameAr / nameEn). */
export function localizedName(entity: { name: string; nameAr?: string | null; nameEn?: string | null } | null | undefined): string {
  if (!entity) return '';
  const lng = i18n.language;
  if (lng === 'ar' && entity.nameAr) return entity.nameAr;
  if (lng === 'en' && entity.nameEn) return entity.nameEn;
  return entity.name;
}

export default i18n;
