import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate, normalizeWhatsAppNumber } from '@nursery/domain';
import { healthEntryInputSchema, healthEntryUpdateSchema, versionOnlySchema, pickupAuthorizationInputSchema, pickupReviewSchema, pickupRestrictionInputSchema, pickupRecordInputSchema, incidentInputSchema, incidentUpdateSchema,
  type Capability, type Child, type ChildSafetyView, type GuardianSafetyView, type HealthEntry, type Incident, type PickupAuthorization, type PickupBlocker, type PickupRecord, type PickupRestriction, type SafetyGuardian } from '@nursery/contracts';
import type { ChildService } from '../children/service.js';
import { denied, stale, type Policy } from '../organization/policy.js';
import { requireChild, requireGuardianChild, resolveChild } from '../children/policy.js';
import { hasChildCapability, loadModules, requireModule, safetyCapabilities, safetyChild, staffChild } from './policy.js';
import { SafeError } from '../../errors.js';
const uuid = z.uuid();
const invalid = () => new SafeError('VALIDATION_ERROR','safety.invalid',false,400);
const rule = (key: string) => new SafeError('VALIDATION_ERROR',key,false,409);
type AuthorizationRow = { id: string; child_id: string; full_name: string; mobile: string; relationship: string; valid_from: string; valid_until: string | null; active: boolean; review_decision: 'APPROVED' | 'REJECTED' | null; reviewed_at: Date | null; review_note: string | null; version: number };
type RestrictionRow = { id: string; kind: PickupRestriction['kind']; full_name: string | null; mobile: string | null; summary: string; private_note: string | null; active: boolean; version: number; created_at: Date };
const authorizationProjection = 'id,child_id,full_name,mobile,relationship,valid_from::text as valid_from,valid_until::text as valid_until,active,review_decision,reviewed_at,review_note,version';
const incidentProjection = 'id,occurred_on::text as "occurredOn",to_char(occurred_time,\'HH24:MI\') as "occurredTime",description,action_taken as "actionTaken",guardian_informed as "guardianInformed",contact_method as "contactMethod",follow_up as "followUp",status,version';
const normalizeName = (value: string) => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const samePhone = (a: string, b: string) => { const x = normalizeWhatsAppNumber(a) ?? a.replace(/\D/g,''); const y = normalizeWhatsAppNumber(b) ?? b.replace(/\D/g,''); return x.length > 0 && x === y; };

export class SafetyService {
  constructor(readonly children: ChildService) {}
  private withPolicy<T>(token: string, work: (tx: Transaction,p: Policy) => Promise<T>, targets: string[] = []) { return this.children.withPolicy(token,work,targets); }
  private audit(tx: Transaction,p: Policy,child: Child,event: string,before: unknown,after: unknown) { return this.children.audit(tx,p,child,event,before,after); }

