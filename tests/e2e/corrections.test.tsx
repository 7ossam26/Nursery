// @vitest-environment jsdom
import React from 'react';
import { afterEach,describe,expect,it } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { cairoIsoDate } from '@nursery/domain';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { httpClient } from '../helpers/http-client.js';

describe('Phase 16 bilingual financial correction and refund page with real HTTP/PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{cleanup();await f?.close();});
 it.each(['en','ar-EG'] as const)('A25/A18: paid tuition becomes source-linked credit and an uncertain refund resolves once in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);await f.database.pool.query('insert into sensitive_grants(account_id,sensitive_financial_edit) values($1,true)',[f.root.account.id]);const child=await f.child(`UI-${locale}`),charge=await f.charge(child.childId);await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0]));await f.app.auth.setLocale(f.root.token,locale);
  let drop=true;f.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url==='/api/v1/finance/refunds'){drop=false;reply.raw.destroy();}return payload;});
  const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();const view=render(<MemoryRouter initialEntries={['/administration/corrections']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  expect(await screen.findByRole('heading',{name:t('corrections.title')},{timeout:15000})).toBeTruthy();expect(await screen.findByRole('group',{name:t('corrections.receipt')},{timeout:15000})).toBeTruthy();expect(screen.getByRole('group',{name:t('corrections.expense')})).toBeTruthy();expect(screen.getByRole('group',{name:t('corrections.transfer')})).toBeTruthy();
  const tuition=screen.getByRole('group',{name:t('corrections.tuition')});await user.selectOptions(within(tuition).getByLabelText(t('corrections.tuitionInstallment'),{exact:false}),charge.installmentIds[0]);fireEvent.change(within(tuition).getByLabelText(t('corrections.reductionAmount'),{exact:false}),{target:{value:'30.00'}});fireEvent.change(tuition.querySelector('input[maxlength="500"]')!,{target:{value:'Approved UI tuition reduction'}});await user.click(within(tuition).getByRole('checkbox',{name:t('corrections.confirmTuition')}));await user.dblClick(within(tuition).getByRole('button',{name:t('corrections.reduce')}));await screen.findByText(t('spending.saved'),{},{timeout:15000});
  await screen.findByRole('group',{name:t('corrections.refund')},{timeout:15000});await waitFor(()=>expect((within(screen.getByRole('group',{name:t('corrections.refund')})).getByLabelText(t('corrections.credit'),{exact:false}) as HTMLSelectElement).options.length).toBeGreaterThan(1),{timeout:15000});const refund=screen.getByRole('group',{name:t('corrections.refund')}),creditSelect=within(refund).getByLabelText(t('corrections.credit'),{exact:false}) as HTMLSelectElement,creditId=creditSelect.options[1].value;await user.selectOptions(creditSelect,creditId);
  fireEvent.change(within(refund).getByLabelText(t('corrections.refundAmount'),{exact:false}),{target:{value:'20.00'}});fireEvent.change(refund.querySelector('input[maxlength="500"]')!,{target:{value:'Actual UI cash refund'}});await user.click(within(refund).getByRole('checkbox',{name:t('corrections.confirmCash')}));await user.dblClick(within(refund).getByRole('button',{name:t('corrections.refund')}));await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect((refund as HTMLFieldSetElement).disabled).toBe(true);await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText('Actual UI cash refund',{},{timeout:15000});
  expect((await f.database.pool.query('select remaining::text from credit_balances where id=$1',[creditId])).rows[0].remaining).toBe('1000');expect((await f.database.pool.query("select count(*)::int n from treasury_movements where kind='REFUND'")).rows[0].n).toBe(1);expect(await reconcileFinance(f.database)).toEqual([]);expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
 },60000);
});
