import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon.js';
import { useLocale } from '../i18n/LocaleProvider.js';

export const THEME_STORAGE_KEY = 'nursery.theme';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

// An explicit stored choice wins, then the operating system, then light. styles.css encodes the same
// order in CSS so the first paint is already correct without a script, which the app's CSP forbids.
export const resolveTheme = (storedPreference: string | null | undefined, prefersDark: boolean): ResolvedTheme => {
  if (storedPreference === 'dark' || storedPreference === 'light') return storedPreference;
  return prefersDark ? 'dark' : 'light';
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

// jsdom does not implement matchMedia, and a browser may expose it without addEventListener. Every
// access is guarded so a scripted DOM render behaves as a plain light theme instead of throwing.
const mediaQuery = (): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(DARK_QUERY);
  } catch {
    return null;
  }
};

const systemPrefersDark = (): boolean => mediaQuery()?.matches ?? false;

const readStoredPreference = (): ThemePreference | null => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : null;
  } catch {
    return null;
  }
};

type ThemeContextValue = Readonly<{
  preference: ThemePreference;
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}>;

// Deliberately tolerant, like useBranding and unlike useLocale: ComponentPreview renders AppShell
// without this provider, so a missing provider must degrade to light rather than throw.
const fallback: ThemeContextValue = { preference: 'system', theme: 'light', setPreference: () => undefined };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [preference, setStoredPreference] = useState<ThemePreference>(() =>
    typeof window === 'undefined' ? 'system' : readStoredPreference() ?? 'system'
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(() => systemPrefersDark());

  useEffect(() => {
    const media = mediaQuery();
    if (!media || typeof media.addEventListener !== 'function') return;
    const listen = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener('change', listen);
    setPrefersDark(media.matches);
    return () => media.removeEventListener('change', listen);
  }, []);

  const theme = resolveTheme(preference === 'system' ? null : preference, prefersDark);

  useEffect(() => {
    // Only an explicit choice is written. Leaving the attribute off for 'system' lets the pure-CSS
    // media query own the appearance, which is what keeps the first paint free of a theme flash.
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setStoredPreference(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // A blocked storage API must not prevent changing the current appearance.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ preference, theme, setPreference }), [preference, theme, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => useContext(ThemeContext) ?? fallback;

const options = [
  { preference: 'light', icon: 'sun', labelKey: 'theme.light' },
  { preference: 'dark', icon: 'moon', labelKey: 'theme.dark' },
  { preference: 'system', icon: 'display', labelKey: 'theme.system' }
] as const;

export function ThemeSwitcher() {
  const { t } = useLocale();
  const { preference, setPreference } = useTheme();
  return <div className="theme-switcher" role="group" aria-label={t('theme.label')}>
    {options.map((option) => <button
      key={option.preference}
      type="button"
      aria-pressed={preference === option.preference}
      aria-label={t(option.labelKey)}
      title={t(option.labelKey)}
      onClick={() => setPreference(option.preference)}
    ><Icon name={option.icon} /></button>)}
  </div>;
}
