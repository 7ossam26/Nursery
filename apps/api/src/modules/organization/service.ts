import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { branchInputSchema, classroomInputSchema, ageGroupInputSchema, roleInputSchema, assignmentInputSchema, delegationInputSchema, grantInputSchema, listQuerySchema, versionSchema, type Branch, type Classroom, type AgeGroup, type Role, type StaffAssignment, type Capability } from '@nursery/contracts';
import type { AuthService } from '../auth/service.js';
import { denied, stale, loadPolicy, requireCapability, requireBranch, requireRecord, queryScope, type Policy } from './policy.js';
import { SafeError } from '../../errors.js';

const uuid = z.uuid();
type Catalog = 'branches' | 'classrooms' | 'age-groups' | 'roles';
const tables = { branches: 'branches', classrooms: 'classrooms', 'age-groups': 'age_groups', roles: 'roles' } as const;
const projections = {
  branches: 'id,code,name,version',
  classrooms: 'id,code,name,version,branch_id as "branchId",age_group_id as "ageGroupId",capacity',
  'age-groups': 'id,code,name,version,min_months as "minMonths",max_months as "maxMonths"',
  roles: 'r.id,r.name,r.version,array(select capability_key from role_capabilities where role_id=r.id order by capability_key) as capabilities'
};
const staffProjection = `a.id,a.username_normalized as username,a.assignment_version as version,a.scope_mode as "scopeMode",
  array(select role_id from account_roles where account_id=a.id order by role_id) as "roleIds",
  array(select branch_id from account_branches where account_id=a.id order by branch_id) as "branchIds",
  array(select classroom_id from teacher_classrooms where account_id=a.id order by classroom_id) as "classroomIds",
  array(select role_id from delegated_assignable_roles where account_id=a.id order by role_id) as "delegatedRoleIds",
  coalesce((select sensitive_financial_edit from sensitive_grants where account_id=a.id),false) as "sensitiveFinancialEdit"`;

