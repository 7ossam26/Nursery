import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { organizationFixture, templateRoles } from '../helpers/organization.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';
import { requireGuardianLink, requireSensitiveCorrection, queryScope } from '../../apps/api/src/modules/organization/policy.js';
import { capacityWarnings } from '@nursery/contracts';

describe('Phase 04 policy with real PostgreSQL and HTTP', () => {
  let f: Awaited<ReturnType<typeof organizationFixture>>;
  beforeAll(async () => { f = await organizationFixture(); },30000);
  afterAll(async () => { await f?.close(); });
  function http(token: string, path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', payload?: unknown) {
    return f.app.inject({ method,url: `/api/v1/organization/${path}`,headers: { cookie: `__Host-nursery_session=${token}`,origin: f.config.appOrigin,'content-type': 'application/json','x-csrf-token': keyedHash(f.config.sessionSecret,`session-csrf:${token}`) },...(payload === undefined ? {} : { payload }) });
  }
  const assignment = async (id: string) => (await f.service.staffList(f.root.token,{})).items.find((s) => s.id === id)!;
  it('A01 filters branch lists, selected scope, totals, detail, mutation, and file/export reads', async () => {
    const staff = await f.staff([templateRoles.manager],[f.a.id]);
    const branches = await http(staff.token,'branches'); expect(branches.statusCode).toBe(200);
    expect(branches.json().data.items.map((v: { id: string }) => v.id)).toEqual([f.a.id]); expect(branches.json().data.total).toBe(1);
    const list = await http(staff.token,'classrooms?limit=1'); expect(list.json().data.items).toHaveLength(1); expect(list.json().data.total).toBe(3);
    for (const path of [`branches/${f.b.id}`,`classrooms/${f.classes[3].id}`,`classrooms?branchId=${f.b.id}`]) expect((await http(staff.token,path)).statusCode).toBe(403);
    const update = await http(staff.token,`classrooms/${f.classes[3].id}`,'PUT',{ expectedVersion: 1,value: { code: 'LEAK',name: 'Denied',branchId: f.b.id,ageGroupId: null,capacity: 9 } }); expect(update.statusCode).toBe(403);
    await expect(f.service.withResource(staff.token,'organization.read',async () => ({ branchId: f.b.id,classroomId: f.classes[3].id }),async () => 'private-file')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.service.withResource(staff.token,'organization.read',async () => ({ branchId: f.a.id,classroomId: f.classes[0].id }),async () => 'allowed-export')).resolves.toBe('allowed-export');
    const unassigned = await f.staff([templateRoles.manager],[]); expect((await http(unassigned.token,'branches')).json().data.total).toBe(0);
    expect((await http(staff.token,'classrooms?limit=101')).statusCode).toBe(400);
  });
  it('A02 intersects teacher classroom assignments and branches across arbitrary role combinations', async () => {
    const teacher = await f.staff([templateRoles.teacher,templateRoles.manager],[f.a.id],[f.classes[0].id,f.classes[1].id],'CLASSROOM');
    const response = await http(teacher.token,'classrooms'); expect(response.json().data.total).toBe(2);
    expect(response.json().data.items.map((c: { id: string }) => c.id).sort()).toEqual([f.classes[0].id,f.classes[1].id].sort());
    expect((await http(teacher.token,`classrooms/${f.classes[2].id}`)).statusCode).toBe(403);
    await expect(f.service.withResource(teacher.token,'organization.manage',async () => ({ branchId: f.a.id,classroomId: f.classes[2].id }),async () => 'mutation')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const count = await f.service.withPolicy(teacher.token,async (tx,p) => { const scope = queryScope(p,'organization.read','classroom'); return (await tx.query(`select count(*)::int as count from classrooms c where ${scope.sql}`,scope.values)).rows[0].count; }); expect(count).toBe(2);
    const before = await assignment(teacher.id);
    await expect(f.service.assign(f.root.token,teacher.id,{ expectedVersion: before.version,roleIds: before.roleIds,branchIds: [f.a.id],classroomIds: [f.classes[3].id],scopeMode: 'CLASSROOM' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await assignment(teacher.id)).toEqual(before);
    await expect(f.database.pool.query('insert into teacher_classrooms(account_id,classroom_id,branch_id) values($1,$2,$3)',[teacher.id,f.classes[3].id,f.b.id])).rejects.toMatchObject({ code: '23503' });
  });
  it('role names never authorize; multiple roles union capabilities and SYSTEM reserved keys cannot enter roles', async () => {
    const role = await f.service.save(f.root.token,'roles',{ name: 'Custom arbitrary label',capabilities: ['organization.read'] });
    const user = await f.staff([role.id],[f.a.id]);
    await f.service.save(f.root.token,'roles',{ expectedVersion: role.version,value: { name: 'SYSTEM Superadmin administrator',capabilities: ['organization.read'] } },role.id);
    expect((await http(user.token,'branches')).statusCode).toBe(200);
    expect((await http(user.token,'roles','POST',{ name: 'Escalated',capabilities: ['roles.define'] })).statusCode).toBe(403);
    expect((await http(f.root.token,'roles','POST',{ name: 'Reserved',capabilities: ['roles.define'] })).statusCode).toBe(403);
    expect((await http(f.root.token,'roles','POST',{ name: 'Unknown',capabilities: ['*'] })).statusCode).toBe(400);
    await expect(f.database.pool.query('insert into role_capabilities(role_id,capability_key) values($1,$2)',[role.id,'grants.manage'])).rejects.toThrow();
    await f.service.save(f.root.token,'roles',{ expectedVersion: 2,value: { name: 'SYSTEM Superadmin administrator',capabilities: [] } },role.id);
    expect((await http(user.token,'branches')).statusCode).toBe(403);
  });
  it('delegated admins cannot grant foreign scope, privileged roles, sensitive grants, or edit themselves/partly inaccessible staff', async () => {
    const admin = await f.staff([templateRoles.admin],[f.a.id]);
    const teacher = await f.staff([templateRoles.teacher],[f.a.id],[f.classes[0].id],'CLASSROOM');
    await f.service.delegateOrGrant(f.root.token,admin.id,'delegation',{ expectedVersion: 2,roleIds: [templateRoles.teacher] });
    const base = { expectedVersion: 2,roleIds: [templateRoles.teacher],branchIds: [f.a.id],classroomIds: [f.classes[1].id],scopeMode: 'CLASSROOM' };
    expect((await http(admin.token,`staff/${teacher.id}/assignments`,'PUT',base)).statusCode).toBe(200);
    for (const input of [{ ...base,expectedVersion: 3,branchIds: [f.b.id],classroomIds: [f.classes[3].id] },{ ...base,expectedVersion: 3,roleIds: [templateRoles.admin] },{ ...base,expectedVersion: 3,sensitiveFinancialEdit: true }]) expect((await http(admin.token,`staff/${teacher.id}/assignments`,'PUT',input)).statusCode).toBe('sensitiveFinancialEdit' in input ? 400 : 403);
    expect((await http(admin.token,`staff/${admin.id}/assignments`,'PUT',base)).statusCode).toBe(403);
    expect((await http(admin.token,`staff/${teacher.id}/grant`,'PUT',{ expectedVersion: 3,sensitiveFinancialEdit: true })).statusCode).toBe(403);
    expect((await http(admin.token,`staff/${teacher.id}/delegation`,'PUT',{ expectedVersion: 3,roleIds: [templateRoles.admin] })).statusCode).toBe(403);
    const other = await f.staff([templateRoles.teacher],[f.a.id,f.b.id]);
    expect((await http(admin.token,'staff')).json().data.items.some((s: { id: string }) => s.id === other.id)).toBe(false);
    expect((await http(admin.token,`staff/${other.id}/assignments`,'PUT',base)).statusCode).toBe(403);
    const privileged = await f.service.save(f.root.token,'roles',{ name: 'Future correction',capabilities: ['finance.correct'] });
    await f.service.delegateOrGrant(f.root.token,admin.id,'delegation',{ expectedVersion: 3,roleIds: [templateRoles.teacher,privileged.id] });
    expect((await f.service.context(admin.token)).assignableRoles.map((r) => r.id)).toEqual([templateRoles.teacher]);
    expect((await http(admin.token,`staff/${teacher.id}/assignments`,'PUT',{ ...base,expectedVersion: 3,roleIds: [privileged.id] })).statusCode).toBe(403);
  });
  it('live sessions lose old scope; multi-branch union and immutable original audit ownership remain correct', async () => {
    const manager = await f.staff([templateRoles.manager],[f.a.id,f.b.id]);
    expect((await http(manager.token,'branches')).json().data.total).toBe(2);
    expect((await http(manager.token,`classrooms?branchId=${f.b.id}`)).json().data.total).toBe(1);
    await f.service.save(manager.token,'classrooms',{ expectedVersion: 1,value: { code: 'CLASS1',name: 'Class 1',branchId: f.a.id,ageGroupId: null,capacity: 1 } },f.classes[0].id);
    const audit = (await f.database.pool.query('select * from policy_audit_events where actor_id=$1',[manager.id])).rows;
    await f.service.assign(f.root.token,manager.id,{ expectedVersion: 2,roleIds: [templateRoles.manager],branchIds: [f.b.id],classroomIds: [],scopeMode: 'BRANCH' });
    expect((await http(manager.token,`classrooms/${f.classes[0].id}`)).statusCode).toBe(403);
    expect((await http(manager.token,'branches')).json().data.items.map((b: { id: string }) => b.id)).toEqual([f.b.id]);
    expect((await f.app.auth.assertSessionActive(manager.token)).scope?.branchIds).toEqual([f.b.id]);
    expect((await f.database.pool.query('select * from policy_audit_events where actor_id=$1',[manager.id])).rows).toEqual(audit);
    expect(audit[0].branch_id).toBe(f.a.id);
    expect(capacityWarnings(1,2)).toEqual(['CAPACITY_EXCEEDED']);
    expect((await f.service.detail(f.root.token,'classrooms',f.classes[0].id))).toMatchObject({ capacity: 1 });
  });
  it('assignment and audit roll back together; stale/concurrent writers cannot overwrite each other', async () => {
    const user = await f.staff([templateRoles.teacher],[f.a.id],[f.classes[0].id],'CLASSROOM'); const before = await assignment(user.id);
    const input = { expectedVersion: 2,roleIds: before.roleIds,branchIds: [f.b.id],classroomIds: [f.classes[3].id],scopeMode: 'CLASSROOM' };
    await f.database.pool.query("alter table policy_audit_events add constraint test_policy_audit_failure check(event <> 'staff.assigned') not valid");
    try { await expect(f.service.assign(f.root.token,user.id,input)).rejects.toThrow(); expect(await assignment(user.id)).toEqual(before); }
    finally { await f.database.pool.query('alter table policy_audit_events drop constraint test_policy_audit_failure'); }
    const results = await Promise.allSettled([f.service.assign(f.root.token,user.id,input),f.service.assign(f.root.token,user.id,input)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
  });
  it('scope revocation waits for an in-flight protected transaction and denies subsequent work', async () => {
    const user = await f.staff([templateRoles.manager],[f.a.id]);
    let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void; const ready = new Promise<void>((resolve) => { started = resolve; });
    const first = f.service.withResource(user.token,'organization.manage',async () => ({ branchId: f.a.id }),async () => { started(); await held; return 'committed-before-revocation'; });
    await ready;
    let finished = false;
    const removal = f.service.assign(f.root.token,user.id,{ expectedVersion: 2,roleIds: [templateRoles.manager],branchIds: [f.b.id],classroomIds: [],scopeMode: 'BRANCH' }).then(() => { finished = true; });
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = Boolean((await f.database.pool.query("select 1 from pg_locks where locktype='advisory' and objid=7190401 and not granted")).rowCount);
        if (!waiting) await new Promise((resolve) => setTimeout(resolve,10));
      }
      expect(waiting).toBe(true); expect(finished).toBe(false);
    } finally { release(); }
    expect(await first).toBe('committed-before-revocation'); await removal;
    await expect(f.service.withResource(user.token,'organization.manage',async () => ({ branchId: f.a.id }),async () => 'forbidden')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('sensitive access requires capability, explicit SYSTEM grant, and scope; guardians fail closed; support is audited', async () => {
    const role = await f.service.save(f.root.token,'roles',{ name: 'Scoped financial permission fixture',capabilities: ['organization.read','finance.correct'] });
    const staff = await f.staff([role.id],[f.a.id]);
    const check = (branchId: string) => f.service.withPolicy(staff.token,async (_tx,p) => { requireSensitiveCorrection(p,{ branchId }); });
    await expect(check(f.a.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.service.delegateOrGrant(f.root.token,staff.id,'grant',{ expectedVersion: 2,sensitiveFinancialEdit: true });
    await expect(check(f.a.id)).resolves.toBeUndefined(); await expect(check(f.b.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const guardian = await f.account('GUARDIAN'); const signed = await f.app.auth.login(guardian.username,guardian.password);
    expect((await http(signed.token,'branches')).statusCode).toBe(403); expect(() => requireGuardianLink()).toThrow();
    await expect(f.service.supportAccess(staff.token,'fixture support',async () => 'secret')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await f.service.supportAccess(f.root.token,'fixture support',async () => 'audited')).toBe('audited');
    expect((await f.database.pool.query("select count(*)::int as count from policy_audit_events where event='support.access'")).rows[0].count).toBe(1);
  });
  it('branch creation assigns only that new branch; bounded multi-selection reaches policy validation',async () => {
    const manager = await f.staff([templateRoles.manager],[f.a.id]);
    const created = await http(manager.token,'branches','POST',{ code: 'NEW-BRANCH',name: 'New branch' }); expect(created.statusCode).toBe(201);
    const branches = (await f.service.context(manager.token)).branches.map((b) => b.id);
    expect(branches.sort()).toEqual([f.a.id,created.json().data.id].sort()); expect(branches).not.toContain(f.b.id);
    const target = await f.staff([templateRoles.teacher],[f.a.id]);
    const ids = () => Array.from({ length: 100 },() => crypto.randomUUID());
    const payload = { expectedVersion: 2,roleIds: ids(),branchIds: ids(),classroomIds: ids(),scopeMode: 'CLASSROOM' };
    expect(JSON.stringify(payload).length).toBeGreaterThan(8192);
    expect((await http(f.root.token,`staff/${target.id}/assignments`,'PUT',payload)).statusCode).toBe(403);
  });
});
