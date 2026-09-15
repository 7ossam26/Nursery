import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import {
  catalogInputSchema, examHistoryQuerySchema, examInputSchema, examNoExamDaySchema, examResultClassroomPublicationSchema, examResultCorrectionSchema,
  findExamStatus, type CheckpointPublication, type ExamCatalogItem, type ExamClassroomDraft, type ExamDefinition, type ExamHistoryEntry,
  type ExamResult, type ExamResultEntry, type ExamRosterEntry, type LearningEvent
} from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import type { ChildService } from '../children/service.js';
import type { LearningService } from '../learning/service.js';
import { denied, requireCapability, requireRecord, type Policy } from '../organization/policy.js';

const invalid = () => new SafeError('VALIDATION_ERROR','exams.invalid',false,400);
const off = () => new SafeError('MODULE_DISABLED','learning.disabled',false,403);
type CatalogTable = 'subjects' | 'exam_types';

const examProjection = `e.id,e.name,e.subject_id as "subjectId",e.subject_name as "subjectName",e.type_id as "typeId",e.type_name as "typeName",
  e.classroom_id as "classroomId",e.branch_id as "branchId",e.assessed_on::text as "assessedOn",e.grade_format as "gradeFormat",
  e.maximum_marks::text as "maximumMarks",e.decimal_allowed as "decimalAllowed",e.label_options as "labelOptions",e.creator_id as "creatorId"`;

export class ExamService {
  constructor(readonly children: ChildService, readonly learning: LearningService, readonly today: () => string = cairoIsoDate) {}

  private async requireEnabled(tx: Transaction) {
    if (!(await tx.query("select 1 from module_settings where module_key='EXAMS' and enabled")).rowCount) throw off();
  }
  private async classroomMeta(tx: Transaction,p: Policy,classroomId: string) {
    const classroom = (await tx.query<{ id: string; branch_id: string }>('select id,branch_id from classrooms where id=$1',[classroomId])).rows[0];
    if (!classroom) throw denied();
    requireRecord(p,'learning.read',{ branchId: classroom.branch_id,classroomId });
    return classroom;
  }
  private async classroomRoster(tx: Transaction,classroomId: string,date: string,offset=0,childIds?:string[]) {
    return (await tx.query<{ id: string; fullName: string }>(`
      select c.id,c.full_name as "fullName" from children c
      where c.status='ACTIVE' and c.classroom_id=$1 and ($4::uuid[] is null or c.id=any($4::uuid[]))
        and (select h.classroom_id from child_classroom_history h where h.child_id=c.id and h.effective_on<=$2 order by h.effective_on desc,h.created_at desc,h.id desc limit 1)=$1
        and (select h.new_status from child_status_history h where h.child_id=c.id and h.effective_on<=$2 order by h.effective_on desc,h.created_at desc,h.id desc limit 1)='ACTIVE'
      order by c.full_name,c.id limit 100 offset $3`,[classroomId,date,offset,childIds??null])).rows;
  }
  private async examById(tx: Transaction,id: string): Promise<ExamDefinition> {
    const row = (await tx.query<ExamDefinition>(`select ${examProjection} from exams e where e.id=$1`,[id])).rows[0];
    if (!row) throw denied();
    return row;
  }
  private async authorizeChildren(tx: Transaction,p: Policy,exam: ExamDefinition,childIds: string[]) {
    requireRecord(p,'learning.publish',{ branchId: exam.branchId,classroomId: exam.classroomId });
    const entries = childIds.map((childId) => ({ childId,date: exam.assessedOn,definitionId: exam.id,statusId: exam.id,note: null,expectedVersion: 0,operationId: exam.id })) as CheckpointPublication[];
    await this.learning.authorizePublications(tx,p,'EXAM',entries);
  }

  // ----- Subject / exam-type catalogs -----
  private async catalog(tx: Transaction,table: CatalogTable): Promise<ExamCatalogItem[]> {
    return (await tx.query<ExamCatalogItem>(`select id,name,enabled,version from ${table} order by name,id`)).rows;
  }
  async catalogs(token: string) {
    return this.children.withPolicy(token,async (tx,p) => {
      requireCapability(p,'learning.read');
      return { subjects: await this.catalog(tx,'subjects'),types: await this.catalog(tx,'exam_types') };
    });
  }
  async saveCatalog(token: string,table: CatalogTable,raw: unknown,id?: string) {
    if (id) z.uuid().parse(id);
    const envelope = z.object({ expectedVersion: z.number().int().positive(),value: catalogInputSchema }).strict();
    const update = id ? envelope.parse(raw) : undefined;
    const input = catalogInputSchema.parse(update ? update.value : raw);
    return this.children.withPolicy(token,async (tx,p) => {
      requireCapability(p,'exams.catalog');
      const before = id ? (await tx.query<ExamCatalogItem>(`select id,name,enabled,version from ${table} where id=$1 for update`,[id])).rows[0] : null;
      if (id && !before) throw denied();
      if (id && before!.version !== update!.expectedVersion) throw new SafeError('STALE_VERSION','organization.stale',false,409);
      const targetId = id ?? randomUUID();
      if (id) await tx.query(`update ${table} set name=$2,enabled=$3,version=version+1 where id=$1`,[targetId,input.name,input.enabled]);
      else await tx.query(`insert into ${table}(id,name,enabled) values($1,$2,$3)`,[targetId,input.name,input.enabled]);
      await this.children.audit(tx,p,null,`exams.catalog.${id ? 'updated' : 'created'}`,before,{ table,...input });
      return { id: targetId,version: before ? before.version+1 : 1 };
    });
  }

