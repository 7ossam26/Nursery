// @vitest-environment jsdom
import React from 'react';
import { afterEach,describe,it,expect } from 'vitest';
import { render,screen,within,cleanup,fireEvent,waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { learningFixture } from '../helpers/learning.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
import { connectivity } from '../../apps/web/src/features/connectivity/bus.js';
import { SESSION_CHANNEL } from '../../apps/web/src/features/auth/AuthProvider.js';

type Closable={ close: () => Promise<void> };
describe('Phase 22 network recovery through the real UI, HTTP and PostgreSQL',()=>{
 let f:Closable|null=null;
 afterEach(async()=>{cleanup();connectivity.reset();if(f) await f.close();f=null;});

 it.each(['en','ar-EG'] as const)('A36/A18: offline submit keeps the form in memory, reconnect re-reads, and the same operation retries once in %s',async locale=>{
  window.localStorage.clear();const fx=await financeFixture(false);f=fx;
  const c=await fx.child('NETUI');await fx.charge(c.childId,'10000');await fx.app.auth.setLocale(fx.root.token,locale);
  const origin=await fx.app.listen({host:'127.0.0.1',port:0});const gate={offline:false};const client=httpClient(origin,fx.config.appOrigin,false,gate);await client.login(fx.root.account.username,fx.password);
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();
  const view=render(<MemoryRouter initialEntries={['/administration/collections']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:t('collections.collect')},{timeout:15000}));
  const form=screen.getByRole('group',{name:t('collections.review')});const amount=within(form).getByLabelText(/Child NETUI/);
  fireEvent.change(amount,{target:{value:'40.00'}});fireEvent.change(within(form).getByLabelText(t('collections.payer'),{exact:false}),{target:{value:'Offline payer'}});
  await user.click(within(form).getByRole('checkbox',{name:t('collections.confirm')}));
  // The network drops before the request leaves the browser.
  gate.offline=true;await user.click(within(form).getByRole('button',{name:t('collections.submit')}));
  const dialog=await screen.findByRole('dialog',{name:t('network.title')},{timeout:15000});await waitFor(()=>expect(dialog.hasAttribute('open')).toBe(true),{timeout:15000});
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect((form as HTMLFieldSetElement).disabled).toBe(true);
  expect((within(form).getByLabelText(/Child NETUI/) as HTMLInputElement).value).toBe('40.00');expect((within(form).getByLabelText(t('collections.payer'),{exact:false}) as HTMLInputElement).value).toBe('Offline payer');
  expect((await fx.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(0);
  // Retry while still offline: the dialog stays and nothing is queued.
  await user.click(within(dialog).getByRole('button',{name:t('network.retry')}));expect((await within(dialog).findByRole('button',{name:t('network.retry')},{timeout:15000})).hasAttribute('disabled')).toBe(false);expect(dialog.hasAttribute('open')).toBe(true);
  expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
  // Connection returns: the dialog closes, scoped data is re-read, and the frozen operation is checked then retried once.
  // A scheduled scoped read can recover as soon as the gate opens and close the
  // dialog before userEvent's deferred click. Dispatch this click in the same
  // turn as opening the transport, then await the actual successful recovery.
  const reconnectButton=within(dialog).getByRole('button',{name:t('network.retry')});
  gate.offline=false;fireEvent.click(reconnectButton);await waitFor(()=>expect(dialog.hasAttribute('open')).toBe(false),{timeout:15000});
  await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('finance.notFound'),{},{timeout:15000});
  await user.click(screen.getByRole('button',{name:t('finance.retry')}));await screen.findByText(t('collections.saved'),{},{timeout:15000});
  expect((await fx.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(1);
  expect((await fx.ledger.outstanding(fx.root.token,{})).totalRemaining).toBe('6000');expect(await reconcileFinance(fx.database)).toEqual([]);
 },60000);

 it('A18: a payment committed on the server whose response never arrives resolves to its original receipt, never a second one',async()=>{
  window.localStorage.clear();const fx=await financeFixture(false);f=fx;
  const c=await fx.child('LOSTUI');await fx.charge(c.childId,'10000');let drop=true;
  fx.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url==='/api/v1/payments') {drop=false;reply.raw.destroy();}return payload;});
  const origin=await fx.app.listen({host:'127.0.0.1',port:0});const client=httpClient(origin,fx.config.appOrigin);await client.login(fx.root.account.username,fx.password);
  const t=(key:Parameters<typeof translate>[1])=>translate('en',key),user=userEvent.setup();
  render(<MemoryRouter initialEntries={['/administration/collections']}><LocaleProvider userLocale="en"><App authClient={client}/></LocaleProvider></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:t('collections.collect')},{timeout:15000}));
  const form=screen.getByRole('group',{name:t('collections.review')});fireEvent.change(within(form).getByLabelText(t('collections.payer'),{exact:false}),{target:{value:'Lost response payer'}});
  await user.click(within(form).getByRole('checkbox',{name:t('collections.confirm')}));await user.click(within(form).getByRole('button',{name:t('collections.submit')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});
  // The socket was destroyed after commit: the dialog reports a connection problem while the receipt already exists.
  const dialog=await screen.findByRole('dialog',{name:t('network.title')},{timeout:15000});await waitFor(async()=>expect((await fx.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(1));
  await user.click(within(dialog).getByRole('button',{name:t('network.retry')}));await waitFor(()=>expect(dialog.hasAttribute('open')).toBe(false),{timeout:15000});
  expect(screen.queryByRole('button',{name:t('finance.retry')})).toBeNull();
  await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('collections.saved'),{},{timeout:15000});
  const stored=await fx.database.pool.query<{reference:string}>('select reference from receipts');expect(stored.rows).toHaveLength(1);
  await screen.findByRole('heading',{name:stored.rows[0].reference},{timeout:15000});expect(screen.queryByRole('button',{name:t('finance.retry')})).toBeNull();
  expect((await fx.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(1);expect(await reconcileFinance(fx.database)).toEqual([]);
 },60000);

 it('publication interrupted after commit is republished with the same operation and stored once; another tab learns about sign-out',async()=>{
  window.localStorage.clear();const fx=await learningFixture(false);f=fx;
  await fx.onboard('NETPUBA');await fx.onboard('NETPUBB');const staff=await fx.learningStaff([fx.classes[0].id]);let drop=true;
  fx.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url==='/api/v1/attendance/classroom-publications') {drop=false;reply.raw.destroy();}return payload;});
  const origin=await fx.app.listen({host:'127.0.0.1',port:0});const client=httpClient(origin,fx.config.appOrigin);await client.login(staff.username,staff.password);
  const t=(key:Parameters<typeof translate>[1],values?:Record<string,string|number>)=>translate('en',key,values),user=userEvent.setup();
  render(<MemoryRouter initialEntries={['/teacher/today']}><LocaleProvider userLocale="en"><App authClient={client}/></LocaleProvider></MemoryRouter>);
  const classroom=await screen.findByRole('group',{name:t('attendance.classroom')},{timeout:15000});
  const first=within(classroom).getByRole('group',{name:'Child NETPUBA'});await user.click(within(first).getByRole('checkbox',{name:t('attendance.include')}));
  const present=(await fx.attendance.classroom(staff.token,fx.classes[0].id,fx.date())).entries[0].definition.statuses.find((status)=>status.outcome==='PRESENT')!.id;
  await user.selectOptions(within(first).getByRole('combobox',{name:t('learning.status')}),present);
  await user.click(within(classroom).getByRole('button',{name:t('attendance.publish')}));
  const dialog=await screen.findByRole('dialog',{name:t('network.title')},{timeout:15000});await screen.findByText(t('auth.networkError'),{},{timeout:15000});
  await user.click(within(dialog).getByRole('button',{name:t('network.keepEditing')}));await waitFor(()=>expect(dialog.hasAttribute('open')).toBe(false),{timeout:15000});
  // The roster choice survived; publishing again reuses the same operation ID, so the server answers idempotently.
  expect((within(first).getByRole('combobox',{name:t('learning.status')}) as HTMLSelectElement).value).toBe(present);
  await user.click(within(classroom).getByRole('button',{name:t('attendance.publish')}));
  await screen.findByText(t('attendance.progress',{complete:1,total:2}),{},{timeout:15000});
  expect((await fx.database.pool.query('select count(*)::int n from learning_events')).rows[0].n).toBe(1);
  // A second tab of the same account: a sign-out announced on the session channel makes it revalidate and drop its view.
  const other=httpClient(origin,fx.config.appOrigin);await other.login(staff.username,staff.password);
  const second=render(<MemoryRouter initialEntries={['/account']}><LocaleProvider userLocale="en"><App authClient={other}/></LocaleProvider></MemoryRouter>);
  await within(second.container).findByRole('heading',{name:t('auth.account'),exact:true},{timeout:15000});
  await other.logout();
  const announce=new BroadcastChannel(SESSION_CHANNEL);announce.postMessage({type:'revalidate'});announce.close();
  await waitFor(()=>expect(within(second.container).queryByRole('heading',{name:t('auth.account'),exact:true})).toBeNull(),{timeout:15000});
  await within(second.container).findByRole('heading',{name:t('auth.signIn')},{timeout:15000});
 },60000);
});
