import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import { builtInMeanings, builtInOutcomes, checkpointBatchSchema, checkpointCorrectionSchema, checkpointPublicationSchema, learningProgress, saveCheckpointConfigurationSchema,
  type Child, type CheckpointConfiguration, type CheckpointDefinition, type CheckpointPublication, type DailyLearning, type DailySlot, type LearningEvent, type ModuleKey } from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import type { ChildService } from '../children/service.js';
import { requireChild, requireGuardianChild, resolveChild, staffChildScope } from '../children/policy.js';
import { denied, requireCapability, requireRecord, stale, type Policy } from '../organization/policy.js';

const CONFIG_LOCK = 7190801;
const invalid = () => new SafeError('VALIDATION_ERROR','learning.invalid',false,400);
const off = () => new SafeError('MODULE_DISABLED','learning.disabled',false,403);
export const checkpointModule: Record<CheckpointDefinition['kind'],ModuleKey> = { ATTENDANCE: 'ATTENDANCE', EXAM: 'EXAMS', HOMEWORK: 'HOMEWORK', STATUS_NOTE: 'CUSTOM_CHECKPOINTS' };
type Snapshot = { id: string; configuration_id: string; branch_id: string; classroom_id: string };
const eventColumns = 'e.id,e.revision,e.previous_id as "previousId",e.action,e.status_id as "statusId",e.note,e.reason';
const ordered = <T extends { id: string; order: number }>(values: T[]) => [...values].sort((a,b) => a.order-b.order || a.id.localeCompare(b.id));
function fingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => [k,canonical(x)])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export class LearningService {
  constructor(readonly children: ChildService, readonly today: () => string = cairoIsoDate) {}
  async configurationInTransaction(tx: Transaction,date?: string): Promise<CheckpointConfiguration> {
    const c = (await tx.query<Omit<CheckpointConfiguration,'definitions'>>(`select id,version,effective_on::text as "effectiveOn" from checkpoint_configurations where ($1::date is null or effective_on <= $1) order by version desc limit 1`,[date ?? null])).rows[0];
    if (!c) throw invalid();
    const definitions = (await tx.query<{ definition: CheckpointDefinition }>('select definition from checkpoint_versions where configuration_id=$1',[c.id])).rows.map((r) => r.definition);
    return { ...c,definitions: ordered(definitions).map((d) => ({ ...d,statuses: ordered(d.statuses) })) };
  }
  async configuration(token: string) {
    return this.children.withPolicy(token,async (tx,p) => { requireCapability(p,'learning.configure'); return this.configurationInTransaction(tx); });
  }
  async saveConfiguration(token: string,raw: unknown) {
    const input = saveCheckpointConfigurationSchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      requireCapability(p,'learning.configure'); if (p.account.kind !== 'SYSTEM') throw denied();
      await tx.query('select pg_advisory_xact_lock($1)',[CONFIG_LOCK]);
      const previous = await this.configurationInTransaction(tx); if (previous.version !== input.expectedVersion) throw stale();
      // Stable IDs retire through enabled=false; identities/meanings can never be repurposed.
      for (const old of previous.definitions) {
        const next = input.definitions.find((d) => d.id === old.id);
        if (!next || next.kind !== old.kind || old.statuses.some((s) => !next.statuses.some((n) => n.id === s.id && n.meaning === s.meaning && n.outcome === s.outcome))) throw invalid();
      }
      for (const d of input.definitions) {
        if (!previous.definitions.some((old) => old.id === d.id) && d.kind !== 'STATUS_NOTE') throw invalid();
        const outcomes: string[] = builtInOutcomes[d.kind];
        if (d.statuses.some((s) => d.kind === 'STATUS_NOTE' ? s.outcome !== null : s.outcome !== null && (!outcomes.includes(s.outcome) || builtInMeanings[s.outcome] !== s.meaning))) throw invalid();
        if (outcomes.some((o) => d.statuses.filter((s) => s.outcome === o).length !== 1 || !d.statuses.find((s) => s.outcome === o)!.enabled)) throw invalid();
      }
      const effectiveOn = new Date(`${this.today()}T12:00:00Z`); effectiveOn.setUTCDate(effectiveOn.getUTCDate()+1);
      const id = randomUUID();
      await tx.query('insert into checkpoint_configurations(id,version,effective_on,actor_id) values($1,$2,$3,$4)',[id,previous.version+1,effectiveOn.toISOString().slice(0,10),p.account.id]);
      for (const d of input.definitions) {
        await tx.query('insert into checkpoint_definitions(id,kind) values($1,$2) on conflict do nothing',[d.id,d.kind]);
        await tx.query('insert into checkpoint_versions(configuration_id,definition_id,definition) values($1,$2,$3)',[id,d.id,JSON.stringify(d)]);
        for (const s of d.statuses) {
          await tx.query('insert into checkpoint_statuses(definition_id,id,meaning,outcome) values($1,$2,$3,$4) on conflict do nothing',[d.id,s.id,s.meaning,s.outcome]);
          await tx.query('insert into checkpoint_status_versions(configuration_id,definition_id,status_id,status) values($1,$2,$3,$4)',[id,d.id,s.id,JSON.stringify(s)]);
        }
      }
      await this.children.audit(tx,p,null,'learning.configuration',previous,{ id,version: previous.version+1,effectiveOn: effectiveOn.toISOString().slice(0,10),definitions: input.definitions });
      return this.configurationInTransaction(tx);
    });
  }
  async modules(tx: Transaction) {
    return new Set((await tx.query<{ module_key: string }>('select module_key from module_settings where enabled')).rows.map((r) => r.module_key));
  }
  async context(token: string) {
    return this.children.withPolicy(token,async (tx,p) => {
      requireCapability(p,'learning.read'); return { modules: [...await this.modules(tx)].sort(),canPublish: p.account.capabilities.includes('learning.publish'),scopeRevision: p.scope.revision };
    });
  }
  async authorizedChild(tx: Transaction,p: Policy,id: string,write = false) {
    if (p.account.kind === 'GUARDIAN') { if (write) throw denied(); return (await requireGuardianChild(tx,p,id,'read')).child; }
    const child = await resolveChild(tx,id,write); requireChild(p,write ? 'learning.publish' : 'learning.read',child);
    if (write && (child.status !== 'ACTIVE' || !child.classroomId)) throw denied();
    return child;
  }
  async snapshot(tx: Transaction,child: Child,date: string,create: boolean): Promise<Snapshot | undefined> {
    if (date > this.today() || date < child.birthDate) throw invalid();
    let snapshot = (await tx.query<Snapshot>('select id,configuration_id,branch_id,classroom_id from daily_snapshots where child_id=$1 and business_date=$2',[child.id,date])).rows[0];
    if (snapshot || !create) return snapshot;
    // Child lock precedes this method. Historical placement is read from retained date-effective records.
    const placement = (await tx.query<{ branch_id: string; classroom_id: string | null }>('select branch_id,classroom_id from child_classroom_history where child_id=$1 and effective_on <= $2 order by effective_on desc,created_at desc,id desc limit 1',[child.id,date])).rows[0];
    const status = (await tx.query<{ new_status: string }>('select new_status from child_status_history where child_id=$1 and effective_on <= $2 order by effective_on desc,created_at desc,id desc limit 1',[child.id,date])).rows[0];
    if (!placement?.classroom_id || status?.new_status !== 'ACTIVE') return undefined;
    const config = await this.configurationInTransaction(tx,date);
    snapshot = { id: randomUUID(),configuration_id: config.id,branch_id: placement.branch_id,classroom_id: placement.classroom_id };
    await tx.query('insert into daily_snapshots(id,child_id,business_date,branch_id,classroom_id,configuration_id) values($1,$2,$3,$4,$5,$6) on conflict(child_id,business_date) do nothing',[snapshot.id,child.id,date,snapshot.branch_id,snapshot.classroom_id,config.id]);
    const actual = (await tx.query<Snapshot>('select id,configuration_id,branch_id,classroom_id from daily_snapshots where child_id=$1 and business_date=$2',[child.id,date])).rows[0];
    if (actual.id !== snapshot.id) return actual;
    for (const d of config.definitions.filter((d) => d.enabled && (!d.enabledFrom || date>=d.enabledFrom) && (!d.enabledUntil || date<=d.enabledUntil))) {
      await tx.query('insert into daily_slots(id,snapshot_id,configuration_id,definition_id) values($1,$2,$3,$4)',[randomUUID(),snapshot.id,config.id,d.id]);
    }
    return snapshot;
  }
  async dailyInTransaction(tx: Transaction,p: Policy,id: string,date: string): Promise<DailyLearning> {
      await tx.query('select pg_advisory_xact_lock_shared($1)',[CONFIG_LOCK]);
      const child = await this.authorizedChild(tx,p,id); const snapshot = await this.snapshot(tx,child,date,child.status==='ACTIVE');
      const modules = await this.modules(tx); const slots: DailySlot[] = [];
      if (snapshot) {
        const rows = (await tx.query<{ definition: CheckpointDefinition; event: LearningEvent | null }>(`select v.definition,(select row_to_json(latest) from (select ${eventColumns} from learning_events e where e.slot_id=s.id order by e.revision desc limit 1) latest) as event from daily_slots s join checkpoint_versions v using(configuration_id,definition_id) where s.snapshot_id=$1`,[snapshot.id])).rows;
        for (const row of rows) {
          if (!modules.has(checkpointModule[row.definition.kind])) continue;
          const status = row.event ? row.definition.statuses.find((s) => s.id===row.event!.statusId)! : ordered(row.definition.statuses).find((s) => s.enabled && s.meaning==='PENDING')!;
          slots.push({ ...row,status });
        }
        slots.sort((a,b) => a.definition.order-b.definition.order || a.definition.id.localeCompare(b.definition.id));
      }
      return { childId: id,date,snapshotId: snapshot?.id ?? null,branchId: snapshot?.branch_id ?? child.branchId,classroomId: snapshot?.classroom_id ?? child.classroomId,slots,progress: learningProgress(slots),canPublish: child.status==='ACTIVE' && child.classroomId!==null && p.account.capabilities.includes('learning.publish') };
  }
  async daily(token: string,id: string,date: string): Promise<DailyLearning> {
    z.uuid().parse(id); z.iso.date().parse(date);
    return this.children.withPolicy(token,(tx,p) => this.dailyInTransaction(tx,p,id,date));
  }
  async roster(token: string,offset = 0) {
    z.number().int().min(0).max(100000).parse(offset);
    return this.children.withPolicy(token,async (tx,p) => {
      const scope = staffChildScope(p,'learning.read');
      return (await tx.query<{ id: string; fullName: string; classroomId: string; classroomName: string }>(`select c.id,c.full_name as "fullName",c.classroom_id as "classroomId",cl.name as "classroomName" from children c join classrooms cl on cl.id=c.classroom_id where ${scope.sql} and c.status='ACTIVE' order by cl.name,c.full_name,c.id limit 100 offset $5`,[...scope.values,offset])).rows;
    });
  }
  // Adapter boundary: call inside ChildService.withPolicy, and wrap the whole adapter write in operation().
  // Specialized payload tables are owned/validated by Phases 09–11 in this SAME transaction.
  async appendInTransaction(tx: Transaction,p: Policy,kind: CheckpointDefinition['kind'],raw: unknown,action: LearningEvent['action']): Promise<LearningEvent> {
    const input = action === 'CORRECTION' ? checkpointCorrectionSchema.parse(raw) : checkpointPublicationSchema.parse(raw);
    await tx.query('select pg_advisory_xact_lock_shared($1)',[CONFIG_LOCK]);
    const child = await this.authorizedChild(tx,p,input.childId,true);
    const snapshot = await this.snapshot(tx,child,input.date,true); if (!snapshot) throw invalid();
    const slot = (await tx.query<{ id: string; definition: CheckpointDefinition }>('select s.id,v.definition from daily_slots s join checkpoint_versions v using(configuration_id,definition_id) where s.snapshot_id=$1 and s.definition_id=$2 for update of s',[snapshot.id,input.definitionId])).rows[0];
    if (!slot || slot.definition.kind !== kind) throw invalid();
    if (!(await this.modules(tx)).has(checkpointModule[kind])) throw off();
    const status = slot.definition.statuses.find((s) => s.id===input.statusId && s.enabled); if (!status) throw invalid();
    const previous = (await tx.query<LearningEvent>(`select ${eventColumns} from learning_events e where e.slot_id=$1 order by revision desc limit 1`,[slot.id])).rows[0];
    if ((previous?.revision ?? 0)!==input.expectedVersion) throw stale();
    if ((action==='PUBLISH') !== !previous) throw invalid();
    if (action==='TRANSITION' && (previous!.note !== (input.note ?? null) || previous!.statusId===input.statusId)) throw invalid();
    const event: LearningEvent = { id: randomUUID(),revision: input.expectedVersion+1,previousId: previous?.id ?? null,action,statusId: status.id,note: input.note ?? null,reason: 'reason' in input ? String(input.reason) : null };
    await tx.query('insert into learning_events(id,slot_id,configuration_id,definition_id,status_id,revision,previous_id,previous_revision,action,note,reason,actor_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[event.id,slot.id,snapshot.configuration_id,input.definitionId,event.statusId,event.revision,event.previousId,previous?.revision ?? null,action,event.note,event.reason,p.account.id]);
    await this.children.audit(tx,p,{ ...child,branchId: snapshot.branch_id },`learning.${action.toLowerCase()}`,previous ?? null,{ ...event,childId: child.id,date: input.date,definitionId: input.definitionId });
    await tx.query(`insert into learning_change_outbox(id,event_id,child_id,branch_id,classroom_id,business_date,module_key,recipient_ids) values($1,$2,$3,$4,$5,$6,$7,array(select guardian_id from guardian_child_links where child_id=$3 and active and can_read and can_notify order by guardian_id))`,[randomUUID(),event.id,child.id,snapshot.branch_id,snapshot.classroom_id,input.date,checkpointModule[kind]]);
    return event;
  }
  async operation<T>(tx: Transaction,p: Policy,operationId: string,request: unknown,authorize: () => Promise<void>,work: () => Promise<T>): Promise<T> {
    z.uuid().parse(operationId);
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`${p.account.id}/${operationId}`]);
    // Authorization and current module state are checked even on a successful replay.
    await authorize(); const hash = fingerprint(request);
    const old = (await tx.query<{ request_hash: string; result: T }>('select request_hash,result from learning_operations where actor_id=$1 and operation_id=$2',[p.account.id,operationId])).rows[0];
    if (old) { if (old.request_hash !== hash) throw new SafeError('IDEMPOTENCY_CONFLICT','learning.operationConflict',false,409); return old.result; }
    const result = await work();
    await tx.query('insert into learning_operations(actor_id,operation_id,request_hash,result) values($1,$2,$3,$4)',[p.account.id,operationId,hash,JSON.stringify(result)]);
    return result;
  }
  async authorizePublications(tx: Transaction,p: Policy,kind: CheckpointDefinition['kind'],entries: CheckpointPublication[]) {
    await tx.query('select pg_advisory_xact_lock_shared($1)',[CONFIG_LOCK]);
    for (const e of [...entries].sort((a,b) => a.childId.localeCompare(b.childId))) await this.authorizedChild(tx,p,e.childId,true);
    if (!(await this.modules(tx)).has(checkpointModule[kind])) throw off();
  }
  async publish(token: string,raw: unknown,action: LearningEvent['action'] = 'PUBLISH') {
    const input = action==='CORRECTION' ? checkpointCorrectionSchema.parse(raw) : checkpointPublicationSchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => this.operation(tx,p,input.operationId,{ action,input },() => this.authorizePublications(tx,p,'STATUS_NOTE',[input]),() => this.appendInTransaction(tx,p,'STATUS_NOTE',input,action)));
  }
  async batch(token: string,raw: unknown) {
    const input = checkpointBatchSchema.parse(raw); const entries = input.entries.map((e) => ({ ...e,operationId: input.operationId })).sort((a,b) => a.childId.localeCompare(b.childId));
    return this.children.withPolicy(token,(tx,p) => this.operation(tx,p,input.operationId,{ action: 'BATCH',input },async () => {
      await this.authorizePublications(tx,p,'STATUS_NOTE',entries);
      for (const e of entries) { const child = await resolveChild(tx,e.childId); if (child.classroomId!==input.classroomId) throw denied(); requireRecord(p,'learning.publish',{ branchId: child.branchId,classroomId: input.classroomId }); }
    },async () => { const events: LearningEvent[] = []; for (const e of entries) events.push(await this.appendInTransaction(tx,p,'STATUS_NOTE',e,'PUBLISH')); return events; }));
  }
  async history(token: string,id: string,date: string,definitionId: string) {
    z.uuid().parse(id); z.uuid().parse(definitionId); z.iso.date().parse(date);
    return this.children.withPolicy(token,async (tx,p) => {
      if (p.account.kind==='GUARDIAN') throw denied(); await this.authorizedChild(tx,p,id);
      // Explicit staff history may inspect disabled modules; ordinary daily reads never include them.
      return (await tx.query<LearningEvent>(`select ${eventColumns} from learning_events e join daily_slots s on s.id=e.slot_id join daily_snapshots d on d.id=s.snapshot_id where d.child_id=$1 and d.business_date=$2 and s.definition_id=$3 order by e.revision`,[id,date,definitionId])).rows;
    });
  }
}
