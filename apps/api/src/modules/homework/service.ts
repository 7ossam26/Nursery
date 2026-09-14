import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import { homeworkAssignmentSchema, homeworkContentCorrectionSchema, homeworkOutcomeBatchSchema, homeworkOutcomeCorrectionSchema, homeworkNoDaySchema, homeworkHistoryQuerySchema,
  type CheckpointStatus, type HomeworkAssignment, type HomeworkOutcome, type HomeworkRoster, type HomeworkHistoryEntry, type DailySlot } from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import type { ChildService } from '../children/service.js';
import type { LearningService } from '../learning/service.js';
import { requireChild, resolveChild } from '../children/policy.js';
import { denied, requireRecord, stale, type Policy } from '../organization/policy.js';
import { homeworkReporting, homeworkScope } from './reporting.js';
const invalid = () => new SafeError('VALIDATION_ERROR','homework.invalid',false,400);
const projection = 'a.id,a.classroom_id as "classroomId",a.branch_id as "branchId",a.assigned_on::text as "assignedOn",a.due_on::text as "dueOn",v.title,v.instructions,v.revision as version,(v.revision>1) as corrected';
const outcomeProjection = 'o.id,o.revision as version,o.status,o.note,o.effective_on::text as date,o.reason';
type OutcomeInput = z.infer<typeof homeworkOutcomeBatchSchema>['entries'][number];
export class HomeworkService {
  constructor(readonly children: ChildService,readonly learning: LearningService,readonly today: () => string = cairoIsoDate) {}
  private async enabled(tx: Transaction) { if (!(await this.learning.modules(tx)).has('HOMEWORK')) throw new SafeError('MODULE_DISABLED','learning.disabled',false,403); }
  private date(date: string) { if (date>this.today()) throw invalid(); }
  private async lock(tx: Transaction) { await tx.query('select pg_advisory_xact_lock(7191101)'); }
  private async assignment(tx: Transaction,id: string): Promise<HomeworkAssignment> {
    const row = (await tx.query<HomeworkAssignment>(`select ${projection} from homework_assignments a join lateral(select * from homework_versions where assignment_id=a.id order by revision desc limit 1) v on true where a.id=$1`,[id])).rows[0];
    if (!row) throw denied(); return row;
  }
  private authorize(p: Policy,a: HomeworkAssignment,write = false) { requireRecord(p,write ? 'learning.publish' : 'learning.read',{ branchId: a.branchId,classroomId: a.classroomId }); }
  private async recipients(tx: Transaction,id: string) { return (await tx.query<{ childId: string; fullName: string }>('select child_id as "childId",child_name as "fullName" from homework_recipients where assignment_id=$1 order by child_id',[id])).rows; }
  private async current(tx: Transaction,id: string,childId: string,date?: string): Promise<HomeworkOutcome | null> {
    return (await tx.query<HomeworkOutcome>(`select ${outcomeProjection} from homework_outcomes o where assignment_id=$1 and child_id=$2 and ($3::date is null or effective_on<=$3) order by revision desc limit 1`,[id,childId,date ?? null])).rows[0] ?? null;
  }
  private async slot(tx: Transaction,p: Policy,childId: string,date: string): Promise<DailySlot> {
    const slot = (await this.learning.dailyInTransaction(tx,p,childId,date)).slots.find((s) => s.definition.kind==='HOMEWORK'); if (!slot) throw invalid(); return slot;
  }
  private mapped(slot: DailySlot,outcome: string): CheckpointStatus { const status = slot.definition.statuses.find((s) => s.enabled && s.outcome===outcome); if (!status) throw invalid(); return status; }
  private async append(tx: Transaction,p: Policy,childId: string,date: string,outcome: string,reason?: string) {
    const slot = await this.slot(tx,p,childId,date); const status = this.mapped(slot,outcome); const revision=slot.event?.revision ?? 0;
    return this.learning.appendInTransaction(tx,p,'HOMEWORK',{ childId,date,definitionId: slot.definition.id,statusId: status.id,note: null,expectedVersion: revision,operationId: randomUUID(),...(reason && revision ? { reason } : {}) },reason && revision ? 'CORRECTION' : revision ? 'TRANSITION' : 'PUBLISH',{ aggregateTransition: true });
  }
  private async contentOutbox(tx: Transaction,a: HomeworkAssignment,versionId: string) {
    for (const r of await this.recipients(tx,a.id)) await tx.query(`insert into homework_content_outbox(id,version_id,child_id,branch_id,classroom_id,recipient_ids) values($1,$2,$3,$4,$5,array(select guardian_id from guardian_child_links where child_id=$3 and active and can_read and can_notify order by guardian_id))`,[randomUUID(),versionId,r.childId,a.branchId,a.classroomId]);
  }
  async publish(token: string,raw: unknown) {
    const input=homeworkAssignmentSchema.parse(raw); this.date(input.assignedOn);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.lock(tx);
      return this.learning.operation(tx,p,input.operationId,{ action: 'HOMEWORK_ASSIGN',input },async () => {
        await this.enabled(tx);
        const cl=(await tx.query<{ branch_id: string }>('select branch_id from classrooms where id=$1',[input.classroomId])).rows[0]; if (!cl) throw denied();
        requireRecord(p,'learning.publish',{ branchId: cl.branch_id,classroomId: input.classroomId });
        for (const id of [...input.childIds].sort()) {
          const child=await this.learning.authorizedChild(tx,p,id,true); if (child.classroomId!==input.classroomId) throw denied();
          const historical=(await tx.query('select 1 from child_classroom_history h where h.child_id=$1 and h.effective_on<=$2 order by h.effective_on desc,h.created_at desc,h.id desc limit 1',[id,input.assignedOn])).rowCount;
          const day=await this.learning.snapshot(tx,child,input.assignedOn,true); if (!historical || day?.classroom_id!==input.classroomId) throw denied();
        }
      },async () => {
        const cl=(await tx.query<{ branch_id: string }>('select branch_id from classrooms where id=$1',[input.classroomId])).rows[0]!;
        const id=randomUUID(); const versionId=randomUUID();
        await tx.query('insert into homework_assignments(id,classroom_id,branch_id,assigned_on,due_on,creator_id) values($1,$2,$3,$4,$5,$6)',[id,input.classroomId,cl.branch_id,input.assignedOn,input.dueOn,p.account.id]);
        await tx.query('insert into homework_versions(id,assignment_id,revision,title,instructions,actor_id) values($1,$2,1,$3,$4,$5)',[versionId,id,input.title,input.instructions,p.account.id]);
        for (const childId of [...input.childIds].sort()) {
          const child=await resolveChild(tx,childId); await tx.query('insert into homework_recipients(assignment_id,child_id,child_name) values($1,$2,$3)',[id,childId,child.fullName]);
          const summary=await homeworkReporting(tx,p,childId,input.assignedOn);
          await this.append(tx,p,childId,input.assignedOn,summary.outcome);
        }
        const a=await this.assignment(tx,id); await this.contentOutbox(tx,a,versionId); await this.children.audit(tx,p,null,'homework.published',null,{ ...a,childIds: input.childIds }); return a;
      });
    });
  }
  async correctContent(token: string,id: string,raw: unknown) {
    z.uuid().parse(id); const input=homeworkContentCorrectionSchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.lock(tx); let a: HomeworkAssignment;
      return this.learning.operation(tx,p,input.operationId,{ action: 'HOMEWORK_CONTENT',id,input },async () => {
        await this.enabled(tx); a=await this.assignment(tx,id); this.authorize(p,a,true);
        for (const r of await this.recipients(tx,id)) requireChild(p,'learning.publish',await resolveChild(tx,r.childId,true));
      },async () => {
        if (a.version!==input.expectedVersion) throw stale();
        const old=(await tx.query<{ id: string }>('select id from homework_versions where assignment_id=$1 and revision=$2',[id,a.version])).rows[0]!; const versionId=randomUUID();
        await tx.query('insert into homework_versions(id,assignment_id,revision,previous_id,previous_revision,title,instructions,reason,actor_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[versionId,id,a.version+1,old.id,a.version,input.title,input.instructions,input.reason,p.account.id]);
        await this.contentOutbox(tx,a,versionId); await this.children.audit(tx,p,null,'homework.content_corrected',a,input); return this.assignment(tx,id);
      });
    });
  }
  private async authorizeOutcome(tx: Transaction,p: Policy,a: HomeworkAssignment,entry: OutcomeInput,date: string) {
    this.authorize(p,a,true); this.date(date); if (date<a.assignedOn) throw invalid();
    if (!(await tx.query('select 1 from homework_recipients where assignment_id=$1 and child_id=$2',[a.id,entry.childId])).rowCount) throw denied();
    await this.learning.authorizedChild(tx,p,entry.childId,true);
    const slot=await this.slot(tx,p,entry.childId,date); const status=slot.definition.statuses.find((s) => s.id===entry.statusId && s.enabled);
    if (!status?.outcome || !['COMPLETED','NOT_COMPLETED','EXCUSED'].includes(status.outcome)) throw invalid(); return status;
  }
  private async outcome(tx: Transaction,p: Policy,a: HomeworkAssignment,entry: OutcomeInput,date: string,status: CheckpointStatus,reason?: string) {
    const previous=await this.current(tx,a.id,entry.childId);
    if ((previous?.version ?? 0)!==entry.expectedVersion) throw stale();
    if (Boolean(previous)!==Boolean(reason) || (previous && date<previous.date)) throw invalid();
    const summary=await homeworkReporting(tx,p,entry.childId,date,{ assignmentId: a.id,outcome: status.outcome! });
    const event=await this.append(tx,p,entry.childId,date,summary.outcome,reason); const id=randomUUID();
    await tx.query('insert into homework_outcomes(id,assignment_id,child_id,revision,previous_id,previous_revision,event_id,status,note,effective_on,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,a.id,entry.childId,entry.expectedVersion+1,previous?.id ?? null,previous?.version ?? null,event.id,JSON.stringify(status),entry.note,date,reason ?? null]);
    await this.children.audit(tx,p,await resolveChild(tx,entry.childId),'homework.outcome',previous,{ assignmentId: a.id,status,note: entry.note,date,reason });
    return this.current(tx,a.id,entry.childId);
  }
  async publishOutcomes(token: string,raw: unknown) {
    const input=homeworkOutcomeBatchSchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.lock(tx); let a: HomeworkAssignment; const statuses=new Map<string,CheckpointStatus>();
      return this.learning.operation(tx,p,input.operationId,{ action: 'HOMEWORK_OUTCOMES',input },async () => {
        await this.enabled(tx); a=await this.assignment(tx,input.assignmentId);
        for (const e of [...input.entries].sort((a,b) => a.childId.localeCompare(b.childId))) statuses.set(e.childId,await this.authorizeOutcome(tx,p,a,e,input.date));
      },async () => { const results=[]; for (const e of [...input.entries].sort((a,b) => a.childId.localeCompare(b.childId))) results.push(await this.outcome(tx,p,a,e,input.date,statuses.get(e.childId)!)); return results; });
    });
  }
  async correctOutcome(token: string,raw: unknown) {
    const input=homeworkOutcomeCorrectionSchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.lock(tx); let a: HomeworkAssignment; let status: CheckpointStatus;
      return this.learning.operation(tx,p,input.operationId,{ action: 'HOMEWORK_OUTCOME_CORRECTION',input },async () => { await this.enabled(tx); a=await this.assignment(tx,input.assignmentId); status=await this.authorizeOutcome(tx,p,a,input,input.date); },() => this.outcome(tx,p,a,input,input.date,status,input.reason));
    });
  }
  async list(token: string,classroomId: string,date: string,overdue = false) {
    z.uuid().parse(classroomId); z.iso.date().parse(date);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.enabled(tx); const cl=(await tx.query<{ branch_id: string }>('select branch_id from classrooms where id=$1',[classroomId])).rows[0]; if (!cl) throw denied(); requireRecord(p,'learning.read',{ branchId: cl.branch_id,classroomId });
      return (await tx.query<HomeworkAssignment>(`select ${projection} from homework_assignments a join lateral(select * from homework_versions where assignment_id=a.id order by revision desc limit 1) v on true
        where a.classroom_id=$1 and a.assigned_on<=$2 and (${overdue ? `a.due_on<$2 and exists(select 1 from homework_recipients r where r.assignment_id=a.id and coalesce((select o.status->>'outcome' from homework_outcomes o where o.assignment_id=a.id and o.child_id=r.child_id order by revision desc limit 1),'MISSING') not in ('COMPLETED','EXCUSED'))` : '(a.assigned_on=$2 or a.due_on=$2)'}) order by a.due_on,a.id limit 100`,[classroomId,date])).rows;
    });
  }
  async roster(token: string,id: string,date: string): Promise<HomeworkRoster> {
    z.uuid().parse(id); z.iso.date().parse(date); this.date(date);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.enabled(tx); const a=await this.assignment(tx,id); this.authorize(p,a); const entries=[];
      for (const r of await this.recipients(tx,id)) {
        const child=await resolveChild(tx,r.childId); let canRecord=false;
        try { requireChild(p,'learning.publish',child); canRecord=child.status==='ACTIVE' && child.classroomId!==null; } catch (error) { if (!(error instanceof SafeError) || error.code!=='FORBIDDEN') throw error; }
        entries.push({ ...r,outcome: await this.current(tx,id,r.childId,date),canRecord });
      }
      const config=await this.learning.configurationInTransaction(tx,date); return { assignment: a,entries,statuses: config.definitions.find((d) => d.kind==='HOMEWORK')!.statuses.filter((s) => s.enabled && ['COMPLETED','NOT_COMPLETED','EXCUSED'].includes(s.outcome ?? '')) };
    });
  }
  async noHomeworkDay(token: string,raw: unknown) {
    const input=homeworkNoDaySchema.parse(raw); this.date(input.date);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.lock(tx);
      return this.learning.operation(tx,p,input.operationId,{ action: 'HOMEWORK_NO_DAY',input },async () => {
        await this.enabled(tx);
        for (const e of [...input.entries].sort((a,b) => a.childId.localeCompare(b.childId))) {
          const child=await this.learning.authorizedChild(tx,p,e.childId,true); if (child.classroomId!==input.classroomId) throw denied();
          const slot=await this.slot(tx,p,e.childId,input.date); const status=slot.definition.statuses.find((s) => s.id===e.statusId && s.enabled); if (!status || !['NO_HOMEWORK','EXCUSED'].includes(status.outcome ?? '')) throw invalid();
          const day=await this.learning.snapshot(tx,child,input.date,true); if (day?.classroom_id!==input.classroomId) throw denied();
        }
      },async () => {
        const events=[];
        for (const e of [...input.entries].sort((a,b) => a.childId.localeCompare(b.childId))) {
          const summary=await homeworkReporting(tx,p,e.childId,input.date); if (summary.due || summary.future) throw invalid();
          const slot=await this.slot(tx,p,e.childId,input.date); if ((slot.event?.revision ?? 0)!==e.expectedVersion) throw stale();
          if ((await tx.query('select 1 from homework_no_days where child_id=$1 and business_date=$2',[e.childId,input.date])).rowCount) throw invalid();
          const event=await this.learning.appendInTransaction(tx,p,'HOMEWORK',{ ...e,date: input.date,definitionId: slot.definition.id,operationId: randomUUID() },slot.event ? 'TRANSITION' : 'PUBLISH',{ aggregateTransition: true });
          await tx.query('insert into homework_no_days(child_id,business_date,event_id) values($1,$2,$3)',[e.childId,input.date,event.id]); events.push(event);
        }
        return events;
      });
    });
  }
  async history(token: string,childId: string,raw: unknown): Promise<{ items: HomeworkHistoryEntry[]; total: number }> {
    z.uuid().parse(childId); const input=homeworkHistoryQuerySchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.enabled(tx); await this.learning.authorizedChild(tx,p,childId); const scope=homeworkScope(p);
      const where=`r.child_id=$1 and a.assigned_on<=$2 and ${scope.sql} and ($7::date is null or a.assigned_on>=$7) and ($8::date is null or a.assigned_on<=$8)
        and ($9::boolean=false or (a.due_on<$2 and coalesce(o.status->>'outcome','MISSING') not in ('COMPLETED','EXCUSED')))`;
      const from=`from homework_assignments a join homework_recipients r on r.assignment_id=a.id join lateral(select * from homework_versions where assignment_id=a.id order by revision desc limit 1) v on true
        left join lateral(select * from homework_outcomes where assignment_id=a.id and child_id=r.child_id and effective_on<=$2 order by revision desc limit 1) o on true`;
      const values=[childId,this.today(),...scope.values,input.from ?? null,input.until ?? null,input.overdue==='true'];
      const total=(await tx.query<{ total: number }>(`select count(*)::int as total ${from} where ${where}`,values)).rows[0].total;
      const assignments=(await tx.query<HomeworkAssignment>(`select ${projection} ${from} where ${where} order by a.due_on desc,a.id limit $10 offset $11`,[...values,input.limit,input.offset])).rows; const items=[];
      for (const a of assignments) { const outcome=await this.current(tx,a.id,childId,this.today()); items.push({ assignment: a,outcome,overdue: a.dueOn<this.today() && !['COMPLETED','EXCUSED'].includes(outcome?.status.outcome ?? '') }); }
      return { items,total };
    });
  }
  async versions(token: string,id: string) {
    z.uuid().parse(id); return this.children.withPolicy(token,async (tx,p) => { await this.enabled(tx); const a=await this.assignment(tx,id); this.authorize(p,a); return (await tx.query('select revision,title,instructions,reason from homework_versions where assignment_id=$1 order by revision',[id])).rows; });
  }
}
