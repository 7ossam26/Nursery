// @vitest-environment jsdom
import React from 'react';
import { beforeEach,afterEach,describe,it,expect } from 'vitest';
import { render,screen,within,cleanup,waitFor,fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
import type { PaymentResult } from '@nursery/contracts';

describe('Phase 13 bilingual treasury scripted DOM with real HTTP/PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>,origin:string,pending:number,dropPath:string|null,failures:number[];
 beforeEach(async()=>{
  window.localStorage.clear();f=await financeFixture(false);pending=0;dropPath=null;failures=[];const finished=new Set<string>();
  const finish=(id:string)=>{if(!finished.has(id)){finished.add(id);pending--;}};
  f.app.addHook('onRequest',async(r,reply)=>{pending++;reply.raw.once('close',()=>finish(r.id));});
  f.app.addHook('onResponse',async(r,reply)=>{finish(r.id);if(reply.statusCode>=500) failures.push(reply.statusCode);});
  // Actual connection loss after the database transaction committed, before any response reaches the client.
  f.app.addHook('onSend',async(r,reply,payload)=>{if(r.method==='POST'&&r.url===dropPath){dropPath=null;reply.raw.destroy();}return payload;});
  origin=await f.app.listen({host:'127.0.0.1',port:0});
 },30000);
 afterEach(async()=>{cleanup();try{await waitFor(()=>expect(pending).toBe(0),{timeout:15000});expect(failures).toEqual([]);expect(await reconcileFinance(f.database)).toEqual([]);}finally{await f?.close();}},30000);
 it.each(['en','ar-EG'] as const)('configures exact opening/default and resolves lost account/payment responses in %s',async locale=>{
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();await f.app.auth.setLocale(f.root.token,locale);
  const client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);
  const view=render(<MemoryRouter initialEntries={['/administration/treasury']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  const form=await screen.findByRole('group',{name:t('finance.create')},{timeout:15000});
  for(const [key,value] of [['finance.code','UI-CASH'],['finance.name','Front desk'],['finance.opening','12.34'],['finance.reason','Counted at opening']] as const) fireEvent.change(within(form).getByLabelText(t(key),{exact:false}),{target:{value}});
  dropPath='/api/v1/finance/accounts';await user.click(within(form).getByRole('button',{name:t('finance.create')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect((form as HTMLFieldSetElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('finance.saved'),{},{timeout:15000});
  await screen.findByText('EGP 12.34',{},{timeout:15000});await user.click(screen.getByRole('button',{name:t('finance.makeDefault')}));
  await waitFor(async()=>expect((await f.treasury.accounts(f.root.token,{})).find(a=>a.code==='UI-CASH')?.isDefault).toBe(true),{timeout:15000});
  expect((await f.database.pool.query("select count(*)::int n from treasury_movements m join treasury_accounts a on a.id=m.account_id where a.code='UI-CASH'")).rows[0].n).toBe(1);
  expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
  const child=await f.child('HTTPPAY');const due=await f.charge(child.childId,'111');const input=f.collect(due.installmentIds[0],'111');dropPath='/api/v1/payments';
  await expect(client.business('payments','POST',input)).rejects.toThrow();
  const status=await client.business<{status:string;result:PaymentResult}>(`finance/operations/${input.operationId}`);expect(status.status).toBe('COMMITTED');
  expect(await client.business('payments','POST',input)).toEqual(status.result);
  expect((await f.database.pool.query('select count(*)::int n from receipts where operation_id=$1',[input.operationId])).rows[0].n).toBe(1);
 },60000);
});
