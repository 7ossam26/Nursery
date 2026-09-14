// @vitest-environment jsdom
import React from 'react';
import { afterEach,describe,it,expect } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
import { financeFixture,reconcileFinance } from '../helpers/finance.js';
import { httpClient } from '../helpers/http-client.js';

describe('Phase 17 bilingual transfer UI with real HTTP/PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{cleanup();await f?.close();});
 it.each(['en','ar-EG'] as const)('A21/A18: preview, transfer, response loss, single saved history in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);const c=await f.child(`UI-MOVE-${locale}`),charge=await f.charge(c.childId,'400000');await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'150000'));await f.app.auth.setLocale(f.root.token,locale);
  let drop=true;f.app.addHook('onSend',async(request,reply,payload)=>{if(drop&&request.method==='POST'&&request.url.endsWith('/branch-transfers')){drop=false;reply.raw.destroy();}return payload;});
  const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(f.root.account.username,f.password);const user=userEvent.setup(),t=(key:Parameters<typeof translate>[1])=>translate(locale,key);
  const view=render(<MemoryRouter initialEntries={['/administration/child-transfers']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
  await screen.findByRole('heading',{name:t('childTransfer.title')},{timeout:15000});await waitFor(()=>expect((screen.getByLabelText(t('hub.child')) as HTMLSelectElement).options.length).toBeGreaterThan(1),{timeout:15000});
  await user.selectOptions(screen.getByLabelText(t('hub.child')),c.childId);await user.selectOptions(screen.getByLabelText(t('childTransfer.destination'),{exact:false}),f.b.id);await user.selectOptions(screen.getByLabelText(t('childTransfer.classroom')),f.classes[2].id);
  await user.click(screen.getByRole('button',{name:t('childTransfer.preview')}));await screen.findByRole('group',{name:t('childTransfer.review')},{timeout:15000});
  const review=screen.getByRole('group',{name:t('childTransfer.review')});expect(review.textContent).toContain('2,500.00');expect(review.textContent).toContain(charge.id);
  fireEvent.change(within(review).getByLabelText(t('spending.reason'),{exact:false}),{target:{value:'Reviewed UI child transfer'}});await user.click(within(review).getByRole('checkbox',{name:t('childTransfer.confirm')}));await user.dblClick(within(review).getByRole('button',{name:t('childTransfer.commit')}));
  await screen.findByText(t('finance.uncertain'),{},{timeout:15000});expect(screen.queryByRole('button',{name:t('childTransfer.commit')})?.closest('fieldset')?.disabled??true).toBe(true);await user.click(screen.getByRole('button',{name:t('finance.check')}));await screen.findByText(t('spending.saved'),{},{timeout:15000});await screen.findByText('Reviewed UI child transfer',{},{timeout:15000});
  expect((await f.database.pool.query('select amount::text from child_branch_transfers where child_id=$1',[c.childId])).rows).toEqual([{amount:'250000'}]);expect((await f.database.pool.query('select balance::text from treasury_balances where id=$1',[f.cashB.id])).rows[0].balance).toBe('0');expect(await reconcileFinance(f.database)).toEqual([]);
  expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
 },60000);
});
