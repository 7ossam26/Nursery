import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { homeworkFixture } from '../helpers/homework.js';
import { addDays } from '../helpers/learning.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';
describe('Phase 11 shared homework, due reporting, corrections and current scopes on PostgreSQL',() => {
  let f: Awaited<ReturnType<typeof homeworkFixture>>;
  beforeAll(async () => { f=await homeworkFixture(); },30000);
  afterAll(async () => { await f?.close(); },30000);
  async function family(code: string) { return f.onboard(code); }
  async function assign(code: string,childIds: string[],dueOn=f.date()) { return f.homework.publish(f.root.token,{ classroomId: f.classes[0].id,title: code,instructions: 'Read chapter 2',assignedOn: f.date(),dueOn,childIds,operationId: crypto.randomUUID() }); }
  async function slot(id: string) { return (await f.learning.daily(f.root.token,id,f.date())).slots.find((s) => s.definition.kind==='HOMEWORK')!; }
  async function status(id: string,outcome: string) { return (await slot(id)).definition.statuses.find((s) => s.outcome===outcome)!.id; }
  async function record(a: string,id: string,outcome: string,expectedVersion=0) { return f.homework.publishOutcomes(f.root.token,{ assignmentId: a,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: id,statusId: await status(id,outcome),note: 'Teacher review',expectedVersion }] }); }
  it('A11/A09: shared content has independent missing/completed/not-completed outcomes and guardian writes fail',async () => {
    const first=await family('HWONE'); const second=await family('HWTWO'); const input={ classroomId: f.classes[0].id,title: 'Shared exercise',instructions: 'Read chapter 2',assignedOn: f.date(),dueOn: f.date(),childIds: [first.childIds[0],second.childIds[0]],operationId: crypto.randomUUID() }; const a=await f.homework.publish(f.root.token,input); expect(await f.homework.publish(f.root.token,input)).toEqual(a);
    expect((await f.homework.roster(f.root.token,a.id,f.date())).entries.map((e) => e.outcome)).toEqual([null,null]);
    const outcomeInput={ assignmentId: a.id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: first.childIds[0],statusId: await status(first.childIds[0],'COMPLETED'),expectedVersion: 0 }] }; const published=await f.homework.publishOutcomes(f.root.token,outcomeInput); expect(await f.homework.publishOutcomes(f.root.token,outcomeInput)).toEqual(published); await record(a.id,second.childIds[0],'NOT_COMPLETED');
    const guardian=await f.parent(first.guardianIds[0],'parent-hwone',first.credentials[0].temporaryPassword);
    const history=await f.homework.history(guardian.token,first.childIds[0],{}); expect(history.items[0].assignment.id).toBe(a.id); expect(history.items[0].outcome?.status.outcome).toBe('COMPLETED');
    await expect(f.homework.history(guardian.token,second.childIds[0],{})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const response=await f.app.inject({ method: 'POST',url: '/api/v1/homework/outcomes',headers: { cookie: `__Host-nursery_session=${guardian.token}`,origin: f.config.appOrigin,'x-csrf-token': keyedHash(f.config.sessionSecret,`session-csrf:${guardian.token}`) },payload: { assignmentId: a.id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: first.childIds[0],statusId: await status(first.childIds[0],'NOT_COMPLETED'),note: null,expectedVersion: 1 }] } }); expect(response.statusCode).toBe(403);
  });
  it('future due visibility resolves assignment reporting, due-day lazy reads pend without fabricated events; two due tasks share one slot',async () => {
    const c=(await family('HWDUE')).childIds[0]; const today=f.date(); const future=await assign('Future exercise',[c],addDays(today,1));
    expect((await slot(c)).homework).toMatchObject({ future: 1,due: 0,meaning: 'RESOLVED' });
    const count=(await f.database.pool.query('select count(*)::int as n from learning_events')).rows[0].n;
    f.setDate(addDays(today,1)); expect((await slot(c)).homework).toMatchObject({ due: 1,missing: 1,meaning: 'PENDING' }); expect((await f.database.pool.query('select count(*)::int as n from learning_events')).rows[0].n).toBe(count);
    const other=await assign('Second due task',[c]); await record(future.id,c,'COMPLETED'); expect((await slot(c)).homework).toMatchObject({ due: 2,missing: 1,meaning: 'PENDING' });
    await record(other.id,c,'EXCUSED'); const day=await f.learning.daily(f.root.token,c,f.date()); expect(day.slots.filter((s) => s.definition.kind==='HOMEWORK')).toHaveLength(1); expect(day.slots.find((s) => s.definition.kind==='HOMEWORK')!.homework?.meaning).toBe('RESOLVED');
    const reopen=await assign('Third due task',[c]); expect((await slot(c)).homework?.meaning).toBe('PENDING'); await record(reopen.id,c,'NOT_COMPLETED'); expect((await slot(c)).homework?.meaning).toBe('RESOLVED'); f.setDate(today);
  });
  it('A10: actor-separated outcome/content correction races reject stale versions and keep original chains',async () => {
    const c=(await family('HWCORRECT')).childIds[0]; const a=await assign('Original content',[c]); await record(a.id,c,'NOT_COMPLETED'); const one=await f.learningStaff([f.classes[0].id]); const two=await f.learningStaff([f.classes[0].id]);
    const correction={ assignmentId: a.id,childId: c,date: f.date(),statusId: await status(c,'COMPLETED'),note: null,expectedVersion: 1,reason: 'Review corrected',operationId: crypto.randomUUID() };
    const races=await Promise.allSettled([f.homework.correctOutcome(one.token,correction),f.homework.correctOutcome(two.token,{ ...correction,operationId: crypto.randomUUID() })]); expect(races.filter((r) => r.status==='fulfilled')).toHaveLength(1); expect(races.find((r) => r.status==='rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    const content={ expectedVersion: 1,title: 'Correct instructions',instructions: 'Read chapter 3',reason: 'Wrong chapter number',operationId: crypto.randomUUID() };
    const contentRaces=await Promise.allSettled([f.homework.correctContent(one.token,a.id,content),f.homework.correctContent(two.token,a.id,{ ...content,operationId: crypto.randomUUID() })]); expect(contentRaces.filter((r) => r.status==='fulfilled')).toHaveLength(1); expect(contentRaces.find((r) => r.status==='rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    expect((await f.homework.versions(f.root.token,a.id)).map((v) => v.title)).toEqual(['Original content','Correct instructions']); expect((await f.database.pool.query('select revision,status from homework_outcomes where assignment_id=$1 order by revision',[a.id])).rows.map((r) => r.status.outcome)).toEqual(['NOT_COMPLETED','COMPLETED']);
    await expect(f.database.pool.query('update homework_versions set title=$1 where assignment_id=$2',['Overwrite',a.id])).rejects.toThrow(); await expect(f.database.pool.query('delete from homework_outcomes where assignment_id=$1',[a.id])).rejects.toThrow();
  });
  it('A08: mapped renamed statuses use the frozen date config; unknown status and absent inference fail',async () => {
    const c=(await family('HWMAPPED')).childIds[0]; const a=await assign('Mapped statuses',[c]); const original=await slot(c); const config=await f.learning.configuration(f.root.token);
    await f.learning.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions: config.definitions.map((d) => d.kind==='HOMEWORK' ? { ...d,statuses: d.statuses.map((s) => s.outcome==='COMPLETED' ? { ...s,label: { en: 'Reviewed successfully','ar-EG': 'اتراجع بنجاح' } } : s) } : d) });
    await record(a.id,c,'COMPLETED'); expect((await f.homework.history(f.root.token,c,{})).items[0].outcome?.status.label).toEqual(original.definition.statuses.find((s) => s.outcome==='COMPLETED')!.label);
    await expect(f.homework.publishOutcomes(f.root.token,{ assignmentId: a.id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: c,statusId: crypto.randomUUID(),note: null,expectedVersion: 0 }] })).rejects.toMatchObject({ messageKey: 'homework.invalid' });
  });
  it('No homework today and explicit excused exceptions remain distinct, once-only and cannot erase due work',async () => {
    const a=(await family('HWNONE')).childIds[0]; const b=(await family('HWEXCUSED')).childIds[0]; const input={ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: a,statusId: await status(a,'NO_HOMEWORK'),expectedVersion: 0,note: null },{ childId: b,statusId: await status(b,'EXCUSED'),expectedVersion: 0,note: 'Explicit exception' }] };
    const first=await f.homework.noHomeworkDay(f.root.token,input); expect(await f.homework.noHomeworkDay(f.root.token,input)).toEqual(first); expect((await slot(a)).status.outcome).toBe('NO_HOMEWORK'); expect((await slot(b)).status.outcome).toBe('EXCUSED');
    await expect(f.homework.noHomeworkDay(f.root.token,{ ...input,operationId: crypto.randomUUID() })).rejects.toThrow();
    const c=(await family('HWNOERASE')).childIds[0]; await assign('Due work',[c]); await expect(f.homework.noHomeworkDay(f.root.token,{ ...input,operationId: crypto.randomUUID(),entries: [{ childId: c,statusId: await status(c,'NO_HOMEWORK'),expectedVersion: 1,note: null }] })).rejects.toMatchObject({ messageKey: 'homework.invalid' });
  });
  it('snapshot recipients survive transfer without exposing old-class work to a destination teacher; qualified manager corrects',async () => {
    const c=(await family('HWMOVE')).childIds[0]; const a=await assign('Old classroom',[c]); const old=await f.learningStaff([f.classes[0].id]); const next=await f.learningStaff([f.classes[1].id]);
    await f.children.moveClassroom(f.root.token,c,{ expectedVersion: 1,classroomId: f.classes[1].id,reason: 'Classroom change' });
    expect((await f.homework.history(next.token,c,{})).items).toEqual([]); await expect(f.homework.roster(next.token,a.id,f.date())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.homework.correctContent(old.token,a.id,{ expectedVersion: 1,title: 'Unauthorized',instructions: 'Replace',reason: 'Lost child scope',operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.homework.correctContent(f.root.token,a.id,{ expectedVersion: 1,title: 'Manager correction',instructions: 'Replace',reason: 'Authorized manager',operationId: crypto.randomUUID() }); expect((await f.homework.history(f.root.token,c,{})).items[0].assignment.title).toBe('Manager correction');
    const newcomer=(await f.onboard('HWNEWCOMER',f.classes[1].id)).childIds[0]; expect((await f.homework.history(f.root.token,newcomer,{})).items).toEqual([]);
  });
  it('transaction rollback, fresh replay policy and module disable protect every homework payload/outbox',async () => {
    const created=await family('HWROLLBACK'); const c=created.childIds[0]; const guardian=await f.parent(created.guardianIds[0],'parent-hwrollback',created.credentials[0].temporaryPassword); await f.database.pool.query("alter table child_audit_events add constraint test_hw_failure check(event<>'homework.published') not valid");
    try { await expect(assign('Rollback assignment',[c])).rejects.toThrow(); } finally { await f.database.pool.query('alter table child_audit_events drop constraint test_hw_failure'); }
    expect((await f.database.pool.query("select 1 from homework_versions where title='Rollback assignment'")).rowCount).toBe(0);
    expect((await f.database.pool.query('select 1 from learning_events e join daily_slots s on s.id=e.slot_id join daily_snapshots d on d.id=s.snapshot_id where d.child_id=$1',[c])).rowCount).toBe(0);
    const a=await assign('Disable check',[c]); await f.setModule('HOMEWORK',false);
    try { await expect(f.homework.history(f.root.token,c,{})).rejects.toMatchObject({ code: 'MODULE_DISABLED' }); await expect(f.homework.history(guardian.token,c,{})).rejects.toMatchObject({ code: 'MODULE_DISABLED' }); expect((await f.learning.daily(f.root.token,c,f.date())).slots.some((s) => s.definition.kind==='HOMEWORK')).toBe(false); await expect(record(a.id,c,'COMPLETED')).rejects.toThrow(); }
    finally { await f.setModule('HOMEWORK',true); }
  });
  it('overdue missing/noncompleted work stays visible without blocking an unrelated new day',async () => {
    const c=(await family('HWOVERDUE')).childIds[0]; const original=f.date(); const a=await assign('Overdue exercise',[c]); await record(a.id,c,'NOT_COMPLETED'); f.setDate(addDays(original,1));
    expect((await f.homework.list(f.root.token,f.classes[0].id,f.date(),true)).map((a) => a.id)).toContain(a.id); expect((await f.homework.history(f.root.token,c,{ overdue: 'true' })).items[0].overdue).toBe(true); expect((await slot(c)).homework).toMatchObject({ due: 0,future: 0,reported: false });
    await f.homework.correctOutcome(f.root.token,{ assignmentId: a.id,childId: c,date: f.date(),statusId: await status(c,'COMPLETED'),note: null,expectedVersion: 1,reason: 'Late review',operationId: crypto.randomUUID() }); expect((await f.homework.history(f.root.token,c,{ overdue: 'true' })).items).toEqual([]); f.setDate(original);
  });
});
