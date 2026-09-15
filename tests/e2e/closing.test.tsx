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

describe('Phase 16 real HTTP/PG closing workflow',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{cleanup();await f?.close();});
 it.each(['en','ar-EG'] as const)('physical count is noncash, explicit entitled shortage adjustment recovers committed TCP loss once in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);const account=await f.treasuryAccount('COUNTED-CASH',f.a.id,'CASH','100000'),staff=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read','treasury.close','finance.correct']);
  await f.app.organization.delegateOrGrant(f.root.token,staff.id,'grant',{expectedVersion:2,sensitiveFinancialEdit:true});await f.app.auth.setLocale(staff.token,locale);
  let drop=true;f.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url.endsWith('/adjust')){drop=false;reply.raw.destroy();}return payload;});
  const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(staff.username,staff.password);const t=(key:Parameters<typeof translate>[1])=>translate(locale,key),user=userEvent.setup();
  render(<MemoryRouter initialEntries={['/administration/closing']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  expect((await screen.findByRole('link',{name:t('finance.title')},{timeout:15000})).getAttribute('href')).toBe('/administration/treasury');// regression: N25-01 breadcrumb pointed at the unregistered /administration/finance
  await user.selectOptions(await screen.findByLabelText(t('spending.destination'),{exact:false},{timeout:15000}),account.id);const form=await screen.findByRole('group',{name:t('closing.record')});fireEvent.change(within(form).getByLabelText(t('closing.counted'),{exact:false}),{target:{value:'990.00'}});fireEvent.change(within(form).getByLabelText(t('spending.reason'),{exact:false}),{target:{value:'Physical cash count'}});
  await waitFor(()=>expect((within(form).getByRole('button',{name:t('closing.record')}) as HTMLButtonElement).disabled).toBe(false));await user.click(within(form).getByRole('button',{name:t('closing.record')}));await screen.findByText('Physical cash count',{exact:false},{timeout:15000});expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[account.id])).rows[0].balance).toBe('100000');
  await user.click(await screen.findByRole('button',{name:t('closing.adjust')}));const adjust=screen.getByRole('group',{name:new RegExp(t('closing.adjust'))});fireEvent.change(within(adjust).getByLabelText(t('spending.reason'),{exact:false}),{target:{value:'Explicitly approved actual shortage'}});await user.click(within(adjust).getByRole('checkbox',{name:t('closing.confirm')}));await user.dblClick(within(adjust).getByRole('button',{name:t('closing.adjust')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('spending.saved'),{},{timeout:15000});expect((await f.database.pool.query('select count(*)::int n from closing_adjustments')).rows[0].n).toBe(1);expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[account.id])).rows[0].balance).toBe('99000');expect((await f.app.closing.list(f.root.token,{accountId:account.id}))[0]).toMatchObject({counted:'99000',expected:'100000',difference:'-1000'});expect(await reconcileFinance(f.database)).toEqual([]);
  await waitFor(()=>expect(screen.queryByRole('button',{name:t('closing.adjust')})).toBeNull());await user.click(await screen.findByRole('button',{name:t('closing.reopen')},{timeout:15000}));const reopen=screen.getByRole('group',{name:new RegExp(t('closing.reopen'))});fireEvent.change(within(reopen).getByLabelText(t('spending.reason'),{exact:false}),{target:{value:'Explicit authorized recount'}});await user.click(within(reopen).getByRole('button',{name:t('closing.reopen')}));await screen.findByText(t('closing.REOPENED'),{exact:false},{timeout:15000});expect((await f.app.closing.list(f.root.token,{accountId:account.id}))).toHaveLength(2);
 },60000);
});
