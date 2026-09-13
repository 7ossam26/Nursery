import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { directionForLocale, isLocale, translate, type Locale, type MessageKey } from './catalogs.js';

export const LOCALE_STORAGE_KEY = 'nursery.locale';

export const resolveInitialLocale = (userLocale?: string | null, storedLocale?: string | null): Locale => {
  if (isLocale(userLocale)) return userLocale;
  if (isLocale(storedLocale)) return storedLocale;
  return 'en';
};

type LocaleContextValue = Readonly<{
  locale: Locale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Readonly<Record<string, string | number>>) => string;
}>;

const LocaleContext = createContext<LocaleContextValue | null>(null);

const readStoredLocale = (): string | null => {
  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
};

export function LocaleProvider({ children, userLocale }: Readonly<{ children: ReactNode; userLocale?: Locale | null }>) {
  const [locale, setLocale] = useState<Locale>(() =>
    resolveInitialLocale(userLocale, typeof window === 'undefined' ? null : readStoredLocale())
  );

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = directionForLocale(locale);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // A blocked storage API must not prevent changing the current UI language.
    }
  }, [locale]);

  useEffect(() => {
    if (isLocale(userLocale)) setLocale(userLocale);
  }, [userLocale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, direction: directionForLocale(locale), setLocale, t: (key, values) => translate(locale, key, values) }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): LocaleContextValue => {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider.');
  return context;
};
