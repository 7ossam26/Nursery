// @vitest-environment jsdom
import React from 'react';
import { afterEach,it,expect } from 'vitest';
import { cleanup,render,screen,fireEvent,waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { reportText } from '@nursery/contracts';
import { financeFixture } from '../helpers/finance.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
let f:Awaited<ReturnType<typeof financeFixture>>;afterEach(async()=>{cleanup();await f?.close();});
it.each(['en','ar-EG'] as const)('real HTTP bilingual report filters, empty rows, monetary totals and worker status in %s',async locale=>{
 window.localStorage.clear();f=await financeFixture(false);const a=await f.child('REPORTUI'),b=await f.child('HIDDEN',f.b.id),charge=await f.charge(a.childId,'12345'),other=await f.charge(b.childId,'99999');await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'12345'));await f.payments.collect(f.root.token,f.collect(other.installmentIds[0],'99999',f.b.id,f.cashB.id));
 const actor=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read']);await f.app.auth.setLocale(actor.token,locale);const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(actor.username,actor.password);const user=userEvent.setup(),t=(key:Parameters<typeof translate>[1])=>translate(locale,key);
 const view=render(<MemoryRouter initialEntries={['/administration/reports']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
 const kind=await screen.findByLabelText(t('reports.kind'),{exact:true},{timeout:15000});expect(screen.queryByRole('option',{name:'Branch B'})).toBeNull();await user.selectOptions(kind,'SPENDING');await user.click(screen.getByRole('button',{name:t('reports.apply')}));await screen.findByText(t('reports.empty'),{},{timeout:15000});await user.selectOptions(kind,'COLLECTIONS');await user.click(screen.getByRole('button',{name:t('reports.apply')}));await screen.findAllByText('EGP 123.45',{},{timeout:15000});expect(screen.queryByText('Child HIDDEN')).toBeNull();expect(screen.getByRole('option',{name:reportText(locale,'PAYROLL')})).toBeTruthy();
 await user.selectOptions(screen.getByLabelText(t('reports.format')),'XLSX');await user.dblClick(screen.getByRole('button',{name:t('reports.export')}));await screen.findByText(t('reports.PENDING'),{},{timeout:15000});expect((await f.database.pool.query('select count(*)::int n from report_exports')).rows[0].n).toBe(1);await f.app.reports.runBatch(f.database);await screen.findByRole('button',{name:t('reports.download')},{timeout:15000});const id=(await f.database.pool.query('select id from report_exports')).rows[0].id;const blob=await client.downloadReport(id);expect(blob?.size).toBeGreaterThan(1000);
 const role=await f.app.organization.save(f.root.token,'roles',{name:'Report revoked',capabilities:['finance.read']});await f.app.organization.assign(f.root.token,actor.id,{expectedVersion:2,roleIds:[role.id],branchIds:[f.b.id],classroomIds:[],scopeMode:'BRANCH'});fireEvent(window,new Event('nursery:scope-refresh'));await waitFor(()=>expect(screen.queryAllByText('EGP 123.45')).toHaveLength(0),{timeout:15000});expect(screen.queryByRole('button',{name:t('reports.download')})).toBeNull();await expect(client.downloadReport(id)).rejects.toMatchObject({detail:{code:'FORBIDDEN'}});expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
},60000);
it('classroom-only report navigation excludes payroll/accounts and refuses forced exports',async()=>{
 f=await financeFixture(false);const actor=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM',['finance.read']),origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(actor.username,actor.password);
 render(<MemoryRouter initialEntries={['/administration/reports']}><LocaleProvider userLocale="en"><App authClient={client}/></LocaleProvider></MemoryRouter>);await screen.findByLabelText('Report',{exact:true},{timeout:15000});expect(screen.queryByRole('option',{name:reportText('en','PAYROLL')})).toBeNull();expect(screen.queryByRole('option',{name:reportText('en','ACCOUNTS')})).toBeNull();await expect(client.business('reports/exports','POST',{operationId:crypto.randomUUID(),kind:'PAYROLL',from:'2026-09-01',to:'2026-09-30',format:'XLSX'})).rejects.toMatchObject({detail:{code:'FORBIDDEN'}});
},30000);
