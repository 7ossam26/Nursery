import { beforeAll, afterAll, it, expect } from 'vitest';
import { examsFixture } from '../helpers/exams.js';
import { addDays } from '../helpers/learning.js';

let f: Awaited<ReturnType<typeof examsFixture>>;
let actor: Awaited<ReturnType<Awaited<ReturnType<typeof examsFixture>>['learningStaff']>>;
beforeAll(async () => {
  f=await examsFixture();
  for(let offset=0;offset<101;offset+=10) {
    const family=f.family(`PAGE-${offset}`);
    family.children=Array.from({length:Math.min(10,101-offset)},(_,i)=>({child:{...family.children[0].child,code:`PAGE-${offset+i}`,fullName:`Child ${String(offset+i).padStart(3,'0')}`},links:family.children[0].links}));
    await f.children.onboard(f.root.token,family);
  }
  await f.onboard('SECOND-CLASS',f.classes[1].id);
  actor=await f.learningStaff([f.classes[0].id,f.classes[1].id]);
},60000);
afterAll(async()=>{await f?.close();});

it('A02: classroom selection and attendance pages reach children after the first 100 without widening scope',async()=>{
  const context=await f.learning.context(actor.token);
  expect(context.classrooms.map(c=>c.classroomId)).toEqual([f.classes[0].id,f.classes[1].id]);
  const first=await f.attendance.classroom(actor.token,f.classes[0].id,f.date());
  const second=await f.attendance.classroom(actor.token,f.classes[0].id,f.date(),100);
  expect(first.entries).toHaveLength(100);expect(second.entries).toHaveLength(1);
  expect(second.entries[0].fullName).toBe('Child 100');
  const entry=second.entries[0];
  await f.attendance.publishClassroom(actor.token,{operationId:crypto.randomUUID(),classroomId:f.classes[0].id,date:f.date(),entries:[{childId:entry.childId,statusId:entry.definition.statuses.find(s=>s.outcome==='PRESENT')!.id,absenceReason:null,expectedVersion:0}]});
  expect((await f.attendance.classroom(actor.token,f.classes[0].id,f.date(),100)).complete).toBe(1);
  expect((await f.attendance.classroom(actor.token,f.classes[0].id,f.date())).complete).toBe(0);
  const headers={cookie:`__Host-nursery_session=${actor.token}`};
  expect((await f.app.inject({method:'GET',url:`/api/v1/attendance/classrooms/${f.classes[0].id}/draft?date=${f.date()}&offset=100`,headers})).json().data.entries).toHaveLength(1);
  expect((await f.app.inject({method:'GET',url:`/api/v1/attendance/classrooms/${f.classes[0].id}/draft?date=${f.date()}&offset=-1`,headers})).statusCode).toBe(400);
  await expect(f.attendance.classroom(actor.token,f.classes[2].id,f.date(),100)).rejects.toMatchObject({code:'FORBIDDEN'});
},30000);

it('A09/A10: exam child 101 can receive a result and a new exam reopens that child; no-class/no-exam remain page-scoped',async()=>{
  const subject=await f.catalogItem('subjects','Paged maths'),type=await f.catalogItem('exam_types','Paged written');
  const input={operationId:crypto.randomUUID(),name:'First paged exam',subjectId:subject.id,typeId:type.id,classroomId:f.classes[0].id,assessedOn:f.date(),gradeFormat:'NUMERIC',maximumMarks:10,decimalAllowed:false,labelOptions:null};
  const exam=await f.exams.create(f.root.token,input);
  const page=await f.exams.roster(actor.token,exam.id,100);expect(page.entries).toHaveLength(1);
  const entry=page.entries[0];
  await f.exams.publishResults(actor.token,{operationId:crypto.randomUUID(),examId:exam.id,entries:[{childId:entry.childId,outcome:'RESULT',score:0,label:null,comment:null,expectedVersion:entry.slotRevision}]});
  expect((await f.exams.roster(actor.token,exam.id,100)).entries[0].result?.score).toBe('0.00');
  await f.exams.create(f.root.token,{...input,operationId:crypto.randomUUID(),name:'Second paged exam'});
  const slot=(await f.learning.daily(actor.token,entry.childId,f.date())).slots.find(s=>s.definition.kind==='EXAM')!;
  expect(slot.status.meaning).toBe('PENDING');expect(slot.event?.revision).toBe(2);
  f.setDate(addDays(f.date(),1));
  const noExam={operationId:crypto.randomUUID(),classroomId:f.classes[0].id,date:f.date(),offset:100};
  expect(await f.exams.noExamDay(actor.token,noExam)).toHaveLength(1);
  expect(await f.exams.noExamDay(actor.token,noExam)).toHaveLength(1);
  const noClass={...noExam,operationId:crypto.randomUUID()};
  expect(await f.attendance.noClass(actor.token,noClass)).toHaveLength(1);
  expect((await f.attendance.classroom(actor.token,f.classes[0].id,f.date(),100)).noClass).toBe(true);
  expect((await f.attendance.classroom(actor.token,f.classes[0].id,f.date())).complete).toBe(0);
},60000);
