// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { authFixture } from '../helpers/auth.js';
import { AuthClient } from '../../apps/web/src/features/auth/client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate, type Locale } from '../../apps/web/src/i18n/catalogs.js';

// Real TCP API + PostgreSQL. This adapter supplies the cookie/origin behavior that jsdom lacks.
function httpClient(origin: string, appOrigin: string) {
  const jar = new Map<string, string>();
  const transport: typeof fetch = async (path, options = {}) => {
    const headers = new Headers(options.headers);
    headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
    if (options.method !== 'GET') headers.set('origin', appOrigin);
    const response = await fetch(`${origin}${String(path)}`, { ...options, headers });
    for (const entry of response.headers.getSetCookie()) {
      const [pair] = entry.split(';'); const split = pair.indexOf('='); const name = pair.slice(0, split); const value = pair.slice(split + 1);
      if (value) jar.set(name, value); else jar.delete(name);
    }
    return response;
  };
  return new AuthClient(transport);
}
describe('scripted bilingual authentication flows against the real API', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let origin: string;
  beforeEach(async () => {
    window.localStorage.clear(); fixture = await authFixture(false);
    origin = await fixture.app.listen({ host: '127.0.0.1', port: 0 });
  }, 30_000);
  afterEach(async () => { cleanup(); await fixture?.close(); });
  function mount(client: AuthClient, locale: Locale, path = '/account') {
    return render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>);
  }
  async function signIn(user: ReturnType<typeof userEvent.setup>, locale: Locale, username: string, password: string) {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
    await screen.findByRole('heading', { name: t('auth.signIn') });
    await user.type(await screen.findByLabelText(t('auth.username'), { exact: false }), username);
    await user.type(screen.getByLabelText(t('auth.password'), { exact: false }), password);
    await user.click(screen.getByRole('button', { name: t('auth.signIn'), exact: true }));
  }
  it.each(['en', 'ar-EG'] as const)('completes login, assisted reset, forced change, and logout in %s', async (locale) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key); const user = userEvent.setup();
    await fixture.app.auth.bootstrap('system-operator', fixture.secret);
    const setup = await fixture.app.auth.login('system-operator', fixture.secret);
    const rootPassword = 'Operator permanent secret phrase';
    const root = await fixture.app.auth.changePassword(setup.token, fixture.secret, rootPassword);
    await fixture.app.auth.setLocale(root.token, locale);
    const guardian = await fixture.account('GUARDIAN');
    await fixture.database.pool.query('update accounts set locale=$2 where id=$1', [guardian.id, locale]);
    const oldGuardian = await fixture.app.auth.login(guardian.username, guardian.password);
    const client = httpClient(origin, fixture.config.appOrigin);
    const view = mount(client, locale);
    await signIn(user, locale, 'system-operator', rootPassword);
    await screen.findByRole('heading', { name: t('auth.account'), exact: true });
    expect(document.documentElement.dir).toBe(locale === 'en' ? 'ltr' : 'rtl');
    expect((await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
    await user.type(screen.getByLabelText(t('auth.accountId'), { exact: false }), guardian.id);
    await user.type(screen.getByLabelText(t('auth.operatorPassword'), { exact: false }), rootPassword);
    await user.click(screen.getByRole('button', { name: t('auth.resetAction') }));
    await screen.findByText(t('auth.temporaryWarning'));
    const temporary = view.container.querySelector('.auth-temporary')!.textContent!;
    expect(temporary.length).toBeGreaterThan(20);
    await expect(fixture.app.auth.assertSessionActive(oldGuardian.token)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await user.click(screen.getByRole('button', { name: t('auth.dismissSecret') }));
    expect(view.container.textContent).not.toContain(temporary);
    await user.click(screen.getByRole('button', { name: t('auth.logout') }));
    await signIn(user, locale, guardian.username, temporary);
    await screen.findByRole('heading', { name: t('auth.changePassword') });
    expect(screen.queryByRole('heading', { name: t('auth.account'), exact: true })).toBeNull();
    const newPassword = 'Guardian new permanent phrase';
    await user.type(screen.getByLabelText(t('auth.currentPassword'), { exact: false }), temporary);
    await user.type(screen.getByLabelText(new RegExp(`^${t('auth.newPassword')}`)), newPassword);
    await user.type(screen.getByLabelText(t('auth.confirmPassword'), { exact: false }), newPassword);
    await user.click(screen.getByRole('button', { name: t('auth.changePassword') }));
    await screen.findByRole('heading', { name: t('auth.account'), exact: true });
    expect(screen.queryByRole('heading', { name: t('auth.resetTitle') })).toBeNull();
    await user.click(screen.getByRole('button', { name: t('auth.logout') }));
    await screen.findByRole('heading', { name: t('auth.signIn') });
    await expect(client.current()).rejects.toMatchObject({ detail: { code: 'UNAUTHORIZED' } });
    expect(window.localStorage.getItem('nursery.locale')).toBe(locale);
    expect(JSON.stringify(window.localStorage)).not.toContain(temporary);
  });
  it.each(['en', 'ar-EG'] as const)('shows session expiry, safe blocked copy, and denies protected routes in %s', async (locale) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale, key); const user = userEvent.setup();
    const guardian = await fixture.account('GUARDIAN');
    await fixture.database.pool.query('update accounts set locale=$2 where id=$1', [guardian.id, locale]);
    const client = httpClient(origin, fixture.config.appOrigin);
    await client.login(guardian.username, guardian.password);
    await fixture.database.pool.query("update sessions set expires_at=now()-interval '1 second' where account_id=$1", [guardian.id]);
    const view = mount(client, locale, '/parent/home');
    await screen.findByRole('heading', { name: t('auth.sessionExpired') });
    expect(view.container.textContent).not.toContain(guardian.username);
    await fixture.database.pool.query("update accounts set status='BLOCKED',public_message=$2 where id=$1", [guardian.id, 'Reception only — public contact message']);
    await user.type(screen.getByLabelText(t('auth.username'), { exact: false }), guardian.username);
    await user.type(screen.getByLabelText(t('auth.password'), { exact: false }), guardian.password);
    await user.click(screen.getByRole('button', { name: t('auth.signIn'), exact: true }));
    await screen.findByText('Reception only — public contact message');
    expect(screen.queryByRole('heading', { name: t('auth.account'), exact: true })).toBeNull();
    expect((await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
    await waitFor(() => expect(screen.getByLabelText(t('auth.password'), { exact: false })).toHaveProperty('value', ''));
  });
});
