import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import { onboardingInputSchema, childUpdateSchema, lifecycleInputSchema, classroomMoveSchema, guardianLinkInputSchema, guardianUpdateSchema, childListQuerySchema, guardianListQuerySchema, capacityWarnings,
  type Child, type ChildDetail, type ChildDocument, type ChildrenOptions, type GuardianOption, type GuardianLink, type GuardianChild, type GuardianChildDetail, type OnboardingResult, type Capability, type OnboardingInput } from '@nursery/contracts';
import type { LicensingService } from '../licensing/service.js';
import { denied, stale, requireCapability, requireRecord, loadPolicy, type Policy } from '../organization/policy.js';
import { childProjection, GUARDIAN_SCOPE_LOCK, requireChild, requireGuardianChild, resolveChild, staffChildScope } from './policy.js';
import { SafeError } from '../../errors.js';
const uuid = z.uuid();
const invalid = () => new SafeError('VALIDATION_ERROR','children.invalid',false,400);

export class ChildService {
  constructor(readonly licensing: LicensingService) {}
  async withPolicy<T>(token: string, work: (tx: Transaction,p: Policy) => Promise<T>, targets: string[] = [], changesGuardianScope = false): Promise<T> {
    try {
      return await this.licensing.auth.database.transaction(async (tx) => {
        // Same global lock order as licensing parent actions: license, organization, guardian links, accounts, sessions, children.
        await tx.query('select pg_advisory_xact_lock_shared(7190501)');
        await tx.query('select pg_advisory_xact_lock_shared(7190401)');
        await tx.query(changesGuardianScope ? 'select pg_advisory_xact_lock($1)' : 'select pg_advisory_xact_lock_shared($1)',[GUARDIAN_SCOPE_LOCK]);
        const account = await this.licensing.auth.inTransaction(tx,token,targets);
        return work(tx,await loadPolicy(tx,account));
      });
    } catch (error) {
      if (['23505','23503','23514'].includes((error as { code?: string }).code ?? '')) throw new SafeError('VALIDATION_ERROR','children.conflict',false,409);
      throw error;
    }
  }
  async audit(tx: Transaction,p: Policy,child: Child | null,event: string,before: unknown,after: unknown) {
    await tx.query('insert into child_audit_events(id,child_id,actor_id,branch_id,event,before_data,after_data) values($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),child?.id ?? null,p.account.id,child?.branchId ?? null,event,JSON.stringify(before),JSON.stringify(after)]);
  }
  private checkDate(date: string) { if (date > cairoIsoDate()) throw invalid(); }
  private async contacts(tx: Transaction,id: string,contacts: OnboardingInput['children'][number]['child']['contacts']) {
    await tx.query('delete from child_contacts where child_id=$1',[id]);
    for (const c of contacts) await tx.query('insert into child_contacts(id,child_id,full_name,mobile,relationship) values($1,$2,$3,$4,$5)',[randomUUID(),id,c.fullName,c.mobile,c.relationship]);
  }
  private async placement(tx: Transaction,p: Policy,branchId: string,classroomId: string | null,capability: Capability,excludeChild?: string) {
    requireRecord(p,capability,{ branchId,classroomId: classroomId ?? undefined });
    if (!(await tx.query('select id from branches where id=$1',[branchId])).rowCount) throw denied();
    if (!classroomId) return [];
    const classroom = (await tx.query<{ capacity: number; branch_id: string }>('select capacity,branch_id from classrooms where id=$1',[classroomId])).rows[0];
    if (!classroom || classroom.branch_id !== branchId) throw denied();
    const count = (await tx.query<{ count: number }>("select count(*)::int as count from children where classroom_id=$1 and status='ACTIVE' and ($2::uuid is null or id<>$2)",[classroomId,excludeChild ?? null])).rows[0].count;
    return capacityWarnings(classroom.capacity,count+1);
  }
  async options(token: string): Promise<ChildrenOptions> {
    return this.withPolicy(token,async (tx,p) => {
      const scope = staffChildScope(p,'children.read');
      return { capabilities: p.account.capabilities,
        branches: (await tx.query<{ id: string; code: string; name: string }>('select id,code,name from branches where ($1::boolean or id=any($2::uuid[])) order by code',scope.values.slice(0,2))).rows,
        classrooms: (await tx.query<ChildrenOptions['classrooms'][number]>(`select c.id,c.branch_id as "branchId",c.name,c.capacity,
          (select count(*)::int from children ch where ch.classroom_id=c.id and ch.status='ACTIVE') as occupancy
          from classrooms c where ${scope.sql.replaceAll('c.classroom_id','c.id')} order by c.name,c.id`,scope.values)).rows,
        integration: { finance: { enabled: Boolean((await tx.query<{ enabled: boolean }>("select enabled from module_settings where module_key='FINANCE'")).rows[0]?.enabled),implemented: true },transport: { enabled:Boolean((await tx.query<{enabled:boolean}>("select enabled from module_settings where module_key='TRANSPORT'")).rows[0]?.enabled),implemented:true },activities:{enabled:Boolean((await tx.query<{enabled:boolean}>("select enabled from module_settings where module_key='ACTIVITIES'")).rows[0]?.enabled),implemented:true},availableSteps: ['accounts','children','documents','finance','transport'] } };
    });
  }
  async list(token: string,raw: unknown) {
    const input = childListQuerySchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const scope = staffChildScope(p,'children.read');
      if (input.branchId) requireRecord(p,'children.read',{ branchId: input.branchId,classroomId: input.classroomId });
      if (input.classroomId) {
        const c = (await tx.query<{ branch_id: string }>('select branch_id from classrooms where id=$1',[input.classroomId])).rows[0];
        if (!c) throw denied(); requireRecord(p,'children.read',{ branchId: c.branch_id,classroomId: input.classroomId });
      }
      const predicate = `${scope.sql} and ($5::uuid is null or c.branch_id=$5) and ($6::uuid is null or c.classroom_id=$6) and ($7::text is null or c.status=$7)
        and (strpos(lower(c.full_name),lower($8))>0 or strpos(lower(c.code),lower($8))>0)`;
      const values = [...scope.values,input.branchId ?? null,input.classroomId ?? null,input.status ?? null,input.search];
      const result = (await tx.query<{ items: Child[]; total: number }>(`with visible as (select ${childProjection} from children c where ${predicate})
        select (select count(*)::int from visible) as total,coalesce((select json_agg(page) from (select * from visible order by "fullName",id limit $9 offset $10) page),'[]'::json) as items`,[...values,input.limit,input.offset])).rows[0];
      return result;
    });
  }
  async detailInTransaction(tx: Transaction,p: Policy,id: string): Promise<ChildDetail> {
    const child = await resolveChild(tx,id); requireChild(p,'children.read',child);
    const canGuardians = p.account.capabilities.includes('guardians.manage');
    return { child,
      contacts: (await tx.query<ChildDetail['contacts'][number]>('select full_name as "fullName",mobile,relationship from child_contacts where child_id=$1 order by id',[id])).rows,
      guardians: !canGuardians ? [] : (await tx.query<GuardianLink>(`select a.id,a.username_normalized as username,g.full_name as "fullName",g.mobile,g.version,l.relationship,l.active,
        json_build_object('read',l.can_read,'finance',l.can_finance,'pickup',l.can_pickup,'notify',l.can_notify) as permissions
        from guardian_child_links l join guardian_profiles g on g.account_id=l.guardian_id join accounts a on a.id=g.account_id where l.child_id=$1 order by g.full_name`,[id])).rows,
      statusHistory: (await tx.query<ChildDetail['statusHistory'][number]>('select previous_status as "previousStatus",new_status as "newStatus",effective_on::text as "effectiveOn",reason,public_message as "publicMessage" from child_status_history where child_id=$1 order by created_at,id',[id])).rows,
      classroomHistory: (await tx.query<ChildDetail['classroomHistory'][number]>('select previous_classroom_id as "previousClassroomId",classroom_id as "classroomId",effective_on::text as "effectiveOn",reason from child_classroom_history where child_id=$1 order by created_at,id',[id])).rows,
      documents: !p.account.capabilities.includes('documents.manage') ? [] : await this.documents(tx,id) };
  }
  async detail(token: string,id: string) { uuid.parse(id); return this.withPolicy(token,(tx,p) => this.detailInTransaction(tx,p,id)); }
  async documents(tx: Transaction,id: string): Promise<ChildDocument[]> {
    return (await tx.query<ChildDocument>('select id,name,expires_on::text as "expiresOn",mime_type as "mimeType",byte_size as "byteSize" from child_documents where child_id=$1 and not retired order by name,id',[id])).rows;
  }
  private async accessibleGuardian(tx: Transaction,p: Policy,id: string) {
    const target = (await tx.query<{ kind: string; status: string }>('select kind,status from accounts where id=$1',[id])).rows[0];
    if (!target || target.kind !== 'GUARDIAN' || target.status === 'RELEASED' || !(await tx.query('select 1 from seat_reservations where account_id=$1 and released_at is null',[id])).rowCount) throw denied();
    if (p.account.kind === 'SYSTEM') return;
    const scope = staffChildScope(p,'guardians.manage');
    if (!(await tx.query(`select 1 from guardian_child_links l join children c on c.id=l.child_id where l.guardian_id=$5 and l.active and ${scope.sql} limit 1`,[...scope.values,id])).rowCount) throw denied();
  }
  async guardianOptions(token: string,raw: unknown) {
    const input = guardianListQuerySchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const scope = staffChildScope(p,'guardians.manage');
      const visible = `a.kind='GUARDIAN' and a.status<>'RELEASED' and exists(select 1 from seat_reservations s where s.account_id=a.id and s.released_at is null)
        and ($1::boolean or exists(select 1 from guardian_child_links l join children c on c.id=l.child_id where l.guardian_id=a.id and l.active and ${scope.sql}))
        and (strpos(lower(coalesce(g.full_name,a.username_normalized)),lower($5))>0 or strpos(a.username_normalized,lower($5))>0)`;
      return (await tx.query<{ total: number; items: GuardianOption[] }>(`with visible as (select a.id,a.username_normalized as username,coalesce(g.full_name,a.username_normalized) as "fullName",coalesce(g.mobile,'') as mobile,coalesce(g.version,1) as version
        from accounts a left join guardian_profiles g on g.account_id=a.id where ${visible}) select (select count(*)::int from visible) as total,
        coalesce((select json_agg(page) from (select * from visible order by "fullName",id limit $6 offset $7) page),'[]'::json) as items`,[...scope.values,input.search,input.limit,input.offset])).rows[0];
    });
  }
  async onboard(token: string,raw: unknown): Promise<OnboardingResult> {
    const input = onboardingInputSchema.parse(raw);
    const targets = input.guardians.flatMap((g) => g.kind === 'EXISTING' ? [g.accountId] : []);
    return this.withPolicy(token,(tx,p) => this.onboardInTransaction(tx,p,input),targets);
  }
  // Shared by interactive onboarding and bulk imports; the caller owns the license/policy/guardian locks and transaction.
  async onboardInTransaction(tx: Transaction,p: Policy,raw: unknown): Promise<OnboardingResult> {
    const input = onboardingInputSchema.parse(raw); const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    requireCapability(p,'children.manage'); requireCapability(p,'guardians.manage');
      const previous = (await tx.query<{ input_hash: string; child_ids: string[]; guardian_ids: string[] }>('select * from child_onboarding_operations where actor_id=$1 and operation_id=$2',[p.account.id,input.operationId])).rows[0];
      if (previous) {
        if (previous.input_hash !== hash) throw new SafeError('IDEMPOTENCY_CONFLICT','children.operationConflict',false,409);
        for (const id of [...previous.child_ids].sort()) requireChild(p,'children.manage',await resolveChild(tx,id));
        return { childIds: previous.child_ids,guardianIds: previous.guardian_ids,credentials: [],replayed: true,warnings: [] };
      }
      for (const c of input.children) { this.checkDate(c.child.birthDate); await this.placement(tx,p,c.child.branchId,c.child.classroomId,'children.manage'); }
      this.licensing.requireUsable(p);
      const credentials: OnboardingResult['credentials'] = []; const guardianIds: string[] = [];
      for (const guardian of input.guardians) {
        if (guardian.kind === 'NEW') {
          const account = await this.licensing.provisionInTransaction(tx,p,'users.create_parent','GUARDIAN','PARENT',{ username: guardian.username });
          credentials.push(account); guardianIds.push(account.id);
          await tx.query('insert into guardian_profiles(account_id,full_name,mobile) values($1,$2,$3)',[account.id,guardian.profile.fullName,guardian.profile.mobile]);
        } else {
          await this.accessibleGuardian(tx,p,guardian.accountId); guardianIds.push(guardian.accountId);
          const profile = (await tx.query('select 1 from guardian_profiles where account_id=$1',[guardian.accountId])).rowCount;
          if (!profile) {
            if (p.account.kind !== 'SYSTEM' || !guardian.profile) throw invalid();
            await tx.query('insert into guardian_profiles(account_id,full_name,mobile) values($1,$2,$3)',[guardian.accountId,guardian.profile.fullName,guardian.profile.mobile]);
          } else if (guardian.profile) throw invalid();
        }
      }
      if (new Set(guardianIds).size !== guardianIds.length) throw invalid();
      const childIds: string[] = []; const warnings: string[] = [];
      for (const c of input.children) {
        const v = c.child; const id = randomUUID(); childIds.push(id);
        warnings.push(...await this.placement(tx,p,v.branchId,v.classroomId,'children.manage'));
        await tx.query('insert into children(id,code,full_name,birth_date,branch_id,classroom_id) values($1,$2,$3,$4,$5,$6)',[id,v.code,v.fullName,v.birthDate,v.branchId,v.classroomId]);
        await this.contacts(tx,id,v.contacts);
        for (const link of c.links) await tx.query('insert into guardian_child_links(guardian_id,child_id,relationship,can_read,can_finance,can_pickup,can_notify) values($1,$2,$3,$4,$5,$6,$7)',[guardianIds[link.guardianIndex],id,link.relationship,link.permissions.read,link.permissions.finance,link.permissions.pickup,link.permissions.notify]);
        const child = await resolveChild(tx,id);
        await this.statusHistory(tx,p,child,null,'Onboarding'); await this.classroomHistory(tx,p,child,null,'Onboarding');
        await this.audit(tx,p,child,'child.onboarded',null,{ ...v,guardianIds: c.links.map((l) => guardianIds[l.guardianIndex]) });
      }
      await tx.query('insert into child_onboarding_operations(actor_id,operation_id,input_hash,child_ids,guardian_ids) values($1,$2,$3,$4,$5)',[p.account.id,input.operationId,hash,childIds,guardianIds]);
      return { childIds,guardianIds,credentials,replayed: false,warnings: [...new Set(warnings)] };
  }
  private async statusHistory(tx: Transaction,p: Policy,child: Child,previous: string | null,reason: string) {
    await tx.query('insert into child_status_history(id,child_id,actor_id,branch_id,previous_status,new_status,effective_on,reason,public_message,child_name_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),child.id,p.account.id,child.branchId,previous,child.status,cairoIsoDate(),reason,child.publicMessage,child.fullName]);
  }
  private async classroomHistory(tx: Transaction,p: Policy,child: Child,previous: string | null,reason: string) {
    await tx.query('insert into child_classroom_history(id,child_id,actor_id,branch_id,previous_classroom_id,classroom_id,effective_on,reason,child_name_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),child.id,p.account.id,child.branchId,previous,child.classroomId,cairoIsoDate(),reason,child.fullName]);
  }
  async update(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = childUpdateSchema.parse(raw); this.checkDate(input.birthDate);
    return this.withPolicy(token,async (tx,p) => {
      const child = await resolveChild(tx,id,true); requireChild(p,'children.manage',child); if (child.version !== input.expectedVersion) throw stale();
      const before = await this.detailInTransaction(tx,p,id);
      await tx.query('update children set full_name=$2,birth_date=$3,version=version+1 where id=$1',[id,input.fullName,input.birthDate]); await this.contacts(tx,id,input.contacts);
      await this.audit(tx,p,child,'child.updated',before,input); return { version: child.version+1 };
    });
  }
  async lifecycle(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = lifecycleInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await resolveChild(tx,id,true); requireChild(p,'children.manage',child); if (child.version !== input.expectedVersion) throw stale();
      if (child.status === 'ARCHIVED' || child.status === input.status) throw invalid();
      const next = { ...child,status: input.status,publicMessage: input.status === 'ACTIVE' ? null : input.publicMessage };
      const warnings = input.status === 'ACTIVE' ? await this.placement(tx,p,child.branchId,child.classroomId,'children.manage',id) : [];
      await tx.query('update children set status=$2,public_message=$3,version=version+1 where id=$1',[id,next.status,next.publicMessage]);
      await this.statusHistory(tx,p,next,child.status,input.reason); await this.audit(tx,p,child,'child.status_changed',child,input);
      await tx.query('insert into child_integration_events(id,child_id,kind,effective_on,payload) values($1,$2,$3,$4,$5)',[randomUUID(),id,input.status === 'ARCHIVED' ? 'child.archived' : 'child.status_changed',cairoIsoDate(),JSON.stringify({ previousStatus: child.status,status: input.status,feeAgreementAction: input.status === 'ARCHIVED' ? 'END_FUTURE_MONTHLY_GENERATION' : 'UNCHANGED' })]);
      return { version: child.version+1,warnings };
    });
  }
  async moveClassroom(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = classroomMoveSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await resolveChild(tx,id,true); requireChild(p,'children.manage',child); if (child.version !== input.expectedVersion) throw stale();
      if (child.status === 'ARCHIVED' || child.classroomId === input.classroomId) throw invalid();
      const warnings = await this.placement(tx,p,child.branchId,input.classroomId,'children.manage',id);
      await tx.query('update children set classroom_id=$2,version=version+1 where id=$1',[id,input.classroomId]);
      await this.classroomHistory(tx,p,{ ...child,classroomId: input.classroomId },child.classroomId,input.reason); await this.audit(tx,p,child,'child.classroom_changed',child,input);
      return { version: child.version+1,warnings: child.status === 'ACTIVE' ? warnings : [] };
    });
  }
  async linkGuardian(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = guardianLinkInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await resolveChild(tx,id,true); requireChild(p,'guardians.manage',child); if (child.version !== input.expectedChildVersion) throw stale();
      await this.accessibleGuardian(tx,p,input.accountId);
      if (!(await tx.query('select 1 from guardian_profiles where account_id=$1',[input.accountId])).rowCount) throw invalid();
      const before = (await tx.query('select * from guardian_child_links where guardian_id=$1 and child_id=$2',[input.accountId,id])).rows[0] ?? null;
      const v = input.permissions;
      await tx.query(`insert into guardian_child_links(guardian_id,child_id,relationship,can_read,can_finance,can_pickup,can_notify,active) values($1,$2,$3,$4,$5,$6,$7,$8)
        on conflict(guardian_id,child_id) do update set relationship=excluded.relationship,can_read=excluded.can_read,can_finance=excluded.can_finance,can_pickup=excluded.can_pickup,can_notify=excluded.can_notify,active=excluded.active,version=guardian_child_links.version+1`,[input.accountId,id,input.relationship,v.read,v.finance,v.pickup,v.notify,input.active]);
      await tx.query('update children set version=version+1 where id=$1',[id]); await this.audit(tx,p,child,'guardian.link_changed',before,input); return { version: child.version+1 };
    },[input.accountId]);
  }
  async guardianChildren(token: string): Promise<GuardianChild[]> {
    return this.withPolicy(token,async (tx,p) => {
      if (p.account.kind !== 'GUARDIAN') throw denied();
      return (await tx.query<GuardianChild>(`select c.id,c.full_name as "fullName",c.status,c.public_message as "publicMessage",
        json_build_object('read',l.can_read,'finance',l.can_finance,'pickup',l.can_pickup,'notify',l.can_notify) as permissions
        from children c join guardian_child_links l on l.child_id=c.id where l.guardian_id=$1 and l.active and l.can_read and c.status<>'ARCHIVED' order by c.full_name,c.id`,[p.account.id])).rows;
    });
  }
  async updateGuardian(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = guardianUpdateSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      requireCapability(p,'guardians.manage'); await this.accessibleGuardian(tx,p,id);
      const linked = (await tx.query<{ child_id: string }>('select child_id from guardian_child_links where guardian_id=$1 order by child_id',[id])).rows;
      for (const link of linked) requireChild(p,'guardians.manage',await resolveChild(tx,link.child_id));
      const before = (await tx.query<{ full_name: string; mobile: string; version: number }>('select full_name,mobile,version from guardian_profiles where account_id=$1 for update',[id])).rows[0];
      if (!before) throw denied(); if (before.version !== input.expectedVersion) throw stale();
      await tx.query('update guardian_profiles set full_name=$2,mobile=$3,version=version+1 where account_id=$1',[id,input.profile.fullName,input.profile.mobile]);
      await this.audit(tx,p,null,'guardian.profile_updated',{ id,...before },input); return { version: before.version+1 };
    },[id]);
  }
  async guardianDetail(token: string,id: string): Promise<GuardianChildDetail> {
    uuid.parse(id); return this.withPolicy(token,async (tx,p) => { const { child,permissions } = await requireGuardianChild(tx,p,id,'read'); return { child: { id: child.id,fullName: child.fullName,birthDate: child.birthDate,status: child.status },permissions }; });
  }
  async withGuardianResource<T>(token: string,id: string,permission: Parameters<typeof requireGuardianChild>[3],work: (tx: Transaction,child: Child) => Promise<T>): Promise<T> {
    uuid.parse(id); return this.withPolicy(token,async (tx,p) => { const { child } = await requireGuardianChild(tx,p,id,permission); return work(tx,child); });
  }
  async activeClassroomChild(tx: Transaction,p: Policy,id: string,capability: Capability) {
    const child = await resolveChild(tx,id); requireChild(p,capability,child);
    if (child.status !== 'ACTIVE' || !child.classroomId) throw denied(); return child;
  }
}
