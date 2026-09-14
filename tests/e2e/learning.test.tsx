// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { learningFixture } from '../helpers/learning.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate, type Locale } from '../../apps/web/src/i18n/catalogs.js';
import type { AuthClient } from '../../apps/web/src/features/auth/client.js';

describe('Phase 08 bilingual DOM/HTTP scripts with real PostgreSQL',() => {
  let f: Awaited<ReturnType<typeof learningFixture>>; let origin: string; let pendingRequests: number; let serverErrors: string[];
  beforeEach(async () => {
    window.localStorage.clear(); f = await learningFixture(false); pendingRequests = 0; serverErrors = [];
    f.app.addHook('onRequest',async () => { pendingRequests++; });
    f.app.addHook('onResponse',async (_request,reply) => { pendingRequests--; if (reply.statusCode>=500) serverErrors.push(`HTTP ${reply.statusCode}`); });
    origin = await f.app.listen({ host: '127.0.0.1',port: 0 });
  },30000);
  afterEach(async () => {
    cleanup();
    try { await waitFor(() => expect(pendingRequests).toBe(0),{ timeout: 15000 }); expect(serverErrors).toEqual([]); }
    finally { await f?.close(); }
  },30000);
  function mount(client: AuthClient,locale: Locale,path: string) { return render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>); }
  it.each(['en','ar-EG'] as const)('configures future definitions; teacher publishes, corrects and uses classroom exceptions in %s',async (locale) => {
    const t = (key: Parameters<typeof translate>[1],values?: Record<string,string | number>) => translate(locale,key,values); const user = userEvent.setup();
    const a = await f.onboard('UIA'); await f.onboard('UIB'); const staff = await f.learningStaff([f.classes[0].id]);
    await f.app.auth.setLocale(f.root.token,locale); const rootClient = httpClient(origin,f.config.appOrigin); await rootClient.login('licensing-system',f.password);
    const configView = mount(rootClient,locale,'/administration/checkpoints');
    await screen.findByRole('button',{ name: t('learning.add') },{ timeout: 15000 }); await user.click(screen.getByRole('button',{ name: t('learning.add') }));
    const label = locale==='en' ? 'New checkpoint' : 'متابعة جديدة'; const added = screen.getByRole('group',{ name: label,exact: true });
    fireEvent.change(within(added).getAllByLabelText(t('learning.nameEn'),{ exact: false })[0],{ target: { value: 'Reading extension' } });
    await user.click(screen.getByRole('button',{ name: t('learning.save') }));
    await waitFor(async () => expect((await f.learning.configuration(f.root.token)).definitions).toHaveLength(5),{ timeout: 15000 });
    expect((await f.learning.daily(f.root.token,a.childIds[0],f.date())).slots).toHaveLength(4);
    expect((await axe.run(configView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]); cleanup();
    await f.app.auth.setLocale(staff.token,locale); const client = httpClient(origin,f.config.appOrigin); await client.login(staff.username,staff.password);
    const staffView = mount(client,locale,'/teacher/learning');
    const checkpointName = f.custom.label[locale];
    let form = await screen.findByRole('group',{ name: checkpointName,exact: true },{ timeout: 15000 });
    await user.selectOptions(within(form).getByRole('combobox',{ name: t('learning.status') }),f.custom.statuses[1].id);
    fireEvent.change(within(form).getByLabelText(t('learning.note')),{ target: { value: 'Read together' } });
    await user.click(within(form).getByRole('button',{ name: t('learning.publish') }));
    await screen.findByText(t('learning.progress',{ completed: 1,total: 4 }),{},{ timeout: 15000 });
    form = screen.getByRole('group',{ name: checkpointName,exact: true });
    await user.selectOptions(within(form).getByRole('combobox',{ name: t('learning.status') }),f.custom.statuses[2].id);
    fireEvent.change(within(form).getByLabelText(t('learning.reason'),{ exact: false }),{ target: { value: 'Teacher verified' } });
    await user.click(within(form).getByRole('button',{ name: t('learning.correct') }));
    await waitFor(async () => expect(await f.learning.history(staff.token,a.childIds[0],f.date(),f.custom.id)).toHaveLength(2),{ timeout: 15000 });
    await user.click(screen.getByRole('button',{ name: t('learning.prepare') }));
    const classGroup = screen.getByRole('group',{ name: t('learning.classroom'),exact: true });
    await waitFor(() => expect(within(classGroup).getByRole('combobox',{ name: t('learning.configuration') })).toBeTruthy(),{ timeout: 15000 });
    await user.selectOptions(within(classGroup).getByRole('combobox',{ name: t('learning.configuration') }),f.custom.id);
    const childRow = within(classGroup).getByRole('group',{ name: 'Child UIB',exact: true });
    await user.selectOptions(within(childRow).getByRole('combobox',{ name: t('learning.status') }),f.custom.statuses[2].id);
    expect(within(classGroup).queryByRole('group',{ name: 'Child UIA',exact: true })).toBeNull();
    await user.click(within(classGroup).getByRole('button',{ name: t('learning.batch') }));
    await screen.findByText(t('learning.saved'),{},{ timeout: 15000 });
    await user.click(screen.getByRole('button',{ name: t('learning.prepare') }));
    await screen.findByRole('combobox',{ name: t('learning.configuration') },{ timeout: 15000 });
    expect(document.documentElement.dir).toBe(locale==='en' ? 'ltr' : 'rtl');
    expect((await axe.run(staffView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
    await f.setModule('CUSTOM_CHECKPOINTS',false); fireEvent.focus(window);
    await screen.findByText(t('learning.progress',{ completed: 0,total: 3 }),{},{ timeout: 15000 });
    expect(screen.queryByRole('group',{ name: checkpointName,exact: true })).toBeNull();
    expect(screen.queryByRole('combobox',{ name: t('learning.configuration') })).toBeNull();
    expect(screen.queryByText('Read together')).toBeNull();
  },60000);
});
