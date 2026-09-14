import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { defaultLinkPermissions } from '@nursery/contracts';
import { homeworkFixture } from '../helpers/homework.js';
import { defaultLimitsInput } from '../helpers/licensing.js';
import { addDays } from '../helpers/learning.js';

describe('Phase 12 durable inbox and current announcement targets (real PostgreSQL)',() => {
  let f: Awaited<ReturnType<typeof homeworkFixture>>;
  beforeAll(async () => { f=await homeworkFixture(); }); afterAll(async () => { await f?.close(); });
  const input=(target: unknown) => ({ operationId: crypto.randomUUID(),title: 'Nursery notice',body: 'Please read this notice.',target,acknowledgmentRequired: true });
  async function family(code: string,two=false) {
    const raw=f.family(code);
    if (two) { raw.guardians.push({ kind: 'NEW',username: `second-${code.toLowerCase()}`,profile: { fullName: 'Second guardian',mobile: '01000000002' } }); raw.children[0].links.push({ guardianIndex: 1,relationship: 'Parent',permissions: { ...defaultLinkPermissions } }); }
    const created=await f.children.onboard(f.root.token,raw);
    const parents=[];
    for (let i=0;i<created.guardianIds.length;i++) parents.push(await f.parent(created.guardianIds[i],(raw.guardians[i] as { username: string }).username,created.credentials.find((c) => c.id===created.guardianIds[i])!.temporaryPassword));
    return { ...created,parents,childId: created.childIds[0] };
  }
  it('A03: one announcement per guardian across sibling witnesses, independent read and acknowledgment state',async () => {
    const a=await family('CMTWO',true); const s=f.app.communication;
    // Add a sibling using both existing accounts, through the real onboarding service.
    const sibling=f.family('CMSIBLING'); sibling.guardians=a.guardianIds.map((id) => ({ kind: 'EXISTING',accountId: id })); sibling.children[0].links=[0,1].map((guardianIndex) => ({ guardianIndex,relationship: 'Parent',permissions: { ...defaultLinkPermissions } }));
    await f.children.onboard(f.root.token,sibling);
    const published=await s.publish(f.root.token,input({ kind: 'PARENTS',ids: a.guardianIds }));
    const [first,second]=await Promise.all(a.parents.map((p) => s.notifications(p.token,{})));
    expect(first.items).toHaveLength(1); expect(second.items).toHaveLength(1); expect(first.items[0].id).not.toBe(second.items[0].id);
    expect(first.items[0].href).toBe(`/parent/notices/${published.id}`);
    await s.setRead(a.parents[0].token,first.items[0].id,true); expect((await s.notifications(a.parents[0].token,{})).unread).toBe(0); expect((await s.notifications(a.parents[1].token,{})).unread).toBe(1);
    await Promise.all([s.acknowledge(a.parents[0].token,published.id),s.acknowledge(a.parents[0].token,published.id)]);
    expect((await s.announcement(a.parents[0].token,published.id)).acknowledged).toBe(true); expect((await s.announcement(a.parents[1].token,published.id)).acknowledged).toBe(false);
    await expect(s.setRead(a.parents[1].token,first.items[0].id,true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await f.database.pool.query('select count(*)::int as n from announcement_acknowledgments where announcement_id=$1',[published.id])).rows[0].n).toBe(1);
  });
  it('A06/A34: link revocation, module disable and account block filter old records and guessed targets',async () => {
    const a=await family('CMREVOKE'); const p=a.parents[0]; const s=f.app.communication;
    const notice=await s.publish(f.root.token,input({ kind: 'CHILDREN',ids: [a.childId] }));
    await f.homework.publish(f.root.token,{ operationId: crypto.randomUUID(),classroomId: f.classes[0].id,assignedOn: f.date(),dueOn: f.date(),title: 'Private homework',instructions: 'Private instructions',childIds: [a.childId] });
    expect((await s.notifications(p.token,{})).items.some((n) => n.kind==='HOMEWORK')).toBe(true);
    await f.setModule('HOMEWORK',false);
    try { expect((await s.notifications(p.token,{})).items.some((n) => n.kind==='HOMEWORK' || n.kind==='LEARNING')).toBe(false); } finally { await f.setModule('HOMEWORK',true); }
    const old=(await s.notifications(p.token,{})).items[0];
    await f.children.linkGuardian(f.root.token,a.childId,{ expectedChildVersion: 1,accountId: a.guardianIds[0],relationship: 'Parent',active: false,permissions: defaultLinkPermissions });
    expect(await s.notifications(p.token,{})).toEqual({ items: [],total: 0,unread: 0 }); await expect(s.announcement(p.token,notice.id)).rejects.toMatchObject({ code: 'FORBIDDEN' }); await expect(s.setRead(p.token,old.id,true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.children.linkGuardian(f.root.token,a.childId,{ expectedChildVersion: 2,accountId: a.guardianIds[0],relationship: 'Parent',active: true,permissions: defaultLinkPermissions });
    await f.licensing.blockAccount(f.root.token,a.guardianIds[0],{ reason: 'Explicit administration block',publicMessage: 'Contact the nursery' });
    await expect(s.notifications(p.token,{})).rejects.toMatchObject({ code: 'ACCOUNT_BLOCKED' });
  });
  it('branch/classroom scopes and fresh target placement survive neither guesses nor old recipient snapshots',async () => {
    const a=await family('CMSCOPE'); const s=f.app.communication; const teacher=await f.learningStaff([f.classes[0].id],['announcements.manage']);
    const noCapability=await f.learningStaff([f.classes[0].id],['learning.read']);
    const options=await s.options(teacher.token,{}); expect(options.nursery).toBe(false); expect(options.branches).toEqual([]); expect(options.classrooms.map((c) => c.id)).toEqual([f.classes[0].id]); expect(options.children.map((c) => c.id)).toContain(a.childId);
    await expect(s.publish(noCapability.token,input({ kind: 'CHILDREN',ids: [a.childId] }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.publish(teacher.token,input({ kind: 'NURSERY' }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(s.publish(teacher.token,input({ kind: 'CLASSROOM',id: f.classes[1].id }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const n=await s.publish(teacher.token,input({ kind: 'CLASSROOM',id: f.classes[0].id })); expect((await s.announcement(a.parents[0].token,n.id)).title).toBe('Nursery notice');
    await f.children.moveClassroom(f.root.token,a.childId,{ expectedVersion: 1,classroomId: f.classes[1].id,reason: 'Move to new classroom' });
    await expect(s.announcement(a.parents[0].token,n.id)).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect((await s.notifications(a.parents[0].token,{})).items).toEqual([]);
  });
  it('A12: rollback creates no notice/outbox, concurrent retries deduplicate delivery without changing read state',async () => {
    const a=await family('CMATOMIC'); const s=f.app.communication; const raw=input({ kind: 'CHILDREN',ids: [a.childId] });
    await f.database.pool.query("alter table child_audit_events add constraint cm_rollback check(event<>'announcement.published') not valid");
    try { await expect(s.publish(f.root.token,raw)).rejects.toThrow(); } finally { await f.database.pool.query('alter table child_audit_events drop constraint cm_rollback'); }
    expect((await s.notifications(a.parents[0].token,{})).total).toBe(0);
    const [one,two]=await Promise.all([s.publish(f.root.token,raw),s.publish(f.root.token,raw)]); expect(one).toEqual(two);
    const pages=await Promise.all([s.notifications(a.parents[0].token,{}),s.notifications(a.parents[0].token,{})]); expect(pages[0].total).toBe(1); expect(pages[1].total).toBe(1);
    await s.setRead(a.parents[0].token,pages[0].items[0].id,true); expect((await s.notifications(a.parents[0].token,{})).unread).toBe(0);
    const json=JSON.stringify(await s.announcement(a.parents[0].token,one.id)); expect(json).not.toContain('recipient'); expect(json).not.toContain('guardian'); expect(json).not.toContain('target');
    await expect(f.database.pool.query('delete from announcements where id=$1',[one.id])).rejects.toThrow();
  });
  it('planned-absence edits and holiday notices use real producer records, never publish attendance',async () => {
    const a=await family('CMPRODUCE'); const p=a.parents[0]; const s=f.app.communication;
    const absence={ childId: a.childId,from: f.date(),until: f.date(),reason: 'Family visit' };
    await f.attendance.plannedAbsence(p.token,absence); await f.attendance.plannedAbsence(p.token,absence);
    expect((await s.notifications(p.token,{})).items.filter((n) => n.kind==='PLANNED_ABSENCE')).toHaveLength(1);
    await s.publish(f.root.token,{ ...input({ kind: 'BRANCH',id: f.a.id }),holiday: { from: f.date(),until: f.date() } });
    expect((await s.notifications(p.token,{})).items.some((n) => n.kind==='HOLIDAY')).toBe(true);
    expect((await f.database.pool.query('select count(*)::int as n from attendance_records')).rows[0].n).toBe(0);
  });
  it('A12/A34: real HTTP SSE invalidates after publication, reconnects to latest scoped data and closes on link loss',async () => {
    const a=await family('CMLIVE'); const p=a.parents[0]; const url=await f.app.listen({ host: '127.0.0.1',port: 0 }); const abort=new AbortController();
    const response=await fetch(`${url}/api/v1/parent/live?childId=${a.childId}`,{ headers: { cookie: `__Host-nursery_session=${p.token}` },signal: abort.signal });
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader=response.body!.getReader(); const decoder=new TextDecoder(); let wire='';
    async function event(name: string) {
      const deadline=setTimeout(() => abort.abort(),6000);
      try { while (!wire.includes(`event: ${name}`)) { const chunk=await reader.read(); if (chunk.done) throw new Error(`Stream closed before ${name}`); wire+=decoder.decode(chunk.value); } }
      finally { clearTimeout(deadline); }
    }
    try {
      await event('snapshot'); const started=Date.now();
      await f.homework.publish(f.root.token,{ operationId: crypto.randomUUID(),classroomId: f.classes[0].id,assignedOn: f.date(),dueOn: f.date(),title: 'Live private instructions',instructions: 'Read privately',childIds: [a.childId] });
      await event('invalidate'); expect(Date.now()-started).toBeLessThan(5000); expect(wire).not.toContain(a.childId); expect(wire).not.toContain('Live private'); expect(wire).not.toContain('Read privately');
      expect((await f.homework.history(p.token,a.childId,{})).items[0].assignment.title).toBe('Live private instructions');
      const reconnectAbort=new AbortController(); const reconnect=await fetch(`${url}/api/v1/parent/live?childId=${a.childId}`,{ headers: { cookie: `__Host-nursery_session=${p.token}` },signal: reconnectAbort.signal });
      const reconnectReader=reconnect.body!.getReader(); try { const chunk=await reconnectReader.read(); expect(decoder.decode(chunk.value)).toContain('event: snapshot'); } finally { reconnectAbort.abort(); await reconnectReader.cancel().catch(() => {}); }
      await f.children.linkGuardian(f.root.token,a.childId,{ expectedChildVersion: 1,accountId: a.guardianIds[0],relationship: 'Parent',active: false,permissions: defaultLinkPermissions });
      await event('revoked'); await expect(f.app.communication.liveSnapshot(p.token,a.childId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const closed=await reader.read(); expect(closed.done).toBe(true);
    } finally { abort.abort(); await reader.cancel().catch(() => {}); }
  });
  it('incident and unexpected-absence adapters expose hints only and deduplicate the attendance event',async () => {
    const a=await family('CMADAPTERS'); const p=a.parents[0];
    await f.app.safety.reportIncident(f.root.token,a.childId,{ occurredOn: f.date(),occurredTime: '09:00',description: 'Sensitive incident description',actionTaken: 'Sensitive treatment note',guardianInformed: false,contactMethod: null,followUp: null });
    const slot=(await f.learning.daily(f.root.token,a.childId,f.date())).slots.find((s) => s.definition.kind==='ATTENDANCE')!;
    await f.attendance.publishClassroom(f.root.token,{ operationId: crypto.randomUUID(),classroomId: f.classes[0].id,date: f.date(),entries: [{ childId: a.childId,statusId: slot.definition.statuses.find((s) => s.outcome==='ABSENT')!.id,absenceReason: null,expectedVersion: 0 }] });
    const page=await f.app.communication.notifications(p.token,{}); expect(page.items.map((n) => n.kind).sort()).toEqual(['INCIDENT','UNEXPECTED_ABSENCE']); expect(JSON.stringify(page)).not.toContain('Sensitive');
    await f.setModule('INCIDENTS',false); try { expect((await f.app.communication.notifications(p.token,{})).items.map((n) => n.kind)).toEqual(['UNEXPECTED_ABSENCE']); } finally { await f.setModule('INCIDENTS',true); }
  });
  it('A34: license suspension terminates an authenticated stream and denies stored inbox reads without deleting history',async () => {
    const a=await family('CMLICENSE'); const p=a.parents[0]; const address=f.app.server.address(); if (!address || typeof address==='string') throw new Error('Real HTTP listener required'); const url=`http://127.0.0.1:${address.port}`;
    const abort=new AbortController(); const response=await fetch(`${url}/api/v1/parent/live`,{ headers: { cookie: `__Host-nursery_session=${p.token}` },signal: abort.signal }); const reader=response.body!.getReader(); const decoder=new TextDecoder(); let wire='';
    const timeout=setTimeout(() => abort.abort(),6000);
    try {
      const first=await reader.read(); expect(decoder.decode(first.value)).toContain('event: snapshot'); const before=(await f.licensing.context(f.root.token)).limits!;
      await f.licensing.saveLimits(f.root.token,{ expectedVersion: before.version,value: { ...defaultLimitsInput,parentCapacity: 20,employeeCapacity: 20,validUntil: addDays(f.date(),-2),graceDays: 0 } });
      while (!wire.includes('event: revoked')) { const chunk=await reader.read(); if (chunk.done) throw new Error('Missing revocation'); wire+=decoder.decode(chunk.value); }
      expect(wire).not.toContain(a.childId); await expect(f.app.communication.notifications(p.token,{})).rejects.toMatchObject({ code: 'LICENSE_SUSPENDED' }); expect((await reader.read()).done).toBe(true);
    } finally {
      clearTimeout(timeout); abort.abort(); await reader.cancel().catch(() => {}); const current=(await f.licensing.context(f.root.token)).limits!; await f.licensing.saveLimits(f.root.token,{ expectedVersion: current.version,value: { ...defaultLimitsInput,parentCapacity: 20,employeeCapacity: 20 } });
    }
  });
  it('closes active streams before HTTP/database shutdown',async () => {
    const a=await family('CMSTOP'); const address=f.app.server.address(); if (!address || typeof address==='string') throw new Error('Real HTTP listener required');
    const abort=new AbortController(); const response=await fetch(`http://127.0.0.1:${address.port}/api/v1/parent/live`,{ headers: { cookie: `__Host-nursery_session=${a.parents[0].token}` },signal: abort.signal }); const reader=response.body!.getReader();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try { await reader.read(); await Promise.race([f.app.close(),new Promise((_,reject) => { deadline=setTimeout(() => reject(new Error('SSE blocked shutdown')),4000); })]); expect((await reader.read()).done).toBe(true); }
    finally { clearTimeout(deadline); abort.abort(); await reader.cancel().catch(() => {}); }
  });
});
