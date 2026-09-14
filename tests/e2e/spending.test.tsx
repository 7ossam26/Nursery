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

describe('Phase 16 bilingual scripted expense/transfer workflows with real HTTP/PG',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{cleanup();await f?.close();});
 it.each(['en','ar-EG'] as const)('A23/A18: pending expense, explicit bank outflow and lost commit response recover once in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);const s=f.app.spending;
  const account=await f.treasuryAccount('FUNDED-BANK',f.a.id,'BANK','200000');await s.category(f.root.token,{operationId:crypto.randomUUID(),code:'RENT',name:'Synthetic rent'});await f.app.auth.setLocale(f.root.token,locale);
  let drop=true;f.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url.endsWith('/pay')){drop=false;reply.raw.destroy();}return payload;});
  const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();
  const view=render(<MemoryRouter initialEntries={['/administration/expenses']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  const create=await screen.findByRole('group',{name:t('spending.create')},{timeout:15000});fireEvent.change(within(create).getByLabelText(t('spending.amount'),{exact:false}),{target:{value:'1000.00'}});fireEvent.change(within(create).getByLabelText(t('spending.note'),{exact:false}),{target:{value:'Actual pending invoice'}});await user.click(within(create).getByRole('button',{name:t('spending.create')}));
  await screen.findByText('Actual pending invoice',{},{timeout:15000});expect((await s.list(f.root.token,{})).totalPending).toBe('100000');expect((await s.list(f.root.token,{})).totalPaid).toBe('0');
  await user.click(await screen.findByRole('button',{name:t('spending.pay')}));const pay=screen.getByRole('group',{name:new RegExp(t('spending.pay'))});await user.selectOptions(within(pay).getByRole('combobox'),account.id);fireEvent.change(within(pay).getByLabelText(t('spending.reason'),{exact:false}),{target:{value:'Confirmed external bank payment'}});await user.click(within(pay).getByRole('checkbox',{name:t('spending.confirm')}));await user.dblClick(within(pay).getByRole('button',{name:t('spending.pay')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect((pay as HTMLFieldSetElement).disabled).toBe(true);await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('spending.saved'),{},{timeout:15000});
  await waitFor(()=>expect(screen.queryByRole('button',{name:t('spending.pay')})).toBeNull());expect((await s.list(f.root.token,{})).totalPaid).toBe('100000');expect((await f.database.pool.query('select count(*)::int n from expense_settlements')).rows[0].n).toBe(1);expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[account.id])).rows[0].balance).toBe('100000');expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.cashA.id])).rows[0].balance).toBe('0');expect(await reconcileFinance(f.database)).toEqual([]);
  expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
 },60000);
 it.each(['en','ar-EG'] as const)('A24: actual account identities, explicit paired transfer and history in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);const source=await f.treasuryAccount('FUNDED-CASH',f.a.id,'CASH','100000');await f.app.auth.setLocale(f.root.token,locale);const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();render(<MemoryRouter initialEntries={['/administration/transfers']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  const form=await screen.findByRole('group',{name:t('transfer.record')},{timeout:15000});await user.selectOptions(within(form).getByLabelText(t('transfer.source'),{exact:false}),source.id);await user.selectOptions(within(form).getByLabelText(t('transfer.destination'),{exact:false}),f.cashB.id);fireEvent.change(within(form).getByLabelText(t('spending.amount'),{exact:false}),{target:{value:'500.00'}});fireEvent.change(within(form).getByLabelText(t('spending.reason'),{exact:false}),{target:{value:'Actual internal transfer'}});await user.click(within(form).getByRole('checkbox',{name:t('transfer.confirm')}));await user.dblClick(within(form).getByRole('button',{name:t('transfer.record')}));await screen.findByText('Actual internal transfer',{},{timeout:15000});
  expect((await f.database.pool.query("select count(*)::int n,sum(amount)::text net from treasury_movements where kind='TRANSFER'")).rows[0]).toEqual({n:2,net:'0'});expect((await f.app.spending.list(f.root.token,{})).totalPaid).toBe('0');expect(await reconcileFinance(f.database)).toEqual([]);expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');
 },60000);
});
