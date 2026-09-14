import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { examsFixture } from '../helpers/exams.js';

describe('Phase 10 real PostgreSQL exams',() => {
  let f: Awaited<ReturnType<typeof examsFixture>>;
  beforeEach(async () => { f=await examsFixture(); },30000);
  afterEach(async () => { await f?.close(); },30000);

  async function numericExam(classroomId=f.classes[0].id,max=10,name='Mid-term maths') {
    const subject=await f.catalogItem('subjects','Mathematics'); const type=await f.catalogItem('exam_types','Written');
    return f.exams.create(f.root.token,{ name,subjectId: subject.id,typeId: type.id,classroomId,assessedOn: f.date(),gradeFormat: 'NUMERIC',maximumMarks: max,decimalAllowed: false,labelOptions: null,operationId: crypto.randomUUID() });
  }

  it('A09 records a real zero score, keeps missing distinct from zero, and rejects an out-of-range score',async () => {
    const a=(await f.onboard('EXA')).childIds[0]; const b=(await f.onboard('EXB')).childIds[0];
    const exam=await numericExam();
    let roster=await f.exams.roster(f.root.token,exam.id);
    expect(roster.entries.map((entry) => entry.result)).toEqual([null,null]); expect(roster.complete).toBe(0);
    const zero=roster.entries.find((entry) => entry.childId===a)!;
    await f.exams.publishResults(f.root.token,{ examId: exam.id,operationId: crypto.randomUUID(),entries: [{ childId: a,outcome: 'RESULT',score: 0,label: null,comment: null,expectedVersion: zero.slotRevision }] });
    roster=await f.exams.roster(f.root.token,exam.id);
    expect(roster.entries.find((entry) => entry.childId===a)?.result).toEqual({ outcome: 'RESULT',score: '0.00',label: null,comment: null });
    expect(roster.entries.find((entry) => entry.childId===b)?.result).toBeNull();
    expect(roster.complete).toBe(1);
    const outOfRange=roster.entries.find((entry) => entry.childId===b)!;
    await expect(f.exams.publishResults(f.root.token,{ examId: exam.id,operationId: crypto.randomUUID(),entries: [{ childId: b,outcome: 'RESULT',score: 11,label: null,comment: null,expectedVersion: outOfRange.slotRevision }] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('A10 retains correction history and rejects a stale concurrent corrector',async () => {
    const child=(await f.onboard('CORE')).childIds[0]; const left=await f.learningStaff([f.classes[0].id]); const right=await f.learningStaff([f.classes[0].id]);
    const exam=await numericExam();
    const roster=await f.exams.roster(left.token,exam.id); const entry=roster.entries.find((v) => v.childId===child)!;
    await f.exams.publishResults(left.token,{ examId: exam.id,operationId: crypto.randomUUID(),entries: [{ childId: child,outcome: 'RESULT',score: 6,label: null,comment: 'First pass',expectedVersion: entry.slotRevision }] });
    const afterFirst=await f.exams.roster(left.token,exam.id); const revision=afterFirst.entries.find((v) => v.childId===child)!.slotRevision;
    const base={ examId: exam.id,childId: child,outcome: 'RESULT' as const,score: 8,label: null,comment: 'Re-marked',expectedVersion: revision,reason: 'Re-marked after appeal' };
    const raced=await Promise.allSettled([f.exams.correctResult(left.token,{ ...base,operationId: crypto.randomUUID() }),f.exams.correctResult(right.token,{ ...base,operationId: crypto.randomUUID() })]);
    expect(raced.filter((r) => r.status==='fulfilled')).toHaveLength(1);
    expect(raced.find((r) => r.status==='rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    const history=await f.exams.history(left.token,child,{});
    expect(history.items).toHaveLength(1); expect(history.items[0].corrected).toBe(true); expect(history.items[0].result?.score).toBe('8.00');
    await expect(f.database.pool.query('delete from exam_results')).rejects.toThrow('append-only');
    await expect(f.database.pool.query('update exams set name=$1 where id=$2',['Tampered',exam.id])).rejects.toThrow('append-only');
  },30000);

  it('A02/A03 scopes exam creation, results and history to assigned classrooms and linked children',async () => {
    const own=await f.onboard('OWNX'); const foreign=await f.onboard('OTHERX',f.classes[1].id);
    const staff=await f.learningStaff([f.classes[0].id]);
    await expect(f.exams.create(staff.token,{ name: 'Cross-class quiz',subjectId: (await f.catalogItem('subjects','Science')).id,typeId: (await f.catalogItem('exam_types','Oral')).id,classroomId: f.classes[1].id,assessedOn: f.date(),gradeFormat: 'NUMERIC',maximumMarks: 5,decimalAllowed: false,labelOptions: null,operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const exam=await numericExam(f.classes[0].id);
    const roster=await f.exams.roster(staff.token,exam.id);
    expect(roster.entries.map((entry) => entry.childId)).toEqual(own.childIds);
    const parent=await f.parent(own.guardianIds[0],'parent-ownx',own.credentials[0].temporaryPassword);
    const otherParent=await f.parent(foreign.guardianIds[0],'parent-otherx',foreign.credentials[0].temporaryPassword);
    const ownHistory=await f.exams.history(parent.token,own.childIds[0],{});
    expect(ownHistory.total).toBe(1); expect(ownHistory.items[0].result).toBeNull();
    await expect(f.exams.history(parent.token,foreign.childIds[0],{})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.exams.history(otherParent.token,own.childIds[0],{})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('aggregates same-day exams into one checkpoint slot, reopening a resolved child and resolving once every applicable exam has an outcome',async () => {
    const child=(await f.onboard('AGG')).childIds[0];
    const exam1=await numericExam(f.classes[0].id,10,'Reading check');
    let roster1=await f.exams.roster(f.root.token,exam1.id); let entry=roster1.entries.find((v) => v.childId===child)!;
    await f.exams.publishResults(f.root.token,{ examId: exam1.id,operationId: crypto.randomUUID(),entries: [{ childId: child,outcome: 'RESULT',score: 9,label: null,comment: null,expectedVersion: entry.slotRevision }] });
    let day=await f.learning.daily(f.root.token,child,f.date());
    let examSlot=day.slots.find((s) => s.definition.kind==='EXAM')!;
    expect(examSlot.status.meaning).toBe('RESOLVED');
    const exam2=await numericExam(f.classes[0].id,20,'Number sense');
    day=await f.learning.daily(f.root.token,child,f.date()); examSlot=day.slots.find((s) => s.definition.kind==='EXAM')!;
    expect(examSlot.status.meaning).toBe('PENDING');
    const roster2=await f.exams.roster(f.root.token,exam2.id); entry=roster2.entries.find((v) => v.childId===child)!;
    await f.exams.publishResults(f.root.token,{ examId: exam2.id,operationId: crypto.randomUUID(),entries: [{ childId: child,outcome: 'CHILD_ABSENT',score: null,label: null,comment: 'Sick that period',expectedVersion: entry.slotRevision }] });
    day=await f.learning.daily(f.root.token,child,f.date()); examSlot=day.slots.find((s) => s.definition.kind==='EXAM')!;
    expect(examSlot.status.meaning).toBe('RESOLVED');
    roster1=await f.exams.roster(f.root.token,exam1.id);
    expect(roster1.entries.find((v) => v.childId===child)?.result?.score).toBe('9.00');
  });

  it('publishes No exam today only for a wholly unpublished classroom and refuses once an exam is scheduled',async () => {
    const child=(await f.onboard('NOEX')).childIds[0];
    const noExamInput={ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID() };
    const events=await f.exams.noExamDay(f.root.token,noExamInput);
    expect(await f.exams.noExamDay(f.root.token,noExamInput)).toEqual(events);
    const day=await f.learning.daily(f.root.token,child,f.date());
    expect(day.slots.find((s) => s.definition.kind==='EXAM')?.status.meaning).toBe('NOT_APPLICABLE');
    await expect(numericExam(f.classes[1].id)).resolves.toBeTruthy();
    await expect(f.exams.noExamDay(f.root.token,{ classroomId: f.classes[1].id,date: f.date(),operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('A31 requires the catalog capability separately from learning.publish and enforces immediate EXAMS module disable',async () => {
    const teacher=await f.learningStaff([f.classes[0].id]);
    await expect(f.exams.saveCatalog(teacher.token,'subjects',{ name: 'Denied subject',enabled: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const managed=await f.learningStaff([f.classes[0].id],['learning.read','learning.publish','exams.catalog']);
    const created=await f.exams.saveCatalog(managed.token,'subjects',{ name: 'Arabic',enabled: true });
    expect(created.version).toBe(1);
    await f.setModule('EXAMS',false);
    await expect(numericExam()).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
    await expect(f.exams.roster(f.root.token,'00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
  });

  it('child exam history applies subject/type/date filters and never synthesizes an average across grade formats',async () => {
    const child=(await f.onboard('HIST')).childIds[0];
    const subjectA=await f.catalogItem('subjects','Arabic'); const subjectB=await f.catalogItem('subjects','Art'); const type=await f.catalogItem('exam_types','Practical');
    const numeric=await f.exams.create(f.root.token,{ name: 'Arabic dictation',subjectId: subjectA.id,typeId: type.id,classroomId: f.classes[0].id,assessedOn: f.date(),gradeFormat: 'NUMERIC',maximumMarks: 10,decimalAllowed: false,labelOptions: null,operationId: crypto.randomUUID() });
    let roster=await f.exams.roster(f.root.token,numeric.id); let entry=roster.entries.find((v) => v.childId===child)!;
    await f.exams.publishResults(f.root.token,{ examId: numeric.id,operationId: crypto.randomUUID(),entries: [{ childId: child,outcome: 'RESULT',score: 7,label: null,comment: null,expectedVersion: entry.slotRevision }] });
    const label=await f.exams.create(f.root.token,{ name: 'Art portfolio',subjectId: subjectB.id,typeId: type.id,classroomId: f.classes[0].id,assessedOn: f.date(),gradeFormat: 'LABEL',maximumMarks: null,decimalAllowed: false,labelOptions: ['Excellent','Good','Needs support'],operationId: crypto.randomUUID() });
    roster=await f.exams.roster(f.root.token,label.id); entry=roster.entries.find((v) => v.childId===child)!;
    await f.exams.publishResults(f.root.token,{ examId: label.id,operationId: crypto.randomUUID(),entries: [{ childId: child,outcome: 'RESULT',score: null,label: 'Excellent',comment: null,expectedVersion: entry.slotRevision }] });
    const all=await f.exams.history(f.root.token,child,{});
    expect(all.total).toBe(2); expect(all.items.some((item) => item.result?.label==='Excellent')).toBe(true); expect(all.items.some((item) => item.result?.score==='7.00')).toBe(true);
    const filtered=await f.exams.history(f.root.token,child,{ subjectId: subjectA.id });
    expect(filtered.total).toBe(1); expect(filtered.items[0].exam.subjectName).toBe('Arabic');
  });
});
