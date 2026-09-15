// @vitest-environment jsdom
import React from 'react';
import { it,expect } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { examsFixture } from '../helpers/exams.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';

it.each(['en','ar-EG'] as const)('A02: teacher reaches a second classroom and page two of attendance/exams in %s',async locale=>{
  window.localStorage.clear();const f=await examsFixture(false);let pendingRequests=0;const serverErrors:number[]=[];
  f.app.addHook('onRequest',async()=>{pendingRequests++;});
  f.app.addHook('onResponse',async(_request,reply)=>{pendingRequests--;if(reply.statusCode>=500)serverErrors.push(reply.statusCode);});
  f.app.addHook('onError',async(request,_reply,error)=>{if(!('statusCode' in error)||Number(error.statusCode)>=500)process.stderr.write(`Release roster fixture ${request.url}: ${error.message}\n`);});
  try {
    for(let offset=0;offset<101;offset+=10) {
      const family=f.family(`DOM-PAGE-${offset}`);
      family.children=Array.from({length:Math.min(10,101-offset)},(_,i)=>({child:{...family.children[0].child,code:`DOM-PAGE-${offset+i}`,fullName:`Paged child ${String(offset+i).padStart(3,'0')}`},links:family.children[0].links}));
      await f.children.onboard(f.root.token,family);
    }
    await f.onboard('SECOND-CLASS',f.classes[1].id);
    const actor=await f.learningStaff([f.classes[0].id,f.classes[1].id]);await f.app.auth.setLocale(actor.token,locale);
    const subject=await f.catalogItem('subjects','Page maths'),type=await f.catalogItem('exam_types','Page written');
    await f.exams.create(f.root.token,{operationId:crypto.randomUUID(),name:'Paged exam',subjectId:subject.id,typeId:type.id,classroomId:f.classes[0].id,assessedOn:f.date(),gradeFormat:'NUMERIC',maximumMarks:10,decimalAllowed:false,labelOptions:null});
    const origin=await f.app.listen({host:'127.0.0.1',port:0}),client=httpClient(origin,f.config.appOrigin);
    await client.login(actor.username,actor.password);
    const t=(key:Parameters<typeof translate>[1])=>translate(locale,key);
    for(const path of ['/teacher/today','/teacher/exams']) {
      const attendance=path.endsWith('today');
      render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client}/></LocaleProvider></MemoryRouter>);
      const select=await screen.findByRole('combobox',{name:t(attendance?'learning.classroom':'exams.classroom')},{timeout:15000});
      expect([...select.querySelectorAll('option')].map(option=>option.value)).toEqual([f.classes[0].id,f.classes[1].id]);
      await screen.findByRole('group',{name:'Paged child 000'},{timeout:20000});
      const next=screen.getByRole('button',{name:t('homework.next')});await waitFor(()=>expect((next as HTMLButtonElement).disabled).toBe(false));fireEvent.click(next);
      await screen.findByRole('group',{name:'Paged child 100'},{timeout:15000});expect(screen.queryByRole('group',{name:'Paged child 000'})).toBeNull();
      await waitFor(()=>expect((screen.getByRole('button',{name:t('homework.next')}) as HTMLButtonElement).disabled).toBe(true));
      fireEvent.change(select,{target:{value:f.classes[1].id}});
      if(attendance)await screen.findByRole('group',{name:'Child SECOND-CLASS'},{timeout:15000});
      else await screen.findByText(t('exams.noExamHelp'),{},{timeout:15000});
      cleanup();
    }
  } finally {cleanup();await f.close();expect(pendingRequests).toBe(0);expect(serverErrors).toEqual([]);}
},120000);