  // ---- Shared projections ----
  private async guardians(tx: Transaction,childId: string): Promise<SafetyGuardian[]> {
    const rows = (await tx.query<Omit<SafetyGuardian,'whatsappNumber'>>(`select g.account_id as id,g.full_name as "fullName",g.mobile,l.relationship,
      json_build_object('read',l.can_read,'finance',l.can_finance,'pickup',l.can_pickup,'notify',l.can_notify) as permissions
      from guardian_child_links l join guardian_profiles g on g.account_id=l.guardian_id where l.child_id=$1 and l.active order by g.full_name,g.account_id`,[childId])).rows;
    return rows.map((g) => ({ ...g,whatsappNumber: normalizeWhatsAppNumber(g.mobile) }));
  }
  private async healthEntries(tx: Transaction,childId: string,activeOnly: boolean): Promise<HealthEntry[]> {
    return (await tx.query<HealthEntry>(`select id,kind,title,body,mobile,severity,active,version from health_entries where child_id=$1 and ($2::boolean is false or active)
      order by active desc,(severity='CRITICAL') desc,array_position(array['ALLERGY','ALERT','EMERGENCY_CONTACT','NOTE'],kind),title,id`,[childId,activeOnly])).rows;
  }
  private async restrictionRows(tx: Transaction,childId: string): Promise<RestrictionRow[]> {
    return (await tx.query<RestrictionRow>('select id,kind,full_name,mobile,summary,private_note,active,version,created_at from pickup_restrictions where child_id=$1 order by active desc,created_at desc,id',[childId])).rows;
  }
  private blockers(a: AuthorizationRow,today: string,restrictions: RestrictionRow[]): PickupBlocker[] {
    const found = new Set<PickupBlocker>();
    if (!a.active) found.add('INACTIVE');
    if (a.review_decision === 'REJECTED') found.add('REJECTED');
    if (a.valid_from > today) found.add('NOT_YET_VALID');
    if (a.valid_until !== null && a.valid_until < today) found.add('EXPIRED');
    for (const r of restrictions.filter((r) => r.active)) {
      if (r.kind === 'PROHIBITED_COLLECTOR') { if ((r.full_name && normalizeName(r.full_name) === normalizeName(a.full_name)) || (r.mobile && samePhone(r.mobile,a.mobile))) found.add('PROHIBITED_COLLECTOR'); }
      // Every active review requirement must be approved after it was recorded; older approvals do not cover newer restrictions.
      else if (a.review_decision !== 'APPROVED' || !a.reviewed_at || a.reviewed_at.getTime() < r.created_at.getTime()) found.add('REVIEW_REQUIRED');
    }
    return [...found];
  }
  private async authorizations(tx: Transaction,childId: string,today: string,activeOnly: boolean): Promise<PickupAuthorization[]> {
    const restrictions = await this.restrictionRows(tx,childId);
    const rows = (await tx.query<AuthorizationRow>(`select ${authorizationProjection} from pickup_authorizations where child_id=$1 and ($2::boolean is false or active) order by active desc,valid_from desc,full_name,id`,[childId,activeOnly])).rows;
    return rows.map((a) => ({ id: a.id,fullName: a.full_name,mobile: a.mobile,relationship: a.relationship,validFrom: a.valid_from,validUntil: a.valid_until,active: a.active,version: a.version,
      review: a.review_decision ? { decision: a.review_decision,note: a.review_note } : null,blockers: this.blockers(a,today,restrictions) }));
  }
  private async records(tx: Transaction,childId: string): Promise<PickupRecord[]> {
    // Technical created_at orders same-day records but is never returned; only the business date is a record field.
    return (await tx.query<PickupRecord>(`select r.id,r.business_date::text as "businessDate",r.collector_kind as "collectorKind",r.collector_name_snapshot as "collectorName",r.collector_relationship_snapshot as "collectorRelationship",g.full_name as "calledGuardianName",r.note
      from pickup_records r join guardian_profiles g on g.account_id=r.called_guardian_id where r.child_id=$1 order by r.business_date desc,r.created_at desc,r.id limit 100`,[childId])).rows;
  }
  private async incidents(tx: Transaction,childId: string): Promise<Incident[]> {
    return (await tx.query<Incident>(`select ${incidentProjection} from incidents where child_id=$1 order by occurred_on desc,occurred_time desc,id limit 100`,[childId])).rows;
  }

  // ---- Views ----
  async staffView(token: string,id: string): Promise<ChildSafetyView> {
    uuid.parse(id);
    return this.withPolicy(token,async (tx,p) => {
      const child = await resolveChild(tx,id); const capabilities = safetyCapabilities.filter((c) => hasChildCapability(p,c,child));
      if (!capabilities.length) throw denied();
      const can = (...keys: Capability[]) => keys.some((k) => capabilities.includes(k)); const today = cairoIsoDate();
      // The health section stays readable while the module is disabled: this is the documented staff emergency view (D26).
      return { modules: await loadModules(tx),capabilities,child: { id: child.id,fullName: child.fullName,status: child.status },guardians: await this.guardians(tx,id),
        health: can('health.read','health.manage') ? await this.healthEntries(tx,id,false) : null,
        pickup: can('pickup.record','pickup.manage') ? { authorizations: await this.authorizations(tx,id,today,false),
          restrictions: (await this.restrictionRows(tx,id)).map((r) => ({ id: r.id,kind: r.kind,fullName: r.full_name,mobile: r.mobile,summary: r.summary,privateNote: can('pickup.manage') ? r.private_note : null,active: r.active,version: r.version })),
          records: await this.records(tx,id) } : null,
        incidents: can('incidents.read','incidents.manage') ? await this.incidents(tx,id) : null };
    });
  }
  async guardianView(token: string,id: string): Promise<GuardianSafetyView> {
    uuid.parse(id);
    return this.withPolicy(token,async (tx,p) => {
      const { permissions } = await requireGuardianChild(tx,p,id,'read'); const modules = await loadModules(tx);
      const authorizations = modules.pickup && permissions.pickup ? await this.authorizations(tx,id,cairoIsoDate(),true) : null;
      // Guardians learn only that the nursery must confirm a person; restriction kinds, notes and prohibited identities stay private.
      return { modules,permissions,health: modules.health ? await this.healthEntries(tx,id,true) : null,
        pickup: authorizations ? { authorizations: authorizations.map((a) => ({ id: a.id,fullName: a.fullName,mobile: a.mobile,relationship: a.relationship,validFrom: a.validFrom,validUntil: a.validUntil,active: a.active,version: a.version,
          pendingNurseryConfirmation: a.blockers.some((b) => b === 'PROHIBITED_COLLECTOR' || b === 'REVIEW_REQUIRED') })) } : null,
        incidents: modules.incidents ? await this.incidents(tx,id) : null };
    });
  }

