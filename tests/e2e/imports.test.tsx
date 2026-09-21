// @vitest-environment jsdom
import React from 'react';
import { afterEach,it,expect } from 'vitest';
import { cleanup,render,screen,waitFor,within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { importErrorHelp,importKindTitles,importText } from '@nursery/contracts';
import { importFixture,fillTemplate } from '../helpers/imports.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';
let f:Awaited<ReturnType<typeof importFixture>>;afterEach(async()=>{cleanup();await f?.close();});
const xlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
it.each(['en','ar-EG'] as const)('real HTTP bilingual template download, upload preview, row errors, atomic commit and one-time credentials in %s',async locale=>{
 window.localStorage.clear();f=await importFixture(false);
 const actor=await f.importStaff([f.a.id]);await f.app.auth.setLocale(actor.token,locale);const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(actor.username,actor.password);const user=userEvent.setup(),t=(key:Parameters<typeof translate>[1],values?:Record<string,string|number>)=>translate(locale,key,values);
 const view=render(<MemoryRouter initialEntries={['/administration/imports']}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
 const kind=await screen.findByLabelText(t('imports.kind'),{exact:true},{timeout:15000});expect(screen.getByRole('option',{name:`${importText(locale,importKindTitles,'PARENTS_CHILDREN')} (v1)`})).toBeTruthy();
 // The template is a real authenticated attachment; the same bytes are filled and uploaded through the browser file input.
 const template=await client.downloadFile('imports/templates/PARENTS_CHILDREN');expect(template.filename).toBe('nursery-import-parents-children-v1.xlsx');const bytes=Buffer.from(await template.bytes.arrayBuffer());expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
 const bad=await fillTemplate(bytes,{Parents:[['P1','ui-parent','=EVIL()','01000000001']],Children:[['UI-1','Child UI','2022-01-01','B','C2',null,null,null]],Links:[['P1','UI-1','Mother',null,null,null,null]]});
 await user.upload(screen.getByLabelText(t('imports.file')),new File([Buffer.from(bad,'base64')],'bad.xlsx',{type:xlsx}));await user.click(screen.getByRole('button',{name:t('imports.upload')}));
 await screen.findByText(t('imports.errorCount',{count:2}),{},{timeout:15000});const errors=screen.getByRole('table',{name:t('imports.errors')});expect(within(errors).getByText(importText(locale,importErrorHelp,'FORMULA'))).toBeTruthy();expect(within(errors).getByText(importText(locale,importErrorHelp,'OUT_OF_SCOPE'))).toBeTruthy();
 expect((screen.getByRole('button',{name:t('imports.commit')}) as HTMLButtonElement).disabled).toBe(true);
 const good=await fillTemplate(bytes,{Parents:[['P1','ui-parent','Parent UI','01000000001']],Children:[['UI-1','Child UI','2022-01-01','A','C0',null,null,null]],Links:[['P1','UI-1','Mother','Y','Y','N','Y']]});
 await user.upload(screen.getByLabelText(t('imports.file')),new File([Buffer.from(good,'base64')],'good.xlsx',{type:xlsx}));await user.click(screen.getByRole('button',{name:t('imports.upload')}));
 await screen.findByText(t('imports.noErrors'),{},{timeout:15000});expect(screen.getByText(new RegExp(`${t('imports.guardians')} 1`))).toBeTruthy();expect(screen.getByText(new RegExp(t('imports.seatParent')))).toBeTruthy();
 await user.dblClick(screen.getByRole('button',{name:t('imports.commit')}));
 await screen.findByText(t('imports.committed'),{},{timeout:15000});const credentials=await screen.findByRole('table',{name:t('imports.credentials')});expect(within(credentials).getByText('ui-parent')).toBeTruthy();
 const secret=within(credentials).getAllByRole('cell').map(c=>c.textContent??'').find(v=>v.length>=15&&v!=='ui-parent')!;expect(secret).toBeTruthy();
 expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from children where code='UI-1'")).rows[0].n).toBe(1);expect((await f.database.pool.query<{n:number}>("select count(*)::int as n from accounts where username_normalized='ui-parent'")).rows[0].n).toBe(1);
 expect((await f.database.pool.query<{status:string;credentials:unknown}>("select status,result->'credentials' as credentials from import_batches order by status")).rows).toEqual([{status:'COMMITTED',credentials:null},{status:'PREVIEWED',credentials:null}]);
 const login=await f.app.auth.login('ui-parent',secret);expect(login.account.mustChangePassword).toBe(true);
 await user.click(screen.getByRole('button',{name:t('imports.dismissCredentials')}));expect(screen.queryByRole('table',{name:t('imports.credentials')})).toBeNull();
 expect(screen.getAllByText(new RegExp(t('imports.COMMITTED'))).length).toBeGreaterThan(0);
 // A committed batch reopened from the recent list never shows credentials again; a foreign or forged file is refused.
 await user.click(screen.getByRole('button',{name:t('imports.new')}));const recent=await screen.findByRole('table',{name:t('imports.recent')});const committedRow=within(recent).getAllByRole('row').find(r=>within(r).queryByText(t('imports.COMMITTED')))!;await user.click(within(committedRow).getAllByRole('button',{name:t('imports.open')})[0]);await screen.findByText(new RegExp(t('imports.result')),{},{timeout:15000});expect(screen.queryByRole('table',{name:t('imports.credentials')})).toBeNull();
 await expect(client.business('imports','POST',{kind:'PARENTS_CHILDREN',fileName:'x.xlsx',contentBase64:Buffer.from('PK garbage').toString('base64')})).rejects.toMatchObject({detail:{messageKey:'imports.unsupportedFile'}});
 expect(document.documentElement.dir).toBe(locale==='en'?'ltr':'rtl');expect((await axe.run(view.container,{rules:{'color-contrast':{enabled:false}}})).violations).toEqual([]);
},90000);
it('the import page and every import endpoint are unavailable without imports.commit',async()=>{
 f=await importFixture(false);const actor=await f.financeStaff([f.a.id],[],'BRANCH',['children.read','children.manage','guardians.manage','users.create_parent','finance.read']),origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);await client.login(actor.username,actor.password);
 render(<MemoryRouter initialEntries={['/']}><LocaleProvider userLocale="en"><App authClient={client}/></LocaleProvider></MemoryRouter>);await screen.findByText('Children and families',{},{timeout:15000});expect(screen.queryByText('Excel imports')).toBeNull();
 await expect(client.business('imports/options')).rejects.toMatchObject({detail:{code:'FORBIDDEN'}});await expect(client.downloadFile('imports/templates/PARENTS_CHILDREN')).rejects.toMatchObject({detail:{code:'FORBIDDEN'}});
 await expect(client.business('imports','POST',{kind:'PARENTS_CHILDREN',fileName:'x.xlsx',contentBase64:'UEsDBA=='})).rejects.toMatchObject({detail:{code:'FORBIDDEN'}});
 await waitFor(()=>expect(screen.queryByText('Excel imports')).toBeNull());
},30000);