  // ----- Exam definitions -----
  private async reopenAggregate(tx: Transaction,p: Policy,classroomId: string,date: string) {
    for (let offset=0;;offset+=100) {
    const roster = await this.classroomRoster(tx,classroomId,date,offset);
    for (const child of roster) {
      const day = await this.learning.dailyInTransaction(tx,p,child.id,date);
      const slot = day.slots.find((s) => s.definition.kind==='EXAM');
      if (!slot?.event || slot.status.meaning==='PENDING') continue;
      const awaiting = findExamStatus(slot.definition,'AWAITING_RESULT'); if (!awaiting) continue;
      await this.learning.appendInTransaction(tx,p,'EXAM',{
        childId: child.id,date,definitionId: slot.definition.id,statusId: awaiting.id,note: null,expectedVersion: slot.event.revision,operationId: randomUUID()
      },'TRANSITION',{ aggregateTransition: true });
    }
    if(roster.length<100)break;
    }
  }
  async create(token: string,raw: unknown): Promise<ExamDefinition> {
    const input = examInputSchema.parse(raw);
    if (input.assessedOn > this.today()) throw invalid();
    return this.children.withPolicy(token,(tx,p) => this.learning.operation(tx,p,input.operationId,{ kind: 'EXAM',action: 'CREATE',input },
      async () => {
        await this.requireEnabled(tx);
        const classroom = await this.classroomMeta(tx,p,input.classroomId);
        requireRecord(p,'learning.publish',{ branchId: classroom.branch_id,classroomId: input.classroomId });
      },
      async () => {
        const classroom = (await tx.query<{ branch_id: string }>('select branch_id from classrooms where id=$1',[input.classroomId])).rows[0]!;
        const subject = (await tx.query<{ name: string; enabled: boolean }>('select name,enabled from subjects where id=$1 for share',[input.subjectId])).rows[0];
        if (!subject?.enabled) throw invalid();
        const type = (await tx.query<{ name: string; enabled: boolean }>('select name,enabled from exam_types where id=$1 for share',[input.typeId])).rows[0];
        if (!type?.enabled) throw invalid();
        const examId = randomUUID();
        await tx.query(`insert into exams(id,name,subject_id,subject_name,type_id,type_name,classroom_id,branch_id,assessed_on,grade_format,maximum_marks,decimal_allowed,label_options,creator_id)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [examId,input.name,input.subjectId,subject.name,input.typeId,type.name,input.classroomId,classroom.branch_id,input.assessedOn,input.gradeFormat,input.maximumMarks,input.decimalAllowed,input.labelOptions ? JSON.stringify(input.labelOptions) : null,p.account.id]);
        await this.reopenAggregate(tx,p,input.classroomId,input.assessedOn);
        const exam = await this.examById(tx,examId);
        await this.children.audit(tx,p,null,'exam.created',null,exam);
        return exam;
      }));
  }
  async listForClassroom(token: string,classroomId: string,date: string) {
    z.uuid().parse(classroomId); z.iso.date().parse(date);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.requireEnabled(tx); await this.classroomMeta(tx,p,classroomId);
      return (await tx.query<ExamDefinition>(`select ${examProjection} from exams e where e.classroom_id=$1 and e.assessed_on=$2 order by e.created_at,e.id`,[classroomId,date])).rows;
    });
  }
  async detail(token: string,id: string): Promise<ExamDefinition> {
    z.uuid().parse(id);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.requireEnabled(tx); const exam = await this.examById(tx,id);
      requireRecord(p,'learning.read',{ branchId: exam.branchId,classroomId: exam.classroomId });
      return exam;
    });
  }

  // ----- Results -----
  private validateEntry(exam: ExamDefinition,entry: Pick<ExamResultEntry,'outcome' | 'score' | 'label'>) {
    if (entry.outcome==='CHILD_ABSENT') return;
    if (exam.gradeFormat==='NUMERIC') {
      if (entry.score===null) throw invalid();
      const max = Number(exam.maximumMarks);
      if (entry.score<0 || entry.score>max) throw invalid();
      if (!exam.decimalAllowed && !Number.isInteger(entry.score)) throw invalid();
      if (Number(entry.score.toFixed(2))!==entry.score) throw invalid();
    } else {
      if (entry.label===null || !exam.labelOptions?.includes(entry.label)) throw invalid();
    }
  }
  private async currentResult(tx: Transaction,examId: string,childId: string) {
    return (await tx.query('select 1 from exam_results where exam_id=$1 and child_id=$2',[examId,childId])).rowCount!==0;
  }
  private async appendResult(tx: Transaction,p: Policy,exam: ExamDefinition,entry: ExamResultEntry,action: LearningEvent['action'],reason?: string): Promise<LearningEvent> {
    const day = await this.learning.dailyInTransaction(tx,p,entry.childId,exam.assessedOn);
    const slot = day.slots.find((s) => s.definition.kind==='EXAM'); if (!slot) throw invalid();
    const examIds = (await tx.query<{ id: string }>('select id from exams where classroom_id=$1 and assessed_on=$2',[exam.classroomId,exam.assessedOn])).rows.map((r) => r.id);
    const others = (await tx.query<{ outcome: string }>(`select distinct on (er.exam_id) er.outcome from exam_results er join learning_events e on e.id=er.event_id
      where er.child_id=$1 and er.exam_id=any($2::uuid[]) and er.exam_id<>$3 order by er.exam_id,e.revision desc`,[entry.childId,examIds,exam.id])).rows;
    const outcomes = [...others.map((r) => r.outcome),entry.outcome];
    const aggregate = outcomes.length<examIds.length ? 'AWAITING_RESULT' : outcomes.every((o) => o==='CHILD_ABSENT') ? 'CHILD_ABSENT' : 'RESULT_PUBLISHED';
    const status = findExamStatus(slot.definition,aggregate); if (!status) throw invalid();
    const event = await this.learning.appendInTransaction(tx,p,'EXAM',{
      childId: entry.childId,date: exam.assessedOn,definitionId: slot.definition.id,statusId: status.id,note: null,
      expectedVersion: entry.expectedVersion,operationId: randomUUID(),...(action==='CORRECTION' ? { reason } : {})
    },action,{ aggregateTransition: action==='TRANSITION' });
    await tx.query('insert into exam_results(event_id,exam_id,child_id,outcome,score,label,comment) values($1,$2,$3,$4,$5,$6,$7)',
      [event.id,exam.id,entry.childId,entry.outcome,entry.score,entry.label,entry.comment]);
    return event;
  }
  async publishResults(token: string,raw: unknown) {
    const input = examResultClassroomPublicationSchema.parse(raw);
    const entries = [...input.entries].sort((a,b) => a.childId.localeCompare(b.childId));
    return this.children.withPolicy(token,(tx,p) => {
      let exam: ExamDefinition;
      return this.learning.operation(tx,p,input.operationId,{ kind: 'EXAM',action: 'CLASSROOM',input },async () => {
        await this.requireEnabled(tx); exam = await this.examById(tx,input.examId);
        const roster = await this.classroomRoster(tx,exam.classroomId,exam.assessedOn,0,entries.map(entry=>entry.childId)); const rosterIds = new Set(roster.map((c) => c.id));
        for (const entry of entries) {
          if (!rosterIds.has(entry.childId)) throw denied();
          this.validateEntry(exam,entry);
          if (await this.currentResult(tx,exam.id,entry.childId)) throw invalid();
        }
        await this.authorizeChildren(tx,p,exam,entries.map((e) => e.childId));
      },async () => {
        const events: LearningEvent[] = [];
        for (const entry of entries) events.push(await this.appendResult(tx,p,exam,entry,entry.expectedVersion===0 ? 'PUBLISH' : 'TRANSITION'));
        return events;
      });
    });
  }
  async correctResult(token: string,raw: unknown) {
    const input = examResultCorrectionSchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => {
      let exam: ExamDefinition;
      return this.learning.operation(tx,p,input.operationId,{ kind: 'EXAM',action: 'CORRECTION',input },async () => {
        await this.requireEnabled(tx); exam = await this.examById(tx,input.examId);
        this.validateEntry(exam,input);
        if (!await this.currentResult(tx,exam.id,input.childId)) throw invalid();
        await this.authorizeChildren(tx,p,exam,[input.childId]);
      },() => this.appendResult(tx,p,exam,input,'CORRECTION',input.reason));
    });
  }
  async roster(token: string,examId: string,offset=0): Promise<ExamClassroomDraft> {
    z.uuid().parse(examId); z.number().int().min(0).max(100000).parse(offset);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.requireEnabled(tx); const exam = await this.examById(tx,examId);
      requireRecord(p,'learning.read',{ branchId: exam.branchId,classroomId: exam.classroomId });
      const roster = await this.classroomRoster(tx,exam.classroomId,exam.assessedOn,offset);
      const entries: ExamRosterEntry[] = [];
      for (const child of roster) {
        const day = await this.learning.dailyInTransaction(tx,p,child.id,exam.assessedOn);
        const slot = day.slots.find((s) => s.definition.kind==='EXAM');
        const result = (await tx.query<ExamResult>(`select er.outcome,er.score::text as score,er.label,er.comment from exam_results er join learning_events e on e.id=er.event_id
          where er.exam_id=$1 and er.child_id=$2 order by e.revision desc limit 1`,[examId,child.id])).rows[0] ?? null;
        entries.push({ childId: child.id,fullName: child.fullName,result,slotRevision: slot?.event?.revision ?? 0 });
      }
      const complete = entries.filter((entry) => entry.result!==null).length;
      return { exam,entries,complete,total: entries.length };
    });
  }
  async noExamDay(token: string,raw: unknown) {
    const input = examNoExamDaySchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => {
      let roster: { id: string; fullName: string }[] = [];
      return this.learning.operation(tx,p,input.operationId,{ kind: 'EXAM',action: 'NO_EXAM',input },async () => {
        await this.requireEnabled(tx); const classroom = await this.classroomMeta(tx,p,input.classroomId);
        requireRecord(p,'learning.publish',{ branchId: classroom.branch_id,classroomId: input.classroomId });
        if (await tx.query('select 1 from exams where classroom_id=$1 and assessed_on=$2 limit 1',[input.classroomId,input.date]).then((r) => r.rowCount)) throw invalid();
        roster = await this.classroomRoster(tx,input.classroomId,input.date,input.offset); if (!roster.length) throw invalid();
        const entries = roster.map((c) => ({ childId: c.id,date: input.date,definitionId: input.classroomId,statusId: input.classroomId,note: null,expectedVersion: 0,operationId: input.classroomId })) as CheckpointPublication[];
        await this.learning.authorizePublications(tx,p,'EXAM',entries);
      },async () => {
        const events: LearningEvent[] = [];
        for (const child of roster) {
          const day = await this.learning.dailyInTransaction(tx,p,child.id,input.date);
          const slot = day.slots.find((s) => s.definition.kind==='EXAM')!;
          const status = findExamStatus(slot.definition,'NO_EXAM')!;
          events.push(await this.learning.appendInTransaction(tx,p,'EXAM',{ childId: child.id,date: input.date,definitionId: slot.definition.id,statusId: status.id,note: null,expectedVersion: 0,operationId: randomUUID() },'PUBLISH'));
        }
        return events;
      });
    });
  }
  async history(token: string,childId: string,raw: unknown): Promise<{ items: ExamHistoryEntry[]; total: number }> {
    z.uuid().parse(childId); const input = examHistoryQuerySchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.requireEnabled(tx); await this.learning.authorizedChild(tx,p,childId);
      const values = [childId,input.subjectId ?? null,input.typeId ?? null,input.from ?? null,input.until ?? null];
      const where = `e.classroom_id = coalesce((select h.classroom_id from child_classroom_history h where h.child_id=$1 and h.effective_on<=e.assessed_on order by h.effective_on desc,h.created_at desc,h.id desc limit 1),'00000000-0000-0000-0000-000000000000'::uuid)
        and coalesce((select h.new_status from child_status_history h where h.child_id=$1 and h.effective_on<=e.assessed_on order by h.effective_on desc,h.created_at desc,h.id desc limit 1),'') = 'ACTIVE'
        and ($2::uuid is null or e.subject_id=$2) and ($3::uuid is null or e.type_id=$3)
        and ($4::date is null or e.assessed_on>=$4) and ($5::date is null or e.assessed_on<=$5)`;
      const total = (await tx.query<{ total: number }>(`select count(*)::int as total from exams e where ${where}`,values)).rows[0].total;
      const rows = (await tx.query<ExamDefinition>(`select ${examProjection} from exams e where ${where} order by e.assessed_on desc,e.id desc limit $6 offset $7`,[...values,input.limit,input.offset])).rows;
      const items: ExamHistoryEntry[] = [];
      for (const exam of rows) {
        const row = (await tx.query<{ outcome: string; score: string | null; label: string | null; comment: string | null; revisions: number }>(
          `select er.outcome,er.score::text as score,er.label,er.comment,count(*) over()::int as revisions from exam_results er join learning_events e on e.id=er.event_id
           where er.exam_id=$1 and er.child_id=$2 order by e.revision desc limit 1`,[exam.id,childId])).rows[0];
        items.push({ exam,result: row ? { outcome: row.outcome as ExamResult['outcome'],score: row.score,label: row.label,comment: row.comment } : null,corrected: (row?.revisions ?? 0)>1 });
      }
      return { items,total };
    });
  }
}