  // ---- Health notes, allergies/alerts, emergency contacts (staff only; guardians read through the view) ----
  async createHealthEntry(token: string,childId: string,raw: unknown) {
    uuid.parse(childId); const input = healthEntryInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await staffChild(tx,p,childId,'health.manage'); requireModule(await loadModules(tx),'health');
      if (child.status === 'ARCHIVED') throw invalid();
      const id = randomUUID();
      await tx.query('insert into health_entries(id,child_id,branch_id,kind,title,body,mobile,severity,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,childId,child.branchId,input.kind,input.title,input.body,input.mobile,input.severity,p.account.id]);
      await this.audit(tx,p,child,'health.entry_created',null,{ id,...input }); return { id,version: 1 };
    });
  }
  private async healthEntryFor(tx: Transaction,p: Policy,id: string) {
    const entry = (await tx.query<HealthEntry & { child_id: string }>('select id,child_id,kind,title,body,mobile,severity,active,version from health_entries where id=$1 for update',[id])).rows[0];
    if (!entry) throw denied();
    const child = await resolveChild(tx,entry.child_id); requireChild(p,'health.manage',child); requireModule(await loadModules(tx),'health');
    return { entry,child };
  }
  async updateHealthEntry(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = healthEntryUpdateSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const { entry,child } = await this.healthEntryFor(tx,p,id); if (entry.version !== input.expectedVersion) throw stale();
      if (!entry.active || (entry.kind === 'EMERGENCY_CONTACT') !== (input.mobile !== null)) throw invalid();
      await tx.query('update health_entries set title=$2,body=$3,mobile=$4,severity=$5,version=version+1 where id=$1',[id,input.title,input.body,input.mobile,input.severity]);
      await this.audit(tx,p,child,'health.entry_updated',entry,input); return { version: entry.version+1 };
    });
  }
  async retireHealthEntry(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = versionOnlySchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const { entry,child } = await this.healthEntryFor(tx,p,id); if (entry.version !== input.expectedVersion) throw stale(); if (!entry.active) throw invalid();
      await tx.query('update health_entries set active=false,version=version+1 where id=$1',[id]);
      await this.audit(tx,p,child,'health.entry_retired',entry,null); return { version: entry.version+1 };
    });
  }

  // ---- Authorized pickup people: guardians with pickup permission or management (pickup.manage) ----
  async createAuthorization(token: string,childId: string,raw: unknown) {
    uuid.parse(childId); const input = pickupAuthorizationInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const actor = await safetyChild(tx,p,childId,{ staff: ['pickup.manage'],guardian: 'pickup' }); requireModule(await loadModules(tx),'pickup');
      if (actor.child.status !== 'ACTIVE') throw invalid();
      const id = randomUUID();
      await tx.query('insert into pickup_authorizations(id,child_id,branch_id,full_name,mobile,relationship,valid_from,valid_until,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,childId,actor.child.branchId,input.fullName,input.mobile,input.relationship,input.validFrom,input.validUntil,p.account.id]);
      await this.audit(tx,p,actor.child,'pickup.authorization_created',null,{ id,...input,actorKind: actor.kind }); return { id,version: 1 };
    });
  }
  private async authorizationRow(tx: Transaction,id: string) {
    const row = (await tx.query<AuthorizationRow>(`select ${authorizationProjection} from pickup_authorizations where id=$1 for update`,[id])).rows[0];
    if (!row) throw denied(); return row;
  }
  async deactivateAuthorization(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = versionOnlySchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const row = await this.authorizationRow(tx,id); const actor = await safetyChild(tx,p,row.child_id,{ staff: ['pickup.manage'],guardian: 'pickup' }); requireModule(await loadModules(tx),'pickup');
      if (row.version !== input.expectedVersion) throw stale(); if (!row.active) throw invalid();
      await tx.query('update pickup_authorizations set active=false,version=version+1 where id=$1',[id]);
      await this.audit(tx,p,actor.child,'pickup.authorization_deactivated',{ id,fullName: row.full_name },{ actorKind: actor.kind }); return { version: row.version+1 };
    });
  }
  async reviewAuthorization(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = pickupReviewSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const row = await this.authorizationRow(tx,id); const child = await staffChild(tx,p,row.child_id,'pickup.manage'); requireModule(await loadModules(tx),'pickup');
      if (row.version !== input.expectedVersion) throw stale(); if (!row.active) throw invalid();
      await tx.query('update pickup_authorizations set review_decision=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4,version=version+1 where id=$1',[id,input.decision,p.account.id,input.note]);
      await this.audit(tx,p,child,'pickup.authorization_reviewed',{ id,decision: row.review_decision },input); return { version: row.version+1 };
    });
  }

  // ---- Management restrictions and prohibited collectors (pickup.manage) ----
  async createRestriction(token: string,childId: string,raw: unknown) {
    uuid.parse(childId); const input = pickupRestrictionInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await staffChild(tx,p,childId,'pickup.manage'); requireModule(await loadModules(tx),'pickup'); if (child.status === 'ARCHIVED') throw invalid();
      const id = randomUUID();
      await tx.query('insert into pickup_restrictions(id,child_id,branch_id,kind,full_name,mobile,summary,private_note,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,childId,child.branchId,input.kind,input.fullName,input.mobile,input.summary,input.privateNote,p.account.id]);
      await this.audit(tx,p,child,'pickup.restriction_created',null,{ id,...input }); return { id,version: 1 };
    });
  }
  async deactivateRestriction(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = versionOnlySchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const row = (await tx.query<{ child_id: string; active: boolean; version: number; kind: string }>('select child_id,active,version,kind from pickup_restrictions where id=$1 for update',[id])).rows[0];
      if (!row) throw denied(); const child = await staffChild(tx,p,row.child_id,'pickup.manage'); requireModule(await loadModules(tx),'pickup');
      if (row.version !== input.expectedVersion) throw stale(); if (!row.active) throw invalid();
      await tx.query('update pickup_restrictions set active=false,version=version+1 where id=$1',[id]);
      await this.audit(tx,p,child,'pickup.restriction_deactivated',{ id,kind: row.kind },null); return { version: row.version+1 };
    });
  }

  // ---- Release recording (pickup.record): permitted collector + confirmed call to a pickup-permitted guardian; business date only ----
  async recordPickup(token: string,childId: string,raw: unknown): Promise<PickupRecord> {
    uuid.parse(childId); const input = pickupRecordInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await staffChild(tx,p,childId,'pickup.record'); requireModule(await loadModules(tx),'pickup');
      if (child.status !== 'ACTIVE') throw rule('safety.childNotActive');
      const today = cairoIsoDate(); const link = (accountId: string) => tx.query<{ full_name: string; relationship: string }>('select g.full_name,l.relationship from guardian_child_links l join guardian_profiles g on g.account_id=l.guardian_id where l.guardian_id=$1 and l.child_id=$2 and l.active and l.can_pickup for share',[accountId,childId]).then((r) => r.rows[0]);
      let collector: { name: string; relationship: string; authorizationId: string | null; guardianId: string | null };
      if (input.collector.kind === 'AUTHORIZED_PERSON') {
        const a = (await tx.query<AuthorizationRow>(`select ${authorizationProjection} from pickup_authorizations where id=$1 and child_id=$2 for share`,[input.collector.authorizationId,childId])).rows[0];
        if (!a) throw rule('safety.collectorNotPermitted');
        const blockers = this.blockers(a,today,await this.restrictionRows(tx,childId));
        if (blockers.includes('PROHIBITED_COLLECTOR')) throw rule('safety.prohibitedCollector');
        if (blockers.includes('REVIEW_REQUIRED')) throw rule('safety.unresolvedRestriction');
        if (blockers.length) throw rule('safety.collectorNotPermitted');
        collector = { name: a.full_name,relationship: a.relationship,authorizationId: a.id,guardianId: null };
      } else {
        const g = await link(input.collector.accountId); if (!g) throw rule('safety.collectorNotPermitted');
        collector = { name: g.full_name,relationship: g.relationship,authorizationId: null,guardianId: input.collector.accountId };
      }
      if (!input.callConfirmed) throw rule('safety.callNotConfirmed');
      if (!(await link(input.calledGuardianId))) throw rule('safety.calledGuardianNotPermitted');
      const id = randomUUID();
      await tx.query('insert into pickup_records(id,child_id,branch_id,business_date,collector_kind,authorization_id,collector_guardian_id,collector_name_snapshot,collector_relationship_snapshot,called_guardian_id,call_confirmed,note,recorded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12)',
        [id,childId,child.branchId,today,input.collector.kind,collector.authorizationId,collector.guardianId,collector.name,collector.relationship,input.calledGuardianId,input.note,p.account.id]);
      await this.audit(tx,p,child,'pickup.recorded',null,{ id,businessDate: today,collectorKind: input.collector.kind,collectorName: collector.name,calledGuardianId: input.calledGuardianId });
      return (await this.records(tx,childId)).find((r) => r.id === id)!;
    });
  }

  // ---- Incidents (incidents.manage) with a durable notification event for Phase 12 ----
  private async notify(tx: Transaction,child: Child,kind: string,resourceId: string,revision: number,payload: Record<string,unknown>) {
    const recipients = (await tx.query<{ guardian_id: string }>('select guardian_id from guardian_child_links where child_id=$1 and active and can_notify order by guardian_id',[child.id])).rows.map((r) => r.guardian_id);
    await tx.query('insert into notification_events(id,kind,child_id,branch_id,resource_type,resource_id,resource_revision,recipient_ids,payload) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),kind,child.id,child.branchId,'incident',resourceId,revision,recipients,JSON.stringify(payload)]);
  }
  async reportIncident(token: string,childId: string,raw: unknown): Promise<Incident> {
    uuid.parse(childId); const input = incidentInputSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const child = await staffChild(tx,p,childId,'incidents.manage'); requireModule(await loadModules(tx),'incidents');
      if (child.status !== 'ACTIVE' || input.occurredOn > cairoIsoDate()) throw invalid();
      const id = randomUUID();
      await tx.query('insert into incidents(id,child_id,branch_id,classroom_id,occurred_on,occurred_time,description,action_taken,guardian_informed,contact_method,follow_up,reported_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [id,childId,child.branchId,child.classroomId,input.occurredOn,input.occurredTime,input.description,input.actionTaken,input.guardianInformed,input.contactMethod,input.followUp,p.account.id]);
      // The event is committed with the record; live delivery is Phase 12's concern and its absence never loses the report.
      await this.notify(tx,child,'incident.reported',id,1,{ childId,incidentId: id,occurredOn: input.occurredOn });
      await this.audit(tx,p,child,'incident.reported',null,{ id,...input });
      return (await tx.query<Incident>(`select ${incidentProjection} from incidents where id=$1`,[id])).rows[0];
    });
  }
  async updateIncident(token: string,id: string,raw: unknown) {
    uuid.parse(id); const input = incidentUpdateSchema.parse(raw);
    return this.withPolicy(token,async (tx,p) => {
      const childId = (await tx.query<{ child_id: string }>('select child_id from incidents where id=$1 for update',[id])).rows[0]?.child_id;
      if (!childId) throw denied(); const child = await staffChild(tx,p,childId,'incidents.manage'); requireModule(await loadModules(tx),'incidents');
      const before = (await tx.query<Incident>(`select ${incidentProjection} from incidents where id=$1`,[id])).rows[0];
      if (before.version !== input.expectedVersion) throw stale();
      await tx.query('update incidents set action_taken=$2,guardian_informed=$3,contact_method=$4,follow_up=$5,status=$6,version=version+1 where id=$1',[id,input.actionTaken,input.guardianInformed,input.contactMethod,input.followUp,input.status]);
      await this.notify(tx,child,'incident.updated',id,before.version+1,{ childId: child.id,incidentId: id,occurredOn: before.occurredOn });
      await this.audit(tx,p,child,'incident.updated',before,input); return { version: before.version+1 };
    });
  }
}
