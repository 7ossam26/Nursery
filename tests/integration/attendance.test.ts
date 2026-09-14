import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, learningFixture } from '../helpers/learning.js';

describe('Phase 09 real PostgreSQL attendance',() => {
  let f: Awaited<ReturnType<typeof learningFixture>>;
  beforeEach(async () => { f=await learningFixture(); },30000);
  afterEach(async () => { await f?.close(); },30000);

  it('keeps missing, absent and present distinct; publishes only explicit entries and stages unexpected absence once',async () => {
    const a=await f.onboard('ATTA'); const b=await f.onboard('ATTB');
    const parent=await f.parent(a.guardianIds[0],'parent-atta',a.credentials[0].temporaryPassword);
    const firstNotice=await f.attendance.plannedAbsence(parent.token,{ childId: a.childIds[0],from: f.date(),until: f.date(),reason: 'Family appointment' });
    const replayedNotice=await f.attendance.plannedAbsence(parent.token,{ childId: a.childIds[0],from: f.date(),until: f.date(),reason: 'Family appointment' });
    expect(replayedNotice).toEqual(firstNotice); expect(replayedNotice[0].version).toBe(1);
    let draft=await f.attendance.classroom(f.root.token,f.classes[0].id,f.date());
    expect(draft.entries.map((entry) => entry.record)).toEqual([null,null]);
    const status=(outcome: string) => draft.entries[0].definition.statuses.find((value) => value.outcome===outcome)!.id;
    await f.attendance.publishClassroom(f.root.token,{ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: a.childIds[0],statusId: status('ABSENT'),absenceReason: 'Family appointment',expectedVersion: 0 }] });
    draft=await f.attendance.classroom(f.root.token,f.classes[0].id,f.date());
    expect(draft.complete).toBe(1); expect(draft.entries.find((entry) => entry.childId===a.childIds[0])?.record?.presence).toBe('ABSENT');
    expect(draft.entries.find((entry) => entry.childId===b.childIds[0])?.record).toBeNull();
    expect((await f.database.pool.query('select count(*)::int as count from attendance_absence_alerts')).rows[0].count).toBe(0);
    await f.attendance.publishClassroom(f.root.token,{ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: b.childIds[0],statusId: status('PRESENT'),absenceReason: null,expectedVersion: 0 }] });
    const report=await f.attendance.daily(parent.token,a.childIds[0],f.date());
    expect(report.attendance?.absenceReason).toBe('Family appointment'); expect(report.progress.completed).toBe(1);
    expect((await f.attendance.classroom(f.root.token,f.classes[0].id,f.date())).complete).toBe(2);
  });

  it('A10 retains correction history and rejects two stale teachers without overwriting',async () => {
    const child=(await f.onboard('CORR')).childIds[0]; const left=await f.learningStaff([f.classes[0].id]); const right=await f.learningStaff([f.classes[0].id]);
    const draft=await f.attendance.classroom(left.token,f.classes[0].id,f.date());
    const absent=draft.entries[0].definition.statuses.find((value) => value.outcome==='ABSENT')!.id;
    const present=draft.entries[0].definition.statuses.find((value) => value.outcome==='PRESENT')!.id;
    await f.attendance.publishClassroom(left.token,{ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: child,statusId: absent,absenceReason: null,expectedVersion: 0 }] });
    const base={ childId: child,date: f.date(),statusId: present,absenceReason: null,expectedVersion: 1,reason: 'Teacher verified the register' };
    const raced=await Promise.allSettled([f.attendance.correct(left.token,{ ...base,operationId: crypto.randomUUID() }),f.attendance.correct(right.token,{ ...base,operationId: crypto.randomUUID() })]);
    expect(raced.filter((result) => result.status==='fulfilled')).toHaveLength(1);
    expect(raced.find((result) => result.status==='rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    const history=await f.attendance.history(left.token,child,f.date()); expect(history).toHaveLength(2);
    expect(history.map((record) => record.presence)).toEqual(['ABSENT','PRESENT']); expect(history[1].event.previousId).toBe(history[0].event.id);
    expect((await f.database.pool.query('select count(*)::int as count from attendance_absence_alerts')).rows[0].count).toBe(1);
    await expect(f.database.pool.query('delete from attendance_records')).rejects.toThrow('append-only');
  },30000);

  it('A02/A06/A31 enforces assigned rosters, blocked guardian reads and immediate module disable',async () => {
    const own=await f.onboard('OWN'); const foreign=await f.onboard('OTHER',f.classes[1].id); const staff=await f.learningStaff([f.classes[0].id]);
    expect((await f.attendance.classroom(staff.token,f.classes[0].id,f.date())).entries.map((entry) => entry.childId)).toEqual(own.childIds);
    await expect(f.attendance.classroom(staff.token,f.classes[1].id,f.date())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const parent=await f.parent(own.guardianIds[0],'parent-own',own.credentials[0].temporaryPassword);
    expect((await f.attendance.daily(parent.token,own.childIds[0],f.date())).attendance).toBeNull();
    await f.licensing.blockAccount(f.root.token,own.guardianIds[0],{ publicMessage: 'Contact nursery',reason: 'Test block' });
    await expect(f.attendance.daily(parent.token,own.childIds[0],f.date())).rejects.toMatchObject({ code: 'ACCOUNT_BLOCKED' });
    await f.setModule('ATTENDANCE',false);
    await expect(f.attendance.classroom(staff.token,f.classes[0].id,f.date())).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
    await expect(f.attendance.daily(f.root.token,foreign.childIds[0],f.date())).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
  });

  it('records an explicit no-class N/A day and respects effective lifecycle placement',async () => {
    const child=(await f.onboard('DAY')).childIds[0]; const next=addDays(f.date(),1); f.setDate(next);
    let draft=await f.attendance.classroom(f.root.token,f.classes[0].id,next);
    expect(draft.entries[0].record).toBeNull();
    const noClassInput={ classroomId: f.classes[0].id,date: next,operationId: crypto.randomUUID() }; const events=await f.attendance.noClass(f.root.token,noClassInput);
    expect(await f.attendance.noClass(f.root.token,noClassInput)).toEqual(events);
    draft=await f.attendance.classroom(f.root.token,f.classes[0].id,next);
    expect(draft.noClass).toBe(true); expect(draft.entries[0].record?.presence).toBe('NO_CLASS');
    const day=await f.attendance.daily(f.root.token,child,next); expect(day.attendance?.presence).toBe('NO_CLASS');
    expect(day.slots.find((slot) => slot.definition.kind==='ATTENDANCE')?.status.meaning).toBe('NOT_APPLICABLE');
    await expect(f.attendance.noClass(f.root.token,{ classroomId: f.classes[0].id,date: next,operationId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'STALE_VERSION' });
  });

  it('A08 keeps the snapshotted attendance label and daily count after configuration changes',async () => {
    const child=(await f.onboard('HISTORY')).childIds[0]; const draft=await f.attendance.classroom(f.root.token,f.classes[0].id,f.date());
    const present=draft.entries[0].definition.statuses.find((status) => status.outcome==='PRESENT')!;
    await f.attendance.publishClassroom(f.root.token,{ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: child,statusId: present.id,absenceReason: null,expectedVersion: 0 }] });
    const oldDate=f.date(); const old=await f.attendance.daily(f.root.token,child,oldDate); const oldTotal=old.progress.total;
    const config=await f.learning.configuration(f.root.token);
    await f.learning.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions: config.definitions.map((definition) => definition.kind==='ATTENDANCE' ? { ...definition,statuses: definition.statuses.map((status) => status.id===present.id ? { ...status,label: { en: 'Here today', 'ar-EG': 'موجود النهارده' } } : status) } : definition) });
    f.setDate(addDays(oldDate,1)); const next=await f.attendance.daily(f.root.token,child,f.date());
    expect(next.slots.find((slot) => slot.definition.kind==='ATTENDANCE')?.definition.statuses.find((status) => status.id===present.id)?.label.en).toBe('Here today');
    const historical=await f.attendance.daily(f.root.token,child,oldDate);
    expect(historical.progress.total).toBe(oldTotal); expect(historical.slots.find((slot) => slot.definition.kind==='ATTENDANCE')?.status.label.en).toBe(present.label.en);
  });

  it('rolls back the attendance payload, learning event, audit, operation and outbox when alert staging fails',async () => {
    const child=(await f.onboard('ROLLBACK')).childIds[0]; const draft=await f.attendance.classroom(f.root.token,f.classes[0].id,f.date());
    const absent=draft.entries[0].definition.statuses.find((status) => status.outcome==='ABSENT')!.id;
    await f.database.pool.query("create function reject_attendance_alert() returns trigger language plpgsql as $$ begin raise exception 'Injected attendance alert failure'; end $$; create trigger reject_attendance_alert before insert on attendance_absence_alerts for each row execute function reject_attendance_alert()");
    await expect(f.attendance.publishClassroom(f.root.token,{ classroomId: f.classes[0].id,date: f.date(),operationId: crypto.randomUUID(),entries: [{ childId: child,statusId: absent,absenceReason: null,expectedVersion: 0 }] })).rejects.toThrow('Injected attendance alert failure');
    for (const table of ['attendance_records','attendance_absence_alerts','learning_events','learning_operations','learning_change_outbox']) expect((await f.database.pool.query(`select count(*)::int as count from ${table}`)).rows[0].count).toBe(0);
    expect((await f.database.pool.query("select count(*)::int as count from child_audit_events where event like 'learning.%' and child_id=$1",[child])).rows[0].count).toBe(0);
  });
});
