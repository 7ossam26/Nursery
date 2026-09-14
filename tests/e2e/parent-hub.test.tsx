// @vitest-environment jsdom
import React from 'react';
import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { render,screen,within,cleanup,waitFor,fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { homeworkFixture } from '../helpers/homework.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
import { defaultLinkPermissions } from '@nursery/contracts';

describe('Phase 12 parent hub: bilingual scripted DOM, real HTTP/SSE and PostgreSQL',() => {
 let f: Awaited<ReturnType<typeof homeworkFixture>>; let origin: string; let pending: number; let failures: { route: string;code: string }[];
 beforeEach(async () => { window.localStorage.clear(); f=await homeworkFixture(false); pending=0; failures=[]; const settled=new Set<string>(); const finish=(id: string) => { if (!settled.has(id)) { settled.add(id); pending--; } }; f.app.addHook('onRequest',async (r,reply) => { pending++; reply.raw.once('close',() => finish(r.id)); }); f.app.addHook('onResponse',async (r) => { finish(r.id); }); f.app.addHook('onError',async (r,_reply,error) => { if (!('statusCode' in error) || Number(error.statusCode)>=500) failures.push({ route: r.routeOptions.url,code: String((error as { code?: string }).code ?? 'unknown') }); }); origin=await f.app.listen({ host: '127.0.0.1',port: 0 }); },30000);
 afterEach(async () => { cleanup(); try { await waitFor(() => expect(pending).toBe(0),{ timeout: 15000 }); expect(failures).toEqual([]); } finally { await f?.close(); } },30000);
 it.each(['en','ar-EG'] as const)('switches children, refreshes live, acknowledges privately and removes disabled/revoked records in %s',async (locale) => {
  const t=(key: Parameters<typeof translate>[1]) => translate(locale,key); const user=userEvent.setup();
  const raw=f.family('PHUBA'); raw.children[0].links[0].permissions.finance=true; const other=f.family('PHUBB'); raw.children.push(other.children[0]); const a=await f.children.onboard(f.root.token,raw); const unrelated=await f.onboard('PHUBPRIVATE');
  const parent=await f.parent(a.guardianIds[0],'parent-phuba',a.credentials[0].temporaryPassword); await f.app.auth.setLocale(parent.token,locale);
  const assignment=await f.homework.publish(f.root.token,{ operationId: crypto.randomUUID(),classroomId: f.classes[0].id,assignedOn: f.date(),dueOn: f.date(),title: 'Read with family',instructions: 'Read page 1',childIds: [a.childIds[0]] });
  const notice=await f.app.communication.publish(f.root.token,{ operationId: crypto.randomUUID(),title: 'Bring a notebook',body: 'Please bring a notebook tomorrow.',target: { kind: 'CHILDREN',ids: [a.childIds[0]] },acknowledgmentRequired: true });
  const client=httpClient(origin,f.config.appOrigin,true); await client.login('parent-phuba',`Permanent guardian secret ${a.guardianIds[0]}`);
  const view=render(<MemoryRouter initialEntries={['/']}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>);
  await screen.findByText('Read page 1',{},{ timeout: 15000 }); const nav=screen.getByRole('navigation',{ name: t('nav.main') }); await waitFor(()=>expect(within(nav).getAllByRole('link')).toHaveLength(5)); expect(screen.getByRole('navigation',{ name: t('nav.mobile') })).toBeTruthy(); expect(document.documentElement.dir).toBe(locale==='en' ? 'ltr' : 'rtl'); expect(screen.queryByText('Child PHUBPRIVATE')).toBeNull(); expect(screen.queryByRole('button',{ name: t('homework.publish') })).toBeNull();
  fireEvent.change(screen.getByRole('combobox',{ name: t('hub.child') }),{ target: { value: a.childIds[1] } }); await waitFor(() => expect(screen.queryByText('Read page 1')).toBeNull());
  fireEvent.change(screen.getByRole('combobox',{ name: t('hub.child') }),{ target: { value: a.childIds[0] } }); await screen.findByText('Read page 1',{},{ timeout: 15000 });
  const started=Date.now(); await f.homework.correctContent(f.root.token,assignment.id,{ operationId: crypto.randomUUID(),expectedVersion: 1,title: 'Read with family',instructions: 'Read page 2',reason: 'Wrong page' }); await screen.findByText('Read page 2',{},{ timeout: 4900 }); expect(Date.now()-started).toBeLessThan(5000);
  await user.click(within(nav).getByRole('link',{ name: t('nav.notifications') })); const readButtons=await screen.findAllByRole('button',{ name: t('hub.read') },{ timeout: 15000 }); await user.click(readButtons[0]); await screen.findByRole('button',{ name: t('hub.unread') },{ timeout: 15000 });
  await user.click(within(screen.getByRole('navigation',{ name: t('nav.main') })).getByRole('link',{ name: t('nav.today') })); await screen.findByRole('link',{ name: t('hub.notices') },{ timeout: 15000 }); await user.click(screen.getByRole('link',{ name: t('hub.notices') })); await screen.findByText('Please bring a notebook tomorrow.',{},{ timeout: 15000 }); await user.click(screen.getByRole('button',{ name: t('hub.acknowledge') })); await screen.findByText(t('hub.acknowledged'),{},{ timeout: 15000 }); expect((await f.app.communication.announcement(parent.token,notice.id)).acknowledged).toBe(true);
  expect((await axe.run(view.container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  await user.click(within(screen.getByRole('navigation',{ name: t('nav.main') })).getByRole('link',{ name: t('nav.today') })); await screen.findByText('Read page 2',{},{ timeout: 15000 }); await f.setModule('HOMEWORK',false); await waitFor(() => expect(screen.queryByText('Read page 2')).toBeNull(),{ timeout: 4900 });
  await f.children.linkGuardian(f.root.token,a.childIds[0],{ expectedChildVersion: 1,accountId: a.guardianIds[0],relationship: 'Parent',active: false,permissions: defaultLinkPermissions }); await waitFor(() => expect(screen.queryByRole('option',{ name: 'Child PHUBA' })).toBeNull(),{ timeout: 4900 }); await screen.findByRole('option',{ name: 'Child PHUBB' },{ timeout: 4900 });
  await f.licensing.blockAccount(f.root.token,a.guardianIds[0],{ reason: 'Explicit admin decision',publicMessage: 'Call nursery office' }); await screen.findByText('Call nursery office',{},{ timeout: 4900 }); expect(screen.queryByRole('navigation')).toBeNull(); expect(screen.queryByText('Read page 2')).toBeNull(); expect(screen.queryByText('Child PHUBB')).toBeNull(); expect(unrelated.childIds).not.toEqual(a.childIds);
  // A06: the blocked session is refused for API reads, private downloads and the live stream alike.
  await expect(client.business('parent/children')).rejects.toMatchObject({ detail: { code: 'ACCOUNT_BLOCKED' } });
  await expect(client.downloadFile('finance/receipts/00000000-0000-4000-8000-000000000000/download')).rejects.toMatchObject({ detail: { code: 'ACCOUNT_BLOCKED' } });
  await new Promise<void>((resolve) => { const stream=client.parentLive()!; const done=() => { stream.close(); resolve(); }; stream.onerror=done; stream.addEventListener('revoked',done); });
 },60000);
 it('publishes a real classroom notice through capability-scoped options and the existing CSRF client',async () => {
  const t=(key: Parameters<typeof translate>[1]) => translate('en',key); const a=await f.onboard('PHUBPUBLISH'); const staff=await f.learningStaff([f.classes[0].id],['announcements.manage']); const client=httpClient(origin,f.config.appOrigin); await client.login(staff.username,staff.password);
  render(<MemoryRouter initialEntries={['/administration/announcements']}><LocaleProvider userLocale="en"><App authClient={client} /></LocaleProvider></MemoryRouter>);
  await screen.findByRole('radio',{ name: 'Class 0' },{ timeout: 15000 }); expect(screen.queryByRole('radio',{ name: 'Class 1' })).toBeNull(); expect(screen.queryByRole('option',{ name: t('hub.NURSERY') })).toBeNull();
  fireEvent.change(screen.getByLabelText(t('hub.title'),{ exact: false }),{ target: { value: 'Classroom reading day' } }); fireEvent.change(screen.getByLabelText(t('hub.body'),{ exact: false }),{ target: { value: 'Bring your reading book.' } }); await userEvent.click(screen.getByRole('radio',{ name: 'Class 0' })); await userEvent.click(screen.getByRole('button',{ name: t('hub.publish') })); await screen.findByText(t('hub.published'),{},{ timeout: 15000 });
  const parent=await f.parent(a.guardianIds[0],'parent-phubpublish',a.credentials[0].temporaryPassword); expect((await f.app.communication.announcements(parent.token,{})).map((n) => n.title)).toContain('Classroom reading day');
 },30000);
});
