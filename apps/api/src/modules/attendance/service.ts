import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import {
  attendanceClassroomPublicationSchema, attendanceCorrectionSchema, noClassDaySchema, plannedAbsenceSchema,
  type AttendanceClassroomDraft, type AttendanceDailyReport, type AttendancePresence, type AttendanceRecord,
  type AttendanceRosterEntry, type CheckpointPublication, type LearningEvent, type PlannedAbsence
} from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import type { ChildService } from '../children/service.js';
import { requireGuardianChild, resolveChild } from '../children/policy.js';
import type { LearningService } from '../learning/service.js';
import { denied, requireRecord, type Policy } from '../organization/policy.js';

const invalid = () => new SafeError('VALIDATION_ERROR','attendance.invalid',false,400);
const off = () => new SafeError('MODULE_DISABLED','learning.disabled',false,403);
const datesBetween = (from: string,until: string) => Math.round((Date.parse(`${until}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000)+1;

type Prepared = { publication: CheckpointPublication; presence: AttendancePresence; absenceReason: string | null; correctionReason?: string };

export class AttendanceService {
  constructor(readonly children: ChildService,readonly learning: LearningService,readonly today: () => string = cairoIsoDate) {}

  private async requireEnabled(tx: Transaction) {
    if (!(await tx.query("select 1 from module_settings where module_key='ATTENDANCE' and enabled")).rowCount) throw off();
  }

  private async classroomMeta(tx: Transaction,p: Policy,classroomId: string) {
    const classroom = (await tx.query<{ id: string; name: string; branch_id: string }>('select id,name,branch_id from classrooms where id=$1',[classroomId])).rows[0];
    if (!classroom) throw denied();
    requireRecord(p,'learning.read',{ branchId: classroom.branch_id,classroomId });
    return classroom;
  }

  private async rosterInTransaction(tx: Transaction,p: Policy,classroomId: string,date: string): Promise<AttendanceClassroomDraft> {
    z.uuid().parse(classroomId); z.iso.date().parse(date); if (date>this.today()) throw invalid();
    await this.requireEnabled(tx); const classroom = await this.classroomMeta(tx,p,classroomId);
    const children = (await tx.query<{ id: string; fullName: string }>(`
      select c.id,c.full_name as "fullName" from children c
      where c.status='ACTIVE' and c.classroom_id=$1
        and (select h.classroom_id from child_classroom_history h where h.child_id=c.id and h.effective_on<=$2 order by h.effective_on desc,h.created_at desc,h.id desc limit 1)=$1
        and (select h.new_status from child_status_history h where h.child_id=c.id and h.effective_on<=$2 order by h.effective_on desc,h.created_at desc,h.id desc limit 1)='ACTIVE'
      order by c.full_name,c.id limit 100`,[classroomId,date])).rows;
    const entries: AttendanceRosterEntry[] = [];
    for (const child of children) {
      const day = await this.learning.dailyInTransaction(tx,p,child.id,date);
      const slot = day.slots.find((value) => value.definition.kind==='ATTENDANCE');
      if (!slot) continue;
      let record: AttendanceRecord | null = null;
      if (slot.event) record = (await tx.query<AttendanceRecord>(`select $1::jsonb as event,presence,absence_reason as "absenceReason" from attendance_records where event_id=$2`,[JSON.stringify(slot.event),slot.event.id])).rows[0] ?? null;
      const notices = (await tx.query<PlannedAbsence>('select business_date::text as date,reason,version from attendance_planned_absences where child_id=$1 and business_date=$2 order by guardian_id',[child.id,date])).rows;
      entries.push({ childId: child.id,fullName: child.fullName,definition: slot.definition,record,notices });
    }
    const complete = entries.filter((entry) => entry.record!==null).length;
    return { classroomId,classroomName: classroom.name,date,entries,complete,total: entries.length,noClass: entries.length>0 && entries.every((entry) => entry.record?.presence==='NO_CLASS') };
  }

  async classroom(token: string,classroomId: string,date: string) {
    return this.children.withPolicy(token,(tx,p) => this.rosterInTransaction(tx,p,classroomId,date));
  }

  private async prepare(tx: Transaction,p: Policy,classroomId: string,date: string,entries: { childId: string; statusId: string; absenceReason: string | null; expectedVersion: number }[],allowNoClass: boolean) {
    await this.requireEnabled(tx); const classroom = await this.classroomMeta(tx,p,classroomId);
    if (!p.account.capabilities.includes('learning.publish')) throw denied();
    const prepared: Prepared[] = [];
    for (const entry of [...entries].sort((a,b) => a.childId.localeCompare(b.childId))) {
      const child = await resolveChild(tx,entry.childId);
      if (child.status!=='ACTIVE' || child.classroomId!==classroomId || child.branchId!==classroom.branch_id) throw denied();
      const day = await this.learning.dailyInTransaction(tx,p,entry.childId,date);
      if (day.classroomId!==classroomId) throw denied();
      const definition = day.slots.find((slot) => slot.definition.kind==='ATTENDANCE')?.definition;
      const status = definition?.statuses.find((value) => value.id===entry.statusId && value.enabled);
      const presence = status?.outcome as AttendancePresence | undefined;
      if (!definition || !presence || !['PRESENT','ABSENT',...(allowNoClass ? ['NO_CLASS'] : [])].includes(presence)) throw invalid();
      if (presence!=='ABSENT' && entry.absenceReason!==null) throw invalid();
      prepared.push({ presence,absenceReason: entry.absenceReason,publication: { childId: entry.childId,date,definitionId: definition.id,statusId: entry.statusId,note: entry.absenceReason,expectedVersion: entry.expectedVersion,operationId: randomUUID() } });
    }
    await this.learning.authorizePublications(tx,p,'ATTENDANCE',prepared.map((value) => value.publication));
    return prepared;
  }

  private async append(tx: Transaction,p: Policy,value: Prepared,action: LearningEvent['action']) {
    const event = await this.learning.appendInTransaction(tx,p,'ATTENDANCE',{
      ...value.publication,...(action==='CORRECTION' ? { reason: value.correctionReason } : {})
    },action);
    await tx.query('insert into attendance_records(event_id,presence,absence_reason) values($1,$2,$3)',[event.id,value.presence,value.absenceReason]);
    if (value.presence==='ABSENT' && !(await tx.query('select 1 from attendance_planned_absences where child_id=$1 and business_date=$2 limit 1',[value.publication.childId,value.publication.date])).rowCount) {
      await tx.query(`insert into attendance_absence_alerts(event_id,child_id,recipient_ids) values($1,$2,array(select guardian_id from guardian_child_links where child_id=$2 and active and can_read and can_notify order by guardian_id))`,[event.id,value.publication.childId]);
    }
    return event;
  }

  async publishClassroom(token: string,raw: unknown) {
    const input = attendanceClassroomPublicationSchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => {
      let prepared: Prepared[] = [];
      return this.learning.operation(tx,p,input.operationId,{ kind: 'ATTENDANCE',action: 'CLASSROOM',input },async () => { prepared=await this.prepare(tx,p,input.classroomId,input.date,input.entries,false); },async () => {
        const events: LearningEvent[] = []; for (const value of prepared) events.push(await this.append(tx,p,value,'PUBLISH')); return events;
      });
    });
  }

  async correct(token: string,raw: unknown) {
    const input = attendanceCorrectionSchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => {
      let prepared: Prepared[] = [];
      return this.learning.operation(tx,p,input.operationId,{ kind: 'ATTENDANCE',action: 'CORRECTION',input },async () => {
        const child = await resolveChild(tx,input.childId); if (!child.classroomId) throw denied();
        prepared=await this.prepare(tx,p,child.classroomId,input.date,[input],false);
        prepared[0].publication = { ...prepared[0].publication,operationId: input.operationId };
        prepared[0].correctionReason=input.reason;
      },() => this.append(tx,p,prepared[0],'CORRECTION'));
    });
  }

  async noClass(token: string,raw: unknown) {
    const input = noClassDaySchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => {
      let prepared: Prepared[] = [];
      return this.learning.operation(tx,p,input.operationId,{ kind: 'ATTENDANCE',action: 'NO_CLASS',input },async () => {
        const roster = await this.rosterInTransaction(tx,p,input.classroomId,input.date); if (!roster.entries.length) throw invalid();
        const entries = roster.entries.map((entry) => ({ childId: entry.childId,statusId: entry.definition.statuses.find((status) => status.outcome==='NO_CLASS')?.id ?? '',absenceReason: null,expectedVersion: 0 }));
        prepared=await this.prepare(tx,p,input.classroomId,input.date,entries,true);
      },async () => { const events: LearningEvent[]=[]; for (const value of prepared) events.push(await this.append(tx,p,value,'PUBLISH')); return events; });
    });
  }

  async daily(token: string,childId: string,date: string): Promise<AttendanceDailyReport> {
    z.uuid().parse(childId); z.iso.date().parse(date);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.requireEnabled(tx); const day=await this.learning.dailyInTransaction(tx,p,childId,date);
      const event=day.slots.find((slot) => slot.definition.kind==='ATTENDANCE')?.event ?? null;
      const attendance=event ? (await tx.query<AttendanceRecord>('select $1::jsonb as event,presence,absence_reason as "absenceReason" from attendance_records where event_id=$2',[JSON.stringify(event),event.id])).rows[0] ?? null : null;
      const plannedAbsences=(await tx.query<PlannedAbsence>('select business_date::text as date,reason,version from attendance_planned_absences where child_id=$1 and business_date=$2 and ($3::boolean or guardian_id=$4) order by guardian_id',[childId,date,p.account.kind!=='GUARDIAN',p.account.id])).rows;
      return { ...day,attendance,plannedAbsences };
    });
  }

  async history(token: string,childId: string,date: string) {
    z.uuid().parse(childId); z.iso.date().parse(date);
    return this.children.withPolicy(token,async (tx,p) => {
      if (p.account.kind==='GUARDIAN') throw denied(); await this.learning.authorizedChild(tx,p,childId);
      return (await tx.query<AttendanceRecord>(`select jsonb_build_object('id',e.id,'revision',e.revision,'previousId',e.previous_id,'action',e.action,'statusId',e.status_id,'note',e.note,'reason',e.reason) as event,a.presence,a.absence_reason as "absenceReason"
        from attendance_records a join learning_events e on e.id=a.event_id join daily_slots s on s.id=e.slot_id join daily_snapshots d on d.id=s.snapshot_id where d.child_id=$1 and d.business_date=$2 order by e.revision`,[childId,date])).rows;
    });
  }

  async plannedAbsence(token: string,raw: unknown) {
    const input=plannedAbsenceSchema.parse(raw); const count=datesBetween(input.from,input.until);
    if (input.from<this.today() || count<1 || count>366) throw invalid();
    return this.children.withPolicy(token,async (tx,p) => {
      await this.requireEnabled(tx); const { child }=await requireGuardianChild(tx,p,input.childId,'read');
      const published=(await tx.query(`select 1 from daily_snapshots d join daily_slots s on s.snapshot_id=d.id join checkpoint_definitions cd on cd.id=s.definition_id join learning_events e on e.slot_id=s.id join attendance_records a on a.event_id=e.id where d.child_id=$1 and d.business_date between $2 and $3 and cd.kind='ATTENDANCE' limit 1`,[input.childId,input.from,input.until])).rowCount;
      if (published) throw new SafeError('STALE_VERSION','organization.stale',false,409);
      const before=(await tx.query('select business_date::text as date,reason,version from attendance_planned_absences where guardian_id=$1 and child_id=$2 and business_date between $3 and $4 order by business_date',[p.account.id,input.childId,input.from,input.until])).rows;
      await tx.query(`insert into attendance_planned_absences(guardian_id,child_id,business_date,reason)
        select $1,$2,d::date,$5 from generate_series($3::date,$4::date,'1 day') d
        on conflict(guardian_id,child_id,business_date) do update set reason=excluded.reason,version=attendance_planned_absences.version+1,updated_at=now()
        where attendance_planned_absences.reason is distinct from excluded.reason`,[p.account.id,input.childId,input.from,input.until,input.reason]);
      const after=(await tx.query<PlannedAbsence>('select business_date::text as date,reason,version from attendance_planned_absences where guardian_id=$1 and child_id=$2 and business_date between $3 and $4 order by business_date',[p.account.id,input.childId,input.from,input.until])).rows;
      await this.children.audit(tx,p,child,'attendance.planned_absence',before,{ from: input.from,until: input.until,days: after });
      // One event per changed submission, not one notification for every day in a range.
      if (JSON.stringify(before)!==JSON.stringify(after)) await tx.query(`insert into communication_events(id,kind,child_id,business_date,recipient_ids)
        values($1,'PLANNED_ABSENCE',$2,$3,array[$4::uuid])`,[randomUUID(),child.id,input.from,p.account.id]);
      return after;
    });
  }
}
