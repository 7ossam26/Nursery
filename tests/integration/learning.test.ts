import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { learningFixture, addDays, customDefinition } from '../helpers/learning.js';
import type { CheckpointPublication } from '@nursery/contracts';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';

describe('Phase 08 real PostgreSQL learning engine',() => {
  let f: Awaited<ReturnType<typeof learningFixture>>;
  beforeEach(async () => { f = await learningFixture(); },30000);
  afterEach(async () => { await f?.close(); },30000);
  const publication = (childId: string,meaning = 1): CheckpointPublication => ({ childId,date: f.date(),definitionId: f.custom.id,statusId: f.custom.statuses[meaning].id,note: null,expectedVersion: 0,operationId: crypto.randomUUID() });

  it('A08: next-date labels/order/status availability and enabled dates preserve old snapshots, including lazy old days',async () => {
    const childId = (await f.onboard('VERS')).childIds[0]; const other = (await f.onboard('LAZY')).childIds[0];
    const first = await f.learning.daily(f.root.token,childId,f.date()); await f.learning.publish(f.root.token,publication(childId));
    const config = await f.learning.configuration(f.root.token); const newStatus = { ...f.custom.statuses[1],id: crypto.randomUUID(),label: { en: 'Reviewed','ar-EG': 'اتراجع' } };
    const extra = { ...customDefinition(),enabledFrom: addDays(f.date(),2),enabledUntil: addDays(f.date(),2) };
    const definitions = config.definitions.map((d) => d.id===f.custom.id ? { ...d,label: { en: 'Reading changed','ar-EG': 'قراءة جديدة' },order: 0,statuses: [...d.statuses.map((s) => s.id===f.custom.statuses[1].id ? { ...s,enabled: false,label: { en: 'Old recorded','ar-EG': 'قديم' } } : s),newStatus] } : { ...d,order: d.order+1 });
    const saved = await f.learning.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions: [...definitions,extra] }); expect(saved.effectiveOn).toBe(addDays(f.date(),1));
    expect((await f.learning.daily(f.root.token,other,f.date())).slots.map((s) => s.definition)).toEqual(first.slots.map((s) => s.definition));
    const oldDate = f.date(); f.setDate(addDays(oldDate,1)); const next = await f.learning.daily(f.root.token,childId,f.date());
    expect(next.slots[0].definition.label.en).toBe('Reading changed'); expect(next.slots).toHaveLength(4);
    await expect(f.learning.publish(f.root.token,publication(childId))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const old = await f.learning.daily(f.root.token,childId,oldDate); expect(old.slots.map((s) => s.definition)).toEqual(first.slots.map((s) => s.definition)); expect(old.progress.completed).toBe(1);
    f.setDate(addDays(oldDate,2)); expect((await f.learning.daily(f.root.token,childId,f.date())).slots).toHaveLength(5);
    f.setDate(addDays(oldDate,3)); expect((await f.learning.daily(f.root.token,childId,f.date())).slots).toHaveLength(4);
    await expect(f.database.pool.query('delete from checkpoint_versions where configuration_id=$1',[saved.id])).rejects.toThrow('append-only');
  });

  it('A09: published pending, resolved and N/A count distinctly; adapters share built-in semantics and zero slots hide the bar',async () => {
    const childId = (await f.onboard('COUNT')).childIds[0]; let input = publication(childId,0); const original = await f.learning.publish(f.root.token,input);
    expect((await f.learning.daily(f.root.token,childId,f.date())).progress).toEqual({ completed: 0,total: 4,hidden: false });
    input = { ...publication(childId),expectedVersion: 1 }; await f.learning.publish(f.root.token,input,'TRANSITION');
    let view = await f.learning.daily(f.root.token,childId,f.date()); expect(view.progress.completed).toBe(1);
    await f.learning.publish(f.root.token,{ ...publication(childId,2),expectedVersion: 2 },'TRANSITION'); view = await f.learning.daily(f.root.token,childId,f.date());
    expect(view.slots[3].status.meaning).toBe('NOT_APPLICABLE'); expect(view.progress.completed).toBe(1);
    const attendance = view.slots[0].definition; const absent = attendance.statuses.find((s) => s.outcome==='ABSENT')!;
    const adapter = { ...publication(childId),definitionId: attendance.id,statusId: absent.id };
    await expect(f.learning.publish(f.root.token,adapter)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const callAdapter = () => f.children.withPolicy(f.root.token,(tx,p) => f.learning.operation(tx,p,adapter.operationId,{ kind: 'ATTENDANCE',adapter },() => f.learning.authorizePublications(tx,p,'ATTENDANCE',[adapter]),() => f.learning.appendInTransaction(tx,p,'ATTENDANCE',adapter,'PUBLISH')));
    const adapterEvent = await callAdapter(); expect(await callAdapter()).toEqual(adapterEvent);
    await f.setModule('ATTENDANCE',false); await expect(callAdapter()).rejects.toMatchObject({ code: 'MODULE_DISABLED' }); await f.setModule('ATTENDANCE',true);
    expect((await f.learning.daily(f.root.token,childId,f.date())).progress.completed).toBe(2);
    expect((await f.learning.history(f.root.token,childId,f.date(),f.custom.id))[0]).toEqual(original);
    const config = await f.learning.configuration(f.root.token); await f.learning.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions: config.definitions.map((d) => ({ ...d,enabled: false })) });
    f.setDate(addDays(f.date(),1)); expect((await f.learning.daily(f.root.token,childId,f.date())).progress).toEqual({ completed: 0,total: 0,hidden: true });
  });

  it('A10: different actors race one successor; same-operation retries return original results with one audit/outbox',async () => {
    const childId = (await f.onboard('RACE')).childIds[0]; const a = await f.learningStaff([f.classes[0].id]); const b = await f.learningStaff([f.classes[0].id]);
    const input = publication(childId); const results = await Promise.all([f.learning.publish(a.token,input),f.learning.publish(a.token,input)]); expect(results[0]).toEqual(results[1]);
    const left = { ...publication(childId,2),expectedVersion: 1,reason: 'Verified correction' }; const right = { ...left,operationId: crypto.randomUUID(),note: 'Other correction' };
    const raced = await Promise.allSettled([f.learning.publish(a.token,left,'CORRECTION'),f.learning.publish(b.token,right,'CORRECTION')]);
    expect(raced.filter((r) => r.status==='fulfilled')).toHaveLength(1); expect(raced.filter((r) => r.status==='rejected')[0]).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    const winningIndex = raced.findIndex((r) => r.status==='fulfilled'); const winner = raced[winningIndex];
    const replay = await f.learning.publish(winningIndex===0 ? a.token : b.token,winningIndex===0 ? left : right,'CORRECTION'); expect(winner).toMatchObject({ value: replay });
    expect(await f.learning.publish(a.token,input)).toEqual(results[0]);
    await expect(f.learning.publish(a.token,{ ...input,note: 'Changed retry' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const chain = await f.learning.history(a.token,childId,f.date(),f.custom.id); expect(chain).toHaveLength(2); expect(chain[1].previousId).toBe(chain[0].id);
    for (const table of ['learning_events','learning_change_outbox']) expect((await f.database.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(2);
    expect((await f.database.pool.query("select count(*)::int as n from child_audit_events where event like 'learning.%' and child_id=$1",[childId])).rows[0].n).toBe(2);
    await expect(f.database.pool.query('update learning_events set note=$1 where id=$2',['tampered',chain[0].id])).rejects.toThrow('append-only');
    await expect(f.database.pool.query('delete from learning_change_outbox')).rejects.toThrow('append-only');
  },30000);

  it('A02/A31: exact assigned scope, strict payloads, revoked scope, disabled writes/read filtering and scoped recipients',async () => {
    const extra = await f.app.organization.save(f.root.token,'classrooms',{ code: 'C3',name: 'Class 3',branchId: f.a.id,ageGroupId: null,capacity: 20 });
    const a = await f.onboard('A'); const b = await f.onboard('B',f.classes[1].id); const c = await f.onboard('C',extra.id); const d = await f.onboard('D',f.classes[2].id,f.b.id);
    const staff = await f.learningStaff([f.classes[0].id,f.classes[1].id]); const viewOnly = await f.learningStaff([f.classes[0].id],['learning.read']);
    expect((await f.learning.roster(staff.token)).map((r) => r.id).sort()).toEqual([a.childIds[0],b.childIds[0]].sort());
    for (const id of [c.childIds[0],d.childIds[0]]) await expect(f.learning.publish(staff.token,publication(id))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.learning.publish(viewOnly.token,publication(a.childIds[0]))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.learning.configuration(staff.token)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const input = publication(a.childIds[0]); await expect(f.learning.publish(staff.token,{ ...input,fields: { score: 5 } })).rejects.toThrow();
    const rejected = await f.app.inject({ method: 'POST',url: '/api/v1/learning/publications',headers: { cookie: `__Host-nursery_session=${staff.token}`,origin: f.config.appOrigin,'x-csrf-token': keyedHash(f.config.sessionSecret,`session-csrf:${staff.token}`) },payload: { ...input,score: 0 } });
    expect(rejected.statusCode).toBe(400); expect(rejected.json().code).toBe('VALIDATION_ERROR');
    await expect(f.learning.publish(staff.token,{ ...input,statusId: crypto.randomUUID() })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const original = await f.learning.publish(staff.token,input); const row = (await f.database.pool.query('select * from learning_change_outbox where event_id=$1',[original.id])).rows[0];
    expect(row.recipient_ids).toEqual(a.guardianIds); expect(row.classroom_id).toBe(f.classes[0].id); expect(row.module_key).toBe('CUSTOM_CHECKPOINTS'); expect(row).not.toHaveProperty('note');
    const parent = await f.parent(a.guardianIds[0],'parent-a',a.credentials[0].temporaryPassword);
    expect((await f.learning.daily(parent.token,a.childIds[0],f.date())).progress.completed).toBe(1);
    await expect(f.learning.daily(parent.token,b.childIds[0],f.date())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.setModule('CUSTOM_CHECKPOINTS',false);
    await expect(f.learning.publish(staff.token,input)).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
    expect((await f.learning.daily(parent.token,a.childIds[0],f.date())).slots.some((s) => s.definition.kind==='STATUS_NOTE')).toBe(false);
    expect(await f.learning.history(staff.token,a.childIds[0],f.date(),f.custom.id)).toHaveLength(1);
    await f.setModule('CUSTOM_CHECKPOINTS',true);
    await f.app.organization.assign(f.root.token,staff.id,{ expectedVersion: 2,roleIds: [staff.roleId],branchIds: [f.a.id],classroomIds: [f.classes[1].id],scopeMode: 'CLASSROOM' });
    await expect(f.learning.publish(staff.token,input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.database.pool.query('update guardian_child_links set can_read=false where guardian_id=$1',[a.guardianIds[0]]);
    await expect(f.learning.daily(parent.token,a.childIds[0],f.date())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  },45000);

  it('validates stable identities, required built-in mappings, unsafe deletion and competing configuration revisions',async () => {
    const config = await f.learning.configuration(f.root.token);
    for (const definitions of [config.definitions.slice(0,3),config.definitions.map((d) => d.id===f.custom.id ? { ...d,statuses: d.statuses.slice(0,2) } : d),config.definitions.map((d) => ({ ...d,statuses: d.statuses.map((s,i) => i===0 ? { ...s,meaning: 'RESOLVED' } : s) }))]) await expect(f.learning.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions })).rejects.toThrow();
    await expect(f.learning.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions: config.definitions.map((d) => d.kind==='ATTENDANCE' ? { ...d,statuses: d.statuses.map((s) => s.outcome==='ABSENT' ? { ...s,enabled: false } : s) } : d) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const input = { expectedVersion: config.version,definitions: config.definitions };
    const result = await Promise.allSettled([f.learning.saveConfiguration(f.root.token,input),f.learning.saveConfiguration(f.root.token,input)]);
    expect(result.filter((r) => r.status==='fulfilled')).toHaveLength(1); expect(result.find((r) => r.status==='rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
  });

  it('classroom publication is atomic with child exceptions and rollback after an outbox failure',async () => {
    const a = (await f.onboard('BATCHA')).childIds[0]; const b = (await f.onboard('BATCHB')).childIds[0]; const foreign = (await f.onboard('FOREIGN',f.classes[1].id)).childIds[0];
    const entry = (id: string,meaning = 1) => { const { operationId: _operationId,...rest } = publication(id,meaning); return rest; };
    const raw = { classroomId: f.classes[0].id,operationId: crypto.randomUUID(),entries: [entry(a),entry(foreign)] };
    await expect(f.learning.batch(f.root.token,raw)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await f.database.pool.query('select count(*)::int as n from learning_events')).rows[0].n).toBe(0);
    await f.database.pool.query("create function reject_learning_outbox() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_outbox before insert on learning_change_outbox for each row execute function reject_learning_outbox()");
    await expect(f.learning.publish(f.root.token,publication(a))).rejects.toThrow('Injected failure');
    for (const table of ['learning_events','daily_snapshots','learning_operations']) expect((await f.database.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n).toBe(0);
    await f.database.pool.query('drop trigger reject_outbox on learning_change_outbox');
    raw.entries = [entry(a),entry(b,2)]; const results = await f.learning.batch(f.root.token,raw); expect(await f.learning.batch(f.root.token,raw)).toEqual(results);
    expect((await f.learning.daily(f.root.token,a,f.date())).slots[3].status.meaning).toBe('RESOLVED'); expect((await f.learning.daily(f.root.token,b,f.date())).slots[3].status.meaning).toBe('NOT_APPLICABLE');
  });

  it('concurrent lazy snapshots stay unique; corrections require a reason and transitions cannot rewrite notes',async () => {
    const childId = (await f.onboard('SNAP')).childIds[0]; const otherActor = await f.learningStaff([f.classes[0].id]);
    const views = await Promise.all([f.learning.daily(f.root.token,childId,f.date()),f.learning.daily(otherActor.token,childId,f.date())]); expect(views[0].snapshotId).toBe(views[1].snapshotId);
    expect((await f.database.pool.query('select count(*)::int as n from daily_slots')).rows[0].n).toBe(4);
    await f.learning.publish(f.root.token,publication(childId));
    await expect(f.learning.publish(f.root.token,{ ...publication(childId,2),expectedVersion: 1,reason: ' ' },'CORRECTION')).rejects.toThrow();
    await expect(f.learning.publish(f.root.token,{ ...publication(childId,2),expectedVersion: 1,note: 'Rewrite without reason' },'TRANSITION')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(f.learning.daily(f.root.token,childId,addDays(f.date(),1))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
