// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import sharp from 'sharp';
import { childFixture } from '../helpers/children.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate, type Locale } from '../../apps/web/src/i18n/catalogs.js';
import type { AuthClient } from '../../apps/web/src/features/auth/client.js';
describe('Phase 06 bilingual scripted DOM against HTTP and real PostgreSQL',() => {
  let f: Awaited<ReturnType<typeof childFixture>>; let origin: string;
  beforeEach(async () => { window.localStorage.clear(); f = await childFixture(false); origin = await f.app.listen({ host: '127.0.0.1',port: 0 }); },30000);
  afterEach(async () => { cleanup(); await f?.close(); },30000);
  function mount(client: AuthClient,locale: Locale,path: string) { return render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>); }
  it.each(['en','ar-EG'] as const)('onboards siblings, handles one-time credentials, edits lifecycle, uploads documents and switches child views in %s',async (locale) => {
    const t = (key: Parameters<typeof translate>[1]) => translate(locale,key); const user = userEvent.setup(); await f.app.auth.setLocale(f.root.token,locale);
    const client = httpClient(origin,f.config.appOrigin); await client.login('licensing-system',f.password); const view = mount(client,locale,'/administration/children');
    await user.click(await screen.findByRole('button',{ name: t('children.onboard') }));
    const parent = screen.getByRole('group',{ name: `${t('children.parents')} 1`,exact: true });
    await user.type(within(parent).getByLabelText(t('children.fullName'),{ exact: false }),'UI guardian'); await user.type(within(parent).getByLabelText(t('children.mobile'),{ exact: false }),'01000000000'); await user.type(within(parent).getByLabelText(t('children.username'),{ exact: false }),'ui-parent');
    await user.click(screen.getByRole('button',{ name: t('children.next'),exact: true }));
    async function fill(index: number,name: string,code: string) {
      const child = screen.getByRole('group',{ name: `${t('children.childFields')} ${index}`,exact: true }); const ui = within(child);
      await user.type(ui.getByLabelText(t('children.fullName'),{ exact: false }),name); await user.type(ui.getByLabelText(t('children.code'),{ exact: false }),code);
      fireEvent.change(ui.getByLabelText(t('children.birthDate'),{ exact: false }),{ target: { value: '2022-01-01' } });
      await user.selectOptions(ui.getByRole('combobox',{ name: t('children.classroom'),exact: true }),f.classes[0].id); await user.type(ui.getByLabelText(t('children.relationship'),{ exact: false }),'Parent');
    }
    await fill(1,'UI first child','UI-FIRST'); await user.click(screen.getByRole('button',{ name: t('children.addChild') })); await fill(2,'UI sibling','UI-SIBLING');
    await user.click(screen.getByRole('button',{ name: t('children.next'),exact: true }));
    expect((await axe.run(view.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole('button',{ name: t('children.review') }));
    await screen.findByRole('heading',{ name: t('children.credentials'),exact: true },{ timeout: 15000 });
    expect(screen.getByRole('heading',{name:t('transport.onboarding'),exact:true})).toBeTruthy();expect(screen.getAllByRole('link',{name:new RegExp(t('transport.openSetup'))})).toHaveLength(2);
    const temporary = await waitFor(() => { const value = view.container.querySelector('.auth-temporary')?.textContent; expect(value).toBeTruthy(); return value!; }); expect(temporary.length).toBeGreaterThan(20); expect(JSON.stringify(window.localStorage)).not.toContain(temporary);
    await user.click(screen.getByRole('button',{ name: t('children.dismiss') })); expect(view.container.textContent).not.toContain(temporary);
    const firstCard = await screen.findByRole('heading',{ name: 'UI first child' }); await user.click(within(firstCard.closest('section')!).getByRole('link',{ name: t('children.open') }));
    await screen.findByRole('heading',{ name: t('children.edit') });
    const png = await sharp({ create: { width: 2,height: 2,channels: 3,background: '#fff' } }).png().toBuffer();
    await user.type(screen.getByLabelText(t('children.documentName'),{ exact: false }),'Registration copy');
    await user.upload(screen.getByLabelText(t('children.file')),new File([new Uint8Array(png)],'local.png',{ type: 'image/png' }));
    expect((screen.getByLabelText(t('children.file')) as HTMLInputElement).files).toHaveLength(1);
    expect((screen.getByLabelText(t('children.documentName'),{ exact: false }) as HTMLInputElement).value).toBe('Registration copy');
    // jsdom's native required-file validity ignores user-event's FileList shim.
    // Submit the real form handler after verifying selected bytes/name; server validation remains real.
    fireEvent.submit((screen.getByLabelText(t('children.file')) as HTMLInputElement).form!);
    await screen.findByText(/Registration copy/,{},{ timeout: 15000 }); expect(screen.getByRole('link',{ name: t('children.download') }).getAttribute('href')).toMatch(/^\/api\/v1\/child-documents\/[0-9a-f-]+\/download$/);
    const lifecycle = screen.getByRole('group',{ name: t('children.lifecycle'),exact: true });
    await user.type(within(lifecycle).getByLabelText(t('children.reason'),{ exact: false }),'Paused by admin'); await user.type(within(lifecycle).getByLabelText(t('children.publicMessage'),{ exact: false }),'Please call reception'); await user.click(within(lifecycle).getByRole('button',{ name: t('children.lifecycle') }));
    await waitFor(async () => { expect((await f.children.list(f.root.token,{ search: 'UI-FIRST' })).items[0].status).toBe('PAUSED'); });
    cleanup(); const account = (await f.children.guardianOptions(f.root.token,{ search: 'ui-parent' })).items[0]; const session = await f.parent(account.id,'ui-parent',temporary); await f.app.auth.setLocale(session.token,locale);
    const parentClient = httpClient(origin,f.config.appOrigin); await parentClient.login('ui-parent',`Permanent guardian secret ${account.id}`); const parentView = mount(parentClient,locale,'/parent/children');
    await screen.findByText('Please call reception'); const sibling = await screen.findByRole('heading',{ name: 'UI sibling' }); await user.click(within(sibling.closest('section')!).getByRole('link',{ name: t('children.open') }));
    await screen.findByRole('heading',{ name: 'UI sibling' }); expect(screen.queryByText('Registration copy')).toBeNull(); expect(screen.queryByRole('button',{ name: t('children.lifecycle') })).toBeNull();
    expect(document.documentElement.dir).toBe(locale==='en' ? 'ltr' : 'rtl'); expect((await axe.run(parentView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  },30000);
  it('revalidates guardian access and clears visible child detail when its live link is revoked',async () => {
    const input = f.family('REVOKE'); const result = await f.children.onboard(f.root.token,input); const credential = result.credentials[0]; await f.parent(credential.id,credential.username,credential.temporaryPassword);
    const client = httpClient(origin,f.config.appOrigin); await client.login(credential.username,`Permanent guardian secret ${credential.id}`); const view = mount(client,'en',`/parent/children/${result.childIds[0]}`);
    await screen.findByRole('heading',{ name: 'Child REVOKE' });
    await f.children.linkGuardian(f.root.token,result.childIds[0],{ expectedChildVersion: 1,accountId: credential.id,relationship: 'Parent',permissions: { read: false,finance: false,pickup: false,notify: false },active: true });
    fireEvent.focus(window); await screen.findByRole('alert',{},{ timeout: 7000 }); expect(view.container.textContent).not.toContain('Child REVOKE');
  });
});
