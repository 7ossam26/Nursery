// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { examsFixture } from '../helpers/exams.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate, type Locale } from '../../apps/web/src/i18n/catalogs.js';
import type { AuthClient } from '../../apps/web/src/features/auth/client.js';

describe('Phase 10 bilingual exams DOM/HTTP scripts with real PostgreSQL',() => {
  let f: Awaited<ReturnType<typeof examsFixture>>; let origin: string; let pendingRequests: number; let serverErrors: string[];
  beforeEach(async () => {
    window.localStorage.clear(); f=await examsFixture(false); pendingRequests=0; serverErrors=[];
    f.app.addHook('onRequest',async () => { pendingRequests++; });
    f.app.addHook('onResponse',async (_request,reply) => { pendingRequests--; if (reply.statusCode>=500) serverErrors.push(`HTTP ${reply.statusCode}`); });
    origin=await f.app.listen({ host: '127.0.0.1',port: 0 });
  },30000);
  afterEach(async () => { cleanup(); try { await waitFor(() => expect(pendingRequests).toBe(0),{ timeout: 15000 }); expect(serverErrors).toEqual([]); } finally { await f?.close(); } },30000);
  function mount(client: AuthClient,locale: Locale,path: string) { return render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>); }

  it.each(['en','ar-EG'] as const)('creates an exam, publishes a numeric result, corrects it, and shows guardian history in %s',async (locale) => {
    const t=(key: Parameters<typeof translate>[1],values?: Record<string,string|number>) => translate(locale,key,values); const user=userEvent.setup();
    const subject=await f.catalogItem('subjects','Mathematics'); const type=await f.catalogItem('exam_types','Written');
    const child=await f.onboard('UIEXA'); const staff=await f.learningStaff([f.classes[0].id],['learning.read','learning.publish']);
    const parent=await f.parent(child.guardianIds[0],'parent-uiexa',child.credentials[0].temporaryPassword);
    await f.app.auth.setLocale(parent.token,locale); await f.app.auth.setLocale(staff.token,locale);

    const client=httpClient(origin,f.config.appOrigin); await client.login(staff.username,staff.password);
    const staffView=mount(client,locale,'/teacher/exams');
    const create=await screen.findByRole('group',{ name: t('exams.createTitle') },{ timeout: 15000 });
    fireEvent.change(within(create).getByLabelText(t('exams.examName'),{ exact: false }),{ target: { value: 'Mid-term maths' } });
    await user.selectOptions(within(create).getByRole('combobox',{ name: t('exams.subject') }),subject.id);
    await user.selectOptions(within(create).getByRole('combobox',{ name: t('exams.type') }),type.id);
    await user.click(within(create).getByRole('button',{ name: t('exams.createAction') }));

    const roster=await screen.findByRole('group',{ name: t('exams.rosterTitle') },{ timeout: 15000 });
    expect(within(roster).getByText(t('exams.missing'))).toBeTruthy();
    const row=within(roster).getByRole('group',{ name: 'Child UIEXA' });
    await user.click(within(row).getByRole('checkbox',{ name: t('exams.include') }));
    fireEvent.change(within(row).getByLabelText(t('exams.score'),{ exact: false }),{ target: { value: '9' } });
    await user.click(within(roster).getByRole('button',{ name: t('exams.publish') }));
    await screen.findByText(t('exams.saved'),{},{ timeout: 15000 });
    // A roster reload briefly renders a loading fallback, replacing the fieldset DOM node; poll via screen (not the stale `roster`
    // reference) until the published result actually renders. "Correct result" labels both the disclosure summary and its
    // nested submit button, so (as in the attendance e2e test) take the first match once it appears.
    await waitFor(() => expect(screen.queryAllByText(t('exams.correct')).length).toBeGreaterThan(0),{ timeout: 15000 });
    await user.click(screen.getAllByText(t('exams.correct'))[0]);
    const correction=screen.getByRole('group',{ name: t('exams.correct') });
    fireEvent.change(within(correction).getByLabelText(t('exams.score'),{ exact: false }),{ target: { value: '10' } });
    fireEvent.change(within(correction).getByLabelText(t('exams.correctionReason'),{ exact: false }),{ target: { value: 'Re-marked after appeal' } });
    await user.click(within(correction).getByRole('button',{ name: t('exams.correct') }));
    await waitFor(async () => expect((await f.exams.history(staff.token,child.childIds[0],{})).items[0].result?.score).toBe('10.00'),{ timeout: 15000 });
    expect(document.documentElement.dir).toBe(locale==='en' ? 'ltr' : 'rtl');
    expect((await axe.run(staffView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]); cleanup();

    const parentClient=httpClient(origin,f.config.appOrigin); await parentClient.login('parent-uiexa',`Permanent guardian secret ${child.guardianIds[0]}`);
    const parentView=mount(parentClient,locale,`/parent/children/${child.childIds[0]}`);
    await screen.findByText(t('exams.historyTitle'),{},{ timeout: 15000 });
    const list=await screen.findByRole('list',{},{ timeout: 15000 });
    await within(list).findByText(/10\.00/,{},{ timeout: 15000 });
    expect((await axe.run(parentView.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  },60000);
});
