// @vitest-environment jsdom
import React from 'react';
import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { render,screen,within,fireEvent,cleanup,waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { homeworkFixture } from '../helpers/homework.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
describe('Phase 11 bilingual homework DOM/HTTP against real PostgreSQL',() => {
 let f: Awaited<ReturnType<typeof homeworkFixture>>; let origin: string; let pending: number; let failures: number[];
 beforeEach(async () => { window.localStorage.clear(); f=await homeworkFixture(false); pending=0; failures=[]; f.app.addHook('onRequest',async () => { pending++; }); f.app.addHook('onResponse',async (_r,res) => { pending--; if (res.statusCode>=500) failures.push(res.statusCode); }); origin=await f.app.listen({ host: '127.0.0.1',port: 0 }); },30000);
 afterEach(async () => { cleanup(); try { await waitFor(() => expect(pending).toBe(0),{ timeout: 15000 }); expect(failures).toEqual([]); } finally { await f?.close(); } },30000);
 it.each(['en','ar-EG'] as const)('publishes shared content, reviews child outcomes, corrects instructions/result and shows read-only parent history in %s',async (locale) => {
  const t=(key: Parameters<typeof translate>[1]) => translate(locale,key); const user=userEvent.setup(); const a=await f.onboard('UIHWA'); const b=await f.onboard('UIHWB'); const staff=await f.learningStaff([f.classes[0].id]); const parent=await f.parent(a.guardianIds[0],'parent-uihwa',a.credentials[0].temporaryPassword); await f.app.auth.setLocale(staff.token,locale); await f.app.auth.setLocale(parent.token,locale);
  const client=httpClient(origin,f.config.appOrigin); await client.login(staff.username,staff.password);
  const view=render(<MemoryRouter initialEntries={['/teacher/homework']}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>);
  const create=await screen.findByRole('group',{ name: t('homework.create') },{ timeout: 15000 });
  fireEvent.change(within(create).getByLabelText(t('homework.assignmentTitle'),{ exact: false }),{ target: { value: 'Read together' } }); fireEvent.change(within(create).getByLabelText(t('homework.instructions'),{ exact: false }),{ target: { value: 'Read page 2' } }); await user.click(within(create).getByRole('button',{ name: t('homework.create') }));
  const checklist=await screen.findByRole('group',{ name: t('homework.checklist') },{ timeout: 15000 });
  for (const [name,outcome] of [['Child UIHWA','COMPLETED'],['Child UIHWB','NOT_COMPLETED']]) { const row=within(checklist).getByRole('group',{ name }); await user.click(within(row).getByRole('checkbox',{ name: t('homework.select') })); const c=name.endsWith('UIHWA') ? a.childIds[0] : b.childIds[0]; const day=await f.learning.daily(staff.token,c,f.date()); const status=day.slots.find((s) => s.definition.kind==='HOMEWORK')!.definition.statuses.find((s) => s.outcome===outcome)!; await user.selectOptions(within(row).getByRole('combobox',{ name: t('homework.outcome') }),status.id); }
  await user.click(within(checklist).getByRole('button',{ name: t('homework.publish') }));
  await waitFor(() => expect(screen.getAllByText(t('homework.correctOutcome')).length).toBeGreaterThan(0),{ timeout: 15000 }); await user.click(within(screen.getByRole('group',{ name: 'Child UIHWA' })).getAllByText(t('homework.correctOutcome'))[0]);
  const correction=within(screen.getByRole('group',{ name: 'Child UIHWA' })).getByRole('group',{ name: t('homework.correctOutcome') }); fireEvent.change(within(correction).getByLabelText(t('homework.reason'),{ exact: false }),{ target: { value: 'Teacher clarification' } }); await user.click(within(correction).getByRole('button',{ name: t('homework.correctOutcome') }));
  await waitFor(async () => expect((await f.homework.history(staff.token,a.childIds[0],{})).items[0].outcome?.version).toBe(2),{ timeout: 15000 });
  const contentControls=await screen.findAllByText(t('homework.correctContent'),{},{ timeout: 15000 }); await user.click(contentControls[0]); const content=screen.getByRole('group',{ name: t('homework.correctContent') }); fireEvent.change(within(content).getByLabelText(t('homework.instructions'),{ exact: false }),{ target: { value: 'Read page 3' } }); fireEvent.change(within(content).getByLabelText(t('homework.reason'),{ exact: false }),{ target: { value: 'Wrong page' } }); await user.click(within(content).getByRole('button',{ name: t('homework.correctContent') }));
  await waitFor(async () => expect((await f.homework.history(staff.token,a.childIds[0],{})).items[0].assignment.instructions).toBe('Read page 3'),{ timeout: 15000 });
  expect(document.documentElement.dir).toBe(locale==='en' ? 'ltr' : 'rtl'); expect((await axe.run(view.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]); cleanup();
  const pc=httpClient(origin,f.config.appOrigin); await pc.login('parent-uihwa',`Permanent guardian secret ${a.guardianIds[0]}`); const pv=render(<MemoryRouter initialEntries={[`/parent/children/${a.childIds[0]}`]}><LocaleProvider userLocale={locale}><App authClient={pc} /></LocaleProvider></MemoryRouter>);
  await screen.findByText('Read page 3',{},{ timeout: 15000 }); expect(screen.queryByText('Child UIHWB')).toBeNull(); expect(screen.queryByRole('button',{ name: t('homework.publish') })).toBeNull(); expect(screen.getByText(t('homework.readOnly'))).toBeTruthy(); expect((await axe.run(pv.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
 },60000);
});
