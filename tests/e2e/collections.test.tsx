// @vitest-environment jsdom
import React from 'react';
import { afterEach,describe,it,expect } from 'vitest';
import { render,screen,within,cleanup,fireEvent,waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
import axe from 'axe-core';

describe('Phase 15 collection UI with real HTTP/PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{cleanup();if(f) await f.close();});
 it.each(['en','ar-EG'] as const)('A18/A36: full default, partial bank collection, duplicate clicks and a lost response in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);
  const c=await f.child('COLLECTIONUI');await f.charge(c.childId,'10000');
  await f.app.auth.setLocale(f.root.token,locale);let drop=true;
  f.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url==='/api/v1/payments') {drop=false;reply.raw.destroy();}return payload;});
  const origin=await f.app.listen({host:'127.0.0.1',port:0});const client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();
  render(<MemoryRouter initialEntries={['/administration/collections']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:t('collections.collect')},{timeout:15000}));
  const form=screen.getByRole('group',{name:t('collections.review')});const amount=within(form).getByLabelText(/Child COLLECTIONUI/);expect((amount as HTMLInputElement).value).toBe('100.00');
  fireEvent.change(amount,{target:{value:'25.00'}});fireEvent.change(within(form).getByLabelText(t('collections.payer'),{exact:false}),{target:{value:'Synthetic parent'}});
  const destination=within(form).getByRole('combobox');expect((destination as HTMLSelectElement).value).toBe(f.cashA.id);await user.selectOptions(destination,f.bankA.id);
  await user.click(within(form).getByRole('checkbox',{name:t('collections.confirm')}));await user.dblClick(within(form).getByRole('button',{name:t('collections.submit')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect((form as HTMLFieldSetElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('collections.saved'),{},{timeout:15000});
  await waitFor(async()=>expect((await f.ledger.outstanding(f.root.token,{})).totalRemaining).toBe('7500'));
  expect((await f.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(1);
  expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.bankA.id])).rows[0].balance).toBe('2500');
  expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.cashA.id])).rows[0].balance).toBe('0');
  expect(await reconcileFinance(f.database)).toEqual([]);expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');
  await user.click(await screen.findByRole('button',{name:t('collections.collect')},{timeout:15000}));const creditForm=screen.getByRole('group',{name:t('collections.review')});
  await user.click(within(creditForm).getByRole('checkbox',{name:t('collections.credit')}));fireEvent.change(within(creditForm).getByLabelText(/Child COLLECTIONUI/),{target:{value:'100.00'}});fireEvent.change(within(creditForm).getByLabelText(t('collections.creditReason'),{exact:false}),{target:{value:'Confirmed separately received credit'}});
  await user.click(within(creditForm).getByRole('checkbox',{name:t('collections.confirm')}));await user.click(within(creditForm).getByRole('button',{name:t('collections.recordCredit')}));await screen.findByText(t('collections.creditSaved'),{},{timeout:15000});
  expect((await f.ledger.outstanding(f.root.token,{})).totalRemaining).toBe('7500');expect((await f.database.pool.query('select remaining::text from credit_balances')).rows[0].remaining).toBe('10000');expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.bankA.id])).rows[0].balance).toBe('12500');
 },60000);
 it.each(['en','ar-EG'] as const)('A06/D19: parent finance is readonly, scoped and cleared on manual block in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);const c=await f.child('PARENTCOLLECTIONUI'),foreign=await f.child('FOREIGNUI');const due=await f.charge(c.childId,'10000');await f.charge(foreign.childId,'20000');
  await f.payments.collect(f.root.token,f.collect(due.installmentIds[0],'2500'));
  const parent=await f.parent(c.guardianIds[0],c.credentials[0].username,c.credentials[0].temporaryPassword);await f.app.auth.setLocale(parent.token,locale);
  const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(c.credentials[0].username,`Permanent guardian secret ${c.guardianIds[0]}`);
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key);
  const view=render(<MemoryRouter initialEntries={['/parent/payments']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  await screen.findAllByText('EGP 75.00',{},{timeout:15000});expect(screen.queryByText(/FOREIGNUI/)).toBeNull();expect(screen.queryByRole('button',{name:t('collections.collect')})).toBeNull();
  expect((await screen.findByRole('link',{name:t('collections.download')})).getAttribute('href')).toMatch(/\/api\/v1\/finance\/receipts\/.*\/download/);
  await waitFor(()=>expect(within(screen.getByRole('navigation',{name:t('hub.today')})).getAllByRole('link')).toHaveLength(5));
  expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
  await f.database.pool.query('update guardian_child_links set can_finance=false where guardian_id=$1',[c.guardianIds[0]]);
  await waitFor(()=>expect(screen.queryAllByText('EGP 75.00')).toHaveLength(0),{timeout:15000});expect(screen.queryByRole('link',{name:t('collections.download')})).toBeNull();
  await f.licensing.blockAccount(f.root.token,c.guardianIds[0],{reason:'Manual administration action',publicMessage:'Contact the nursery desk'});
  await screen.findByText('Contact the nursery desk',{},{timeout:15000});expect(screen.queryAllByText('EGP 75.00')).toHaveLength(0);expect(screen.queryByRole('link',{name:t('collections.download')})).toBeNull();expect(screen.queryByText(/PARENTCOLLECTIONUI/)).toBeNull();
 },60000);
});
