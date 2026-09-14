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

describe('Phase 18 bilingual transport and assigned activity roster over real HTTP/PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{cleanup();if(f){expect(await reconcileFinance(f.database)).toEqual([]);await f.close();}});
 it.each(['en','ar-EG'] as const)('shows operational states, scoped teacher data and onboarding preselection in %s',async locale=>{
  window.localStorage.clear();f=await financeFixture(false);const today=cairoIsoDate(),one=await f.child(`UI-BUS-${locale}`,f.a.id,f.classes[0].id),two=await f.child(`UI-OTHER-${locale}`,f.a.id,f.classes[1].id),trip=await f.ledger.category(f.root.token,{operationId:crypto.randomUUID(),code:`UI-TRIP-${locale}`,name:'Museum visit',kind:'TRIP'});
  const bus=await f.app.transport.subscribe(f.root.token,{operationId:crypto.randomUUID(),childId:one.childId,categoryId:f.bus.id,periodStart:today,periodEnd:today,amount:'0',dueOn:today,administrativePermission:true});
  const activity=await f.app.transport.createActivity(f.root.token,{operationId:crypto.randomUUID(),branchId:f.a.id,categoryId:trip.id,title:'Bilingual museum trip',details:'Meet at reception',eventDate:today,fee:'0',dueOn:today,childIds:[one.childId,two.childId]});await f.app.transport.consent(f.root.token,activity.id,one.childId,{operationId:crypto.randomUUID(),consented:true,reason:'Guardian phoned reception'});await f.app.auth.setLocale(f.root.token,locale);
  const origin=await f.app.listen({host:'127.0.0.1',port:0}),admin=httpClient(origin,f.config.appOrigin);await admin.login(f.root.account.username,f.password);const user=userEvent.setup(),t=(key:Parameters<typeof translate>[1])=>translate(locale,key);
  const adminView=render(<MemoryRouter initialEntries={[`/administration/transport?childId=${one.childId}`]}><LocaleProvider userLocale={locale}><App authClient={admin}/></LocaleProvider></MemoryRouter>);await screen.findByRole('heading',{name:t('transport.title')},{timeout:15000});const adminActivityCard=(await screen.findByRole('heading',{name:'Bilingual museum trip'},{timeout:15000})).closest('section')!,busForm=(await screen.findByRole('heading',{name:t('transport.busCreate')},{timeout:15000})).closest('section')!,busCard=(await screen.findByRole('heading',{name:new RegExp(`UI-BUS-${locale}`)},{timeout:15000})).closest('section')!;expect(within(busCard).getByText(t('transport.eligible'),{exact:false})).toBeTruthy();expect(screen.getAllByText(t('transport.noFee'),{exact:false}).length).toBeGreaterThan(0);expect(adminActivityCard.textContent).toContain(t('transport.participating'));
  await waitFor(()=>expect((within(busForm).getByLabelText(t('transport.child'),{exact:false}) as HTMLSelectElement).value).toBe(one.childId));fireEvent.change(within(busCard).getByLabelText(t('transport.permissionReason'),{exact:false}),{target:{value:'Temporary route pause'}});await user.click(within(busCard).getByRole('button',{name:t('transport.block')}));await screen.findByText(t('transport.permissionOff'),{exact:false},{timeout:15000});expect((await f.database.pool.query('select enabled from bus_permission_events where subscription_id=$1 order by created_at desc limit 1',[bus.id])).rows[0].enabled).toBe(false);expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(adminView.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
  cleanup();const teacher=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM',['activities.read']);await f.app.auth.setLocale(teacher.token,locale);const teacherClient=httpClient(origin,f.config.appOrigin);await teacherClient.login(teacher.username,teacher.password);const rosterView=render(<MemoryRouter initialEntries={['/teacher/activities']}><LocaleProvider userLocale={locale}><App authClient={teacherClient}/></LocaleProvider></MemoryRouter>);await screen.findByRole('heading',{name:t('transport.rosterTitle')},{timeout:15000});const activityCard=(await screen.findByRole('heading',{name:'Bilingual museum trip'},{timeout:15000})).closest('section')!;expect(activityCard.textContent).toContain(`UI-BUS-${locale}`);expect(activityCard.textContent).not.toContain(`UI-OTHER-${locale}`);expect(screen.queryByRole('link',{name:t('transport.payment')})).toBeNull();expect(screen.queryByRole('button',{name:t('transport.cancel')})).toBeNull();expect((await axe.run(rosterView.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
 },60000);
});
