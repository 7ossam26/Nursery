// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { learningFixture } from '../helpers/learning.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate, type Locale } from '../../apps/web/src/i18n/catalogs.js';
import type { AuthClient } from '../../apps/web/src/features/auth/client.js';

describe('Phase 09 bilingual attendance DOM/HTTP scripts with real PostgreSQL',() => {
  let f: Awaited<ReturnType<typeof learningFixture>>; let origin: string; let pendingRequests: number; let serverErrors: string[];
  beforeEach(async () => {
    window.localStorage.clear(); f=await learningFixture(false); pendingRequests=0; serverErrors=[];
    f.app.addHook('onRequest',async () => { pendingRequests++; });
    f.app.addHook('onResponse',async (_request,reply) => { pendingRequests--; if (reply.statusCode>=500) serverErrors.push(`HTTP ${reply.statusCode}`); });
    origin=await f.app.listen({ host: '127.0.0.1',port: 0 });
  },30000);
  afterEach(async () => { cleanup(); try { await waitFor(() => expect(pendingRequests).toBe(0),{ timeout: 15000 }); expect(serverErrors).toEqual([]); } finally { await f?.close(); } },30000);
  function mount(client: AuthClient,locale: Locale,path: string) { return render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>); }

  it.each(['en','ar-EG'] as const)('submits a guardian notice, explicitly publishes a classroom, and corrects attendance in %s',async (locale) => {
    const t=(key: Parameters<typeof translate>[1],values?: Record<string,string|number>) => translate(locale,key,values); const user=userEvent.setup();
    const a=await f.onboard('UIATTA'); await f.onboard('UIATTB'); const staff=await f.learningStaff([f.classes[0].id]);
    const parent=await f.parent(a.guardianIds[0],'parent-uiatta',a.credentials[0].temporaryPassword); await f.app.auth.setLocale(parent.token,locale); await f.app.auth.setLocale(staff.token,locale);
    const parentClient=httpClient(origin,f.config.appOrigin); await parentClient.login('parent-uiatta',`Permanent guardian secret ${a.guardianIds[0]}`);
    const parentView=mount(parentClient,locale,`/parent/children/${a.childIds[0]}`);
    const notice=await screen.findByRole('group',{ name: t('attendance.planned') },{ timeout: 15000 });
    fireEvent.change(within(notice).getByLabelText(t('attendance.reason')),{ target: { value: 'Family appointment' } });
    await user.click(within(notice).getByRole('button',{ name: t('attendance.planned') }));
    await screen.findByText(t('attendance.noticeSaved'),{},{ timeout: 15000 });
    expect((await axe.run(parentView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]); cleanup();

    const client=httpClient(origin,f.config.appOrigin); await client.login(staff.username,staff.password); const staffView=mount(client,locale,'/teacher/today');
    const classroom=await screen.findByRole('group',{ name: t('attendance.classroom') },{ timeout: 15000 });
    expect(within(classroom).getAllByText(t('attendance.missing'))).toHaveLength(2);
    expect(within(classroom).getByText(t('attendance.notice',{ reason: 'Family appointment' }))).toBeTruthy();
    const first=within(classroom).getByRole('group',{ name: 'Child UIATTA' });
    await user.click(within(first).getByRole('checkbox',{ name: t('attendance.include') }));
    const absent=(await f.attendance.classroom(staff.token,f.classes[0].id,f.date())).entries[0].definition.statuses.find((status) => status.outcome==='ABSENT')!.id;
    await user.selectOptions(within(first).getByRole('combobox',{ name: t('learning.status') }),absent);
    fireEvent.change(within(first).getByLabelText(t('attendance.absenceReason')),{ target: { value: 'Family appointment' } });
    await user.click(within(classroom).getByRole('button',{ name: t('attendance.publish') }));
    await screen.findByText(t('attendance.progress',{ complete: 1,total: 2 }),{},{ timeout: 15000 });
    expect(screen.getAllByText(t('attendance.missing'))).toHaveLength(1);
    await user.click(screen.getAllByText(t('attendance.correct'))[0]);
    const correction=screen.getByRole('group',{ name: t('attendance.correct') });
    const present=(await f.attendance.classroom(staff.token,f.classes[0].id,f.date())).entries[0].definition.statuses.find((status) => status.outcome==='PRESENT')!.id;
    await user.selectOptions(within(correction).getByRole('combobox',{ name: t('learning.status') }),present);
    fireEvent.change(within(correction).getByLabelText(t('attendance.correctionReason'),{ exact: false }),{ target: { value: 'Teacher checked the register' } });
    await user.click(within(correction).getByRole('button',{ name: t('attendance.correct') }));
    await waitFor(async () => expect(await f.attendance.history(staff.token,a.childIds[0],f.date())).toHaveLength(2),{ timeout: 15000 });
    expect(document.documentElement.dir).toBe(locale==='en' ? 'ltr' : 'rtl');
    expect((await axe.run(staffView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  },60000);
});
