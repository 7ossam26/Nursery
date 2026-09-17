// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { LocaleProvider } from '../i18n/LocaleProvider.js';
import { translate, type Locale } from '../i18n/catalogs.js';
import { AppShell, SIDEBAR_STORAGE_KEY } from './AppShell.js';
import { ThemeProvider, THEME_STORAGE_KEY, resolveTheme } from './ThemeProvider.js';
import type { SessionAccount } from './navigation.js';

const account = (overrides: Partial<SessionAccount> = {}): SessionAccount => ({
  id: '00000000-0000-4000-8000-000000000001', username: 'synthetic', kind: 'STAFF', locale: 'en',
  mustChangePassword: false, capabilities: ['learning.read'], policyReady: true,
  scope: { revision: 1, mode: 'CLASSROOM', branchIds: [], classroomIds: [] }, ...overrides
});

function mount(path: string, locale: Locale = 'en') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider userLocale={locale}>
        <ThemeProvider>
          <AppShell role="teacher" context={{ account: account(), parentFinance: false }}>
            <main><h1>Screen</h1></main>
          </AppShell>
        </ThemeProvider>
      </LocaleProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(cleanup);

describe('appearance preference', () => {
  it('prefers an explicit choice, then the device, then light', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme('nonsense', false)).toBe('light');
  });

  it('renders without matchMedia and leaves the attribute off until the user chooses', async () => {
    // jsdom does not implement matchMedia. An unguarded read here would break every scripted render.
    expect(typeof window.matchMedia).toBe('undefined');
    const user = userEvent.setup();
    mount('/teacher/today');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    await user.click(screen.getByRole('button', { name: translate('en', 'theme.dark') }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // Returning to the device setting hands appearance back to the pure-CSS media query.
    await user.click(screen.getByRole('button', { name: translate('en', 'theme.system') }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

describe('shell chrome', () => {
  it('keeps the five labelled destinations in both the main and mobile navigation', () => {
    mount('/teacher/today');
    for (const label of ['nav.main', 'nav.mobile'] as const) {
      const navigation = screen.getByRole('navigation', { name: translate('en', label) });
      expect(within(navigation).getAllByRole('link')).toHaveLength(5);
    }
  });

  it('collapses the sidebar on request, persists it, and keeps every item named', async () => {
    const user = userEvent.setup();
    mount('/teacher/today');
    const navigation = screen.getByRole('navigation', { name: translate('en', 'nav.main') });
    await user.click(screen.getByRole('button', { name: translate('en', 'shell.collapse') }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed');
    expect(document.querySelector('.app-shell--collapsed')).toBeTruthy();
    // The rail is icon-only visually, but no destination loses its accessible name.
    for (const link of within(navigation).getAllByRole('link')) {
      expect(link.textContent?.trim()).toBeTruthy();
      expect(link.getAttribute('data-label')).toBeTruthy();
    }
    await user.click(screen.getByRole('button', { name: translate('en', 'shell.expand') }));
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('expanded');
  });

  it('opens destination search with the keyboard and only offers permitted destinations', async () => {
    const user = userEvent.setup();
    mount('/teacher/today');
    await user.keyboard('{Control>}k{/Control}');

    const search = screen.getByRole('textbox', { name: translate('en', 'search.placeholder') });
    const results = () => within(screen.getByRole('list', { name: translate('en', 'search.results') })).getAllByRole('button');
    // A classroom-scoped teacher sees exactly the destinations its own navigation already shows.
    expect(results()).toHaveLength(5);

    await user.type(search, translate('en', 'nav.exams'));
    expect(results()).toHaveLength(1);
    await user.clear(search);
    await user.type(search, 'treasury');
    expect(screen.getByText(translate('en', 'search.empty'))).toBeTruthy();
  });

  it.each(['en', 'ar-EG'] as const)('shows where the page sits and stays accessible in %s', async (locale) => {
    const user = userEvent.setup();
    const view = mount('/teacher/exams', locale);
    const breadcrumb = screen.getByRole('navigation', { name: translate(locale, 'shell.breadcrumb') });
    expect(within(breadcrumb).getByText(translate(locale, 'nav.exams'))).toBeTruthy();
    expect(document.documentElement.dir).toBe(locale === 'en' ? 'ltr' : 'rtl');

    await user.keyboard('{Control>}k{/Control}');
    const result = await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
