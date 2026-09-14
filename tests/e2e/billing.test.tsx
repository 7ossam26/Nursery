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
describe('Phase 14 bilingual billing through real HTTP and PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>,origin:string,dropPath:string|null,pending:number,failures:number[];
 beforeEach(async()=>{
  window.localStorage.clear();f=await financeFixture(false);pending=0;dropPath=null;failures=[];const finished=new Set<string>();
  const finish=(id:string)=>{if(!finished.has(id)){finished.add(id);pending--;}};
  f.app.addHook('onRequest',async(r,reply)=>{pending++;reply.raw.once('close',()=>finish(r.id));});
  f.app.addHook('onResponse',async(r,reply)=>{finish(r.id);if(reply.statusCode>=500) failures.push(reply.statusCode);});
  f.app.addHook('onSend',async(r,reply,payload)=>{if(r.method==='POST'&&r.url===dropPath){dropPath=null;reply.raw.destroy();}return payload;});
  origin=await f.app.listen({host:'127.0.0.1',port:0});
 },30000);
 afterEach(async()=>{cleanup();try{await waitFor(()=>expect(pending).toBe(0),{timeout:15000});expect(failures).toEqual([]);expect(await reconcileFinance(f.database)).toEqual([]);}finally{await f?.close();}},30000);
 it.each(['en','ar-EG'] as const)('onboards children, saves an equal discounted draft and approves after lost response in %s',async locale=>{
  const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();await f.app.auth.setLocale(f.root.token,locale);
  const client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);
  const view=render(<MemoryRouter initialEntries={['/administration/children']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  await user.click(await screen.findByRole('button',{name:t('children.onboard')},{timeout:15000}));
  const set=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label,{exact:false}),{target:{value}});
  set(t('children.username'),'billing-parent');set(t('children.fullName'),'Billing parent');set(t('children.mobile'),'01000000000');
  await user.click(screen.getByRole('button',{name:t('children.next')}));
  set(t('children.code'),'BILL-ONE');set(t('children.fullName'),'Billing child');set(t('children.birthDate'),'2022-01-01');set(t('children.relationship'),'Parent');
  await user.click(screen.getByRole('button',{name:t('children.next')}));await user.click(screen.getByRole('button',{name:t('children.review')}));
  await screen.findByRole('heading',{name:t('billing.onboarding')},{timeout:15000});
  await waitFor(()=>expect(screen.getByRole('group',{name:t('billing.draft')}).textContent).toContain('BILL-ONE — Billing child'),{timeout:15000});
  const form=screen.getByRole('group',{name:t('billing.draft')});
  const sibling=await f.child('UI-SIBLING');
  fireEvent.change(within(form).getByLabelText(t('children.search'),{exact:false}),{target:{value:'UI-SIBLING'}});
  await within(form).findByRole('option',{name:/UI-SIBLING/});fireEvent.change(within(form).getByLabelText(t('billing.child'),{exact:false}),{target:{value:sibling.childId}});
  fireEvent.change(within(form).getByLabelText(t('billing.description'),{exact:false}),{target:{value:'School year tuition'}});
  fireEvent.change(within(form).getByLabelText(t('billing.normal'),{exact:false}),{target:{value:'10000'}});
  await user.click(within(form).getByRole('button',{name:t('billing.addDiscount')}));
  fireEvent.change(within(form).getByLabelText(t('billing.agreed'),{exact:false}),{target:{value:'8000'}});
  expect(within(form).getAllByText('EGP 4,000.00')).toHaveLength(2);
  dropPath='/api/v1/billing/agreements';await user.click(within(form).getByRole('button',{name:t('billing.draft')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect((screen.getByRole('group',{name:t('billing.title')}) as HTMLFieldSetElement).disabled).toBe(true);
  await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('billing.saved'),{},{timeout:15000});
  expect((await f.database.pool.query('select count(*)::int n from obligations')).rows[0].n).toBe(0);
  const a=(await f.app.billing.list(f.root.token,{}))[0];dropPath=`/api/v1/billing/agreements/${a.id}/approve`;
  await user.click(await screen.findByRole('button',{name:t('billing.approve')}));await screen.findByText(t('finance.uncertain'),{},{timeout:15000});
  await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('billing.saved'),{},{timeout:15000});
  await waitFor(async()=>expect((await f.database.pool.query('select amount::text from obligations order by child_id')).rows).toEqual([{amount:'400000'},{amount:'400000'}]),{timeout:15000});
  expect((await f.database.pool.query('select count(*)::int n from receipts')).rows[0].n).toBe(0);
  expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
 },60000);
});


