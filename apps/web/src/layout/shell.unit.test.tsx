// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { LocaleProvider } from '../i18n/LocaleProvider.js';
import { translate, type Locale } from '../i18n/catalogs.js';
import { AppShell, type ShellMode } from './AppShell.js';
import { ThemeProvider, THEME_STORAGE_KEY, resolveTheme } from './ThemeProvider.js';
import type { SessionAccount } from './navigation.js';

const account = (overrides: Partial<SessionAccount> = {}): SessionAccount => ({
  id: '00000000-0000-4000-8000-000000000001', username: 'synthetic', kind: 'STAFF', locale: 'en',
  mustChangePassword: false, capabilities: ['learning.read'], policyReady: true,
  scope: { revision: 1, mode: 'CLASSROOM', branchIds: [], classroomIds: [] }, ...overrides
});

function mount(path: string, locale: Locale = 'en', mode: ShellMode = 'standard', sessionAccount = account()) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LocaleProvider userLocale={locale}>
        <ThemeProvider>
          <AppShell role="teacher" mode={mode} context={{ account: sessionAccount, parentFinance: false }}>
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
  Reflect.deleteProperty(window, 'matchMedia');
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
    expect(typeof window.matchMedia).toBe('undefined');
    const user = userEvent.setup();
    mount('/teacher/today');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);

    await user.click(screen.getByRole('button', { name: translate('en', 'theme.dark') }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('button', { name: translate('en', 'theme.system') }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

describe('shell chrome', () => {
  it('keeps the five labelled destinations in the parent/teacher mobile navigation', () => {
    mount('/teacher/today');
    expect(screen.queryByRole('navigation', { name: translate('en', 'nav.main') })).toBeNull();
    const navigation = screen.getByRole('navigation', { name: translate('en', 'nav.mobile') });
    expect(within(navigation).getAllByRole('link')).toHaveLength(5);
  });

  it('uses the centered top-header layout without a standard desktop sidebar', () => {
    mount('/teacher/today');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('button', { name: translate('en', 'shell.back') })).toBeTruthy();
    expect(within(header).getByRole('link', { name: translate('en', 'shell.home') }).getAttribute('href')).toBe('/');
    expect(within(header).getByRole('link', { name: translate('en', 'shell.account') }).getAttribute('href')).toBe('/account');
    expect(document.querySelector('.app-shell--standard')).toBeTruthy();
    expect(document.querySelector('.shell-sidebar')).toBeNull();
  });

  it('opens the support sidebar as a narrow-screen drawer, closes on Escape, and restores focus', async () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
      matches: true, media: '(max-width: 1023px)', onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true
    }) });
    const user = userEvent.setup();
    mount('/support/licenses', 'en', 'support', account({ kind: 'SYSTEM', capabilities: ['licensing.manage', 'support.access'] }));
    const trigger = screen.getByRole('button', { name: translate('en', 'shell.openSupportMenu') });
    await waitFor(() => expect(document.querySelector('aside.support-sidebar')?.getAttribute('aria-hidden')).toBe('true'));
    await user.click(trigger);
    const sidebar = screen.getByLabelText(translate('en', 'nav.support'), { selector: 'aside' });
    expect(sidebar.hasAttribute('aria-hidden')).toBe(false);
    expect(within(sidebar).getByRole('link', { name: translate('en', 'nav.licenses') })).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(sidebar.getAttribute('aria-hidden')).toBe('true'));
    expect(document.activeElement).toBe(trigger);
  });

  it('opens destination search with the keyboard and only offers permitted destinations', async () => {
    const user = userEvent.setup();
    mount('/teacher/today');
    await user.keyboard('{Control>}k{/Control}');

    const search = screen.getByRole('textbox', { name: translate('en', 'search.placeholder') });
    const results = () => within(screen.getByRole('list', { name: translate('en', 'search.results') })).getAllByRole('button');
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