export class OrganizationService {
  constructor(readonly auth: AuthService) {}
  // Every domain entry point repeats session validation inside the same transaction as policy/data.
  // Shared reads/business work and exclusive policy edits linearize scope changes across API processes.
  async withPolicy<T>(token: string, work: (tx: Transaction, policy: Policy) => Promise<T>, options: { edit?: boolean; targetIds?: string[] } = {}): Promise<T> {
    try {
      return await this.auth.database.transaction(async (tx) => {
        await tx.query(options.edit ? 'select pg_advisory_xact_lock(7190401)' : 'select pg_advisory_xact_lock_shared(7190401)');
        const account = await this.auth.inTransaction(tx, token, options.targetIds);
        return work(tx, await loadPolicy(tx, account));
      });
    } catch (error) {
      if (['23505', '23503', '23514'].includes((error as { code?: string }).code ?? '')) throw new SafeError('VALIDATION_ERROR', 'organization.conflict', false, 409);
      throw error;
    }
  }
  private async audit(tx: Transaction, p: Policy, event: string, targetId: string | null, before: unknown, after: unknown, branchId: string | null = null) {
    await tx.query('insert into policy_audit_events(id,actor_id,event,target_id,branch_id,before_data,after_data) values($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), p.account.id, event, targetId, branchId, JSON.stringify(before), JSON.stringify(after)]);
  }
  private async changed(tx: Transaction) {
    const version = (await tx.query<{ version: number }>('update policy_revision set version=version+1 returning version')).rows[0].version;
    await tx.query("select pg_notify('policy_changed',$1)", [String(version)]);
  }
  private requireManager(p: Policy) {
    requireCapability(p, 'organization.manage');
    if (p.account.kind !== 'SYSTEM' && (p.scope.mode !== 'BRANCH' || !p.scope.branchIds.length)) throw denied();
  }
  private async roles(tx: Transaction): Promise<Role[]> { return (await tx.query<Role>(`select ${projections.roles} from roles r order by r.name,r.id`)).rows; }
  private async staff(tx: Transaction, id: string): Promise<StaffAssignment> {
    const row = (await tx.query<StaffAssignment>(`select ${staffProjection} from accounts a where a.id=$1 and a.kind='STAFF'`, [id])).rows[0];
    if (!row) throw denied();
    return row;
  }
  async assignable(tx: Transaction, p: Policy): Promise<Role[]> {
    const roles = await this.roles(tx);
    if (p.account.kind === 'SYSTEM') return roles;
    const delegated = (await tx.query<{ role_id: string }>('select role_id from delegated_assignable_roles where account_id=$1', [p.account.id])).rows.map((r) => r.role_id);
    return roles.filter((r) => delegated.includes(r.id) && r.capabilities.every((c) => p.account.capabilities.includes(c)));
  }
  private canManageStaff(p: Policy, target: StaffAssignment, assignable: Role[]) {
    if (p.account.kind === 'SYSTEM') return true;
    return p.scope.mode === 'BRANCH' && target.id !== p.account.id && !target.sensitiveFinancialEdit && target.branchIds.length > 0 &&
      target.branchIds.every((id) => p.scope.branchIds.includes(id)) && target.roleIds.every((id) => assignable.some((r) => r.id === id));
  }
  async context(token: string) {
    return this.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'organization.read');
      const branchScope = queryScope(p, 'organization.read', 'branch');
      const classScope = queryScope(p, 'organization.read', 'classroom');
      return { account: p.account,
        branches: (await tx.query<Branch>(`select ${projections.branches} from branches b where ${branchScope.sql} order by code`, branchScope.values)).rows,
        classrooms: (await tx.query<Classroom>(`select ${projections.classrooms} from classrooms c where ${classScope.sql} order by code,id`, classScope.values)).rows,
        ageGroups: (await tx.query<AgeGroup>(`select ${projections['age-groups']} from age_groups order by code`)).rows,
        assignableRoles: p.account.capabilities.includes('users.assign_roles') ? await this.assignable(tx, p) : [],
        capabilities: p.account.kind === 'SYSTEM' ? (await tx.query<{ key: Capability; reserved: boolean }>('select key,reserved from capabilities order by key')).rows : [] };
    });
  }
  async list(token: string, catalog: Catalog, raw: unknown) {
    const input = listQuerySchema.parse(raw);
    return this.withPolicy(token, async (tx, p) => {
      if (catalog === 'roles') { requireCapability(p, 'roles.define'); const all = await this.roles(tx); return { items: all.slice(input.offset, input.offset + input.limit), total: all.length }; }
      if (catalog === 'age-groups') { requireCapability(p, 'organization.read'); return { items: (await tx.query<AgeGroup>(`select ${projections[catalog]} from age_groups order by code limit $1 offset $2`, [input.limit,input.offset])).rows, total: (await tx.query<{ total: number }>('select count(*)::int as total from age_groups')).rows[0].total }; }
      const scope = queryScope(p, 'organization.read', catalog === 'branches' ? 'branch' : 'classroom', input.branchId);
      const from = catalog === 'branches' ? 'branches b' : 'classrooms c'; const n = scope.values.length;
      const items = (await tx.query<Branch | Classroom>(`select ${projections[catalog]} from ${from} where ${scope.sql} order by code,id limit $${n + 1} offset $${n + 2}`, [...scope.values, input.limit, input.offset])).rows;
      const total = (await tx.query<{ total: number }>(`select count(*)::int as total from ${from} where ${scope.sql}`, scope.values)).rows[0].total;
      return { items, total };
    });
  }
  async detail(token: string, catalog: 'branches' | 'classrooms', id: string) {
    uuid.parse(id);
    return this.withPolicy(token, async (tx, p) => {
      const record = (await tx.query<Branch | Classroom>(`select ${projections[catalog]} from ${tables[catalog]} where id=$1`, [id])).rows[0];
      if (!record) throw denied();
      if (catalog === 'classrooms') requireRecord(p, 'organization.read', { branchId: (record as Classroom).branchId, classroomId: id });
      else { requireCapability(p, 'organization.read'); requireBranch(p, id); }
      return record;
    });
  }
  async save(token: string, catalog: Catalog, raw: unknown, id?: string) {
    if (id) uuid.parse(id);
    const envelope = z.object({ expectedVersion: versionSchema, value: z.unknown() }).strict();
    const update = id ? envelope.parse(raw) : undefined;
    const schemas = { branches: branchInputSchema, classrooms: classroomInputSchema, 'age-groups': ageGroupInputSchema, roles: roleInputSchema };
    const input = schemas[catalog].parse(update ? update.value : raw);
    return this.withPolicy(token, async (tx, p) => {
      if (catalog === 'roles') requireCapability(p, 'roles.define'); else this.requireManager(p);
      const table = tables[catalog];
      const before = id ? (await tx.query(`select * from ${table} where id=$1`, [id])).rows[0] : null;
      if (id && !before) throw denied();
      if (catalog === 'branches' && id) requireBranch(p, id);
      if (catalog === 'age-groups' && id && p.account.kind !== 'SYSTEM') throw denied();
      if (catalog === 'classrooms') {
        const value = classroomInputSchema.parse(input); requireRecord(p, 'organization.manage', { branchId: value.branchId, classroomId: id });
        // Classroom identity and historical branch attribution never move. Move staff assignments instead.
        if (before && before.branch_id !== value.branchId) throw new SafeError('VALIDATION_ERROR', 'organization.fixedBranch', false, 400);
      }
      if (before && before.version !== update!.expectedVersion) throw stale();
      const targetId = id ?? randomUUID();
      let fields: string[]; let values: unknown[];
      if (catalog === 'roles') {
        const value = roleInputSchema.parse(input);
        const reserved = await tx.query('select 1 from capabilities where key=any($1::text[]) and reserved', [value.capabilities]);
        if (reserved.rowCount) throw denied();
        fields = ['name']; values = [value.name];
        if (before) before.capabilities = (await tx.query('select capability_key from role_capabilities where role_id=$1 order by capability_key', [targetId])).rows.map((r) => r.capability_key);
      } else if (catalog === 'classrooms') { const v = classroomInputSchema.parse(input); fields = ['code','name','branch_id','age_group_id','capacity']; values = [v.code,v.name,v.branchId,v.ageGroupId,v.capacity]; }
      else if (catalog === 'age-groups') { const v = ageGroupInputSchema.parse(input); fields = ['code','name','min_months','max_months']; values = [v.code,v.name,v.minMonths,v.maxMonths]; }
      else { const v = branchInputSchema.parse(input); fields = ['code','name']; values = [v.code,v.name]; }
      if (id) await tx.query(`update ${table} set ${fields.map((f,i) => `${f}=$${i+2}`).join(',')},version=version+1 where id=$1`, [targetId,...values]);
      else await tx.query(`insert into ${table}(id,${fields.join(',')}) values($1,${fields.map((_,i) => `$${i+2}`).join(',')})`, [targetId,...values]);
      if (catalog === 'roles') {
        await tx.query('delete from role_capabilities where role_id=$1', [targetId]);
        for (const key of roleInputSchema.parse(input).capabilities) await tx.query('insert into role_capabilities(role_id,capability_key) values($1,$2)', [targetId,key]);
      }
      if (catalog === 'branches' && !id && p.account.kind !== 'SYSTEM') {
        await tx.query('insert into account_branches(account_id,branch_id) values($1,$2)', [p.account.id,targetId]);
        await tx.query('update accounts set assignment_version=assignment_version+1 where id=$1', [p.account.id]);
      }
      const branchId = catalog === 'branches' ? targetId : catalog === 'classrooms' ? classroomInputSchema.parse(input).branchId : null;
      await this.audit(tx,p,`${catalog}.${id ? 'updated' : 'created'}`,targetId,before,input,branchId);
      await this.changed(tx);
      return { id: targetId, version: before ? before.version + 1 : 1 };
    }, { edit: true });
  }
  async staffList(token: string, raw: unknown) {
    const input = listQuerySchema.parse(raw);
    return this.withPolicy(token, async (tx,p) => {
      requireCapability(p,'users.assign_roles');
      if (input.branchId) requireBranch(p,input.branchId);
      const roles = await this.assignable(tx,p);
      const all = (await tx.query<StaffAssignment>(`select ${staffProjection} from accounts a where kind='STAFF' order by username_normalized,id`)).rows
        .filter((target) => this.canManageStaff(p,target,roles) && (!input.branchId || target.branchIds.includes(input.branchId)));
      return { items: all.slice(input.offset,input.offset + input.limit), total: all.length };
    });
  }
  async assign(token: string, id: string, raw: unknown) {
    uuid.parse(id); const input = assignmentInputSchema.parse(raw);
    return this.withPolicy(token, (tx,p) => this.assignInTransaction(tx,p,id,input), { edit: true, targetIds: [id] });
  }
  // Shared by the staff screen and bulk employee-login imports; the caller must hold the exclusive policy lock (7190401).
  async assignInTransaction(tx: Transaction, p: Policy, id: string, raw: unknown) {
    const input = assignmentInputSchema.parse(raw);
    requireCapability(p,'users.assign_roles');
      const target = await this.staff(tx,id); const roles = await this.assignable(tx,p);
      if (!this.canManageStaff(p,target,roles) || !input.roleIds.every((roleId) => roles.some((r) => r.id === roleId))) throw denied();
      for (const branchId of input.branchIds) requireBranch(p,branchId);
      if (target.version !== input.expectedVersion) throw stale();
      const classrooms = (await tx.query<{ id: string; branch_id: string }>('select id,branch_id from classrooms where id=any($1::uuid[])', [input.classroomIds])).rows;
      if (classrooms.length !== input.classroomIds.length || classrooms.some((c) => !input.branchIds.includes(c.branch_id))) throw denied();
      await tx.query('delete from teacher_classrooms where account_id=$1', [id]);
      await tx.query('delete from account_branches where account_id=$1', [id]);
      await tx.query('delete from account_roles where account_id=$1', [id]);
      for (const branchId of input.branchIds) await tx.query('insert into account_branches(account_id,branch_id) values($1,$2)', [id,branchId]);
      for (const roleId of input.roleIds) await tx.query('insert into account_roles(account_id,role_id) values($1,$2)', [id,roleId]);
      for (const classroom of classrooms) await tx.query('insert into teacher_classrooms(account_id,classroom_id,branch_id) values($1,$2,$3)', [id,classroom.id,classroom.branch_id]);
      await tx.query('update accounts set scope_mode=$2,assignment_version=assignment_version+1 where id=$1', [id,input.scopeMode]);
      await this.audit(tx,p,'staff.assigned',id,target,input); await this.changed(tx);
      return { version: target.version + 1 };
  }
  async delegateOrGrant(token: string, id: string, kind: 'delegation' | 'grant', raw: unknown) {
    uuid.parse(id); const input = kind === 'delegation' ? delegationInputSchema.parse(raw) : grantInputSchema.parse(raw);
    return this.withPolicy(token, async (tx,p) => {
      requireCapability(p,kind === 'delegation' ? 'roles.define' : 'grants.manage');
      const target = await this.staff(tx,id);
      if (target.version !== input.expectedVersion) throw stale();
      if ('roleIds' in input) {
        await tx.query('delete from delegated_assignable_roles where account_id=$1', [id]);
        for (const roleId of input.roleIds) await tx.query('insert into delegated_assignable_roles(account_id,role_id) values($1,$2)', [id,roleId]);
      } else await tx.query('insert into sensitive_grants(account_id,sensitive_financial_edit) values($1,$2) on conflict(account_id) do update set sensitive_financial_edit=excluded.sensitive_financial_edit', [id,input.sensitiveFinancialEdit]);
      await tx.query('update accounts set assignment_version=assignment_version+1 where id=$1', [id]);
      await this.audit(tx,p,`staff.${kind}`,id,target,input); await this.changed(tx);
      return { version: target.version + 1 };
    }, { edit: true, targetIds: [id] });
  }
  // Files/exports must resolve stored ownership inside this callback and deliver only after this fresh check.
  async withResource<T>(token: string, capability: Capability, resolve: (tx: Transaction) => Promise<{ branchId: string; classroomId?: string; childId?: string }>, read: (tx: Transaction) => Promise<T>) {
    return this.withPolicy(token, async (tx,p) => { requireRecord(p,capability,await resolve(tx)); return read(tx); });
  }
  async supportAccess<T>(token: string, reason: string, read: (tx: Transaction) => Promise<T>) {
    const safeReason = z.string().trim().min(1).max(500).parse(reason);
    return this.withPolicy(token, async (tx,p) => { requireCapability(p,'support.access'); const result = await read(tx); await this.audit(tx,p,'support.access',null,null,{ reason: safeReason }); return result; });
  }
}
