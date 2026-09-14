import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { addIsoDays, cairoIsoDate } from '@nursery/domain';
import { safetyFixture } from '../helpers/safety.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';
describe('Phase 07 health notes, authorized pickup, incidents and notification events',() => {
  let f: Awaited<ReturnType<typeof safetyFixture>>;
  beforeAll(async () => { f = await safetyFixture(); },30000);
  afterAll(async () => { await f?.close(); },30000);
  const request = (token: string,url: string,method: 'GET' | 'POST' | 'PUT' = 'GET',payload?: unknown) => f.app.inject({ method,url,headers: { cookie: `__Host-nursery_session=${token}`,origin: f.config.appOrigin,'content-type': 'application/json','x-csrf-token': keyedHash(f.config.sessionSecret,`session-csrf:${token}`) },...(payload === undefined ? {} : { payload }) });
  const today = () => cairoIsoDate();
  const person = (fullName: string,mobile = '01000000009',validFrom = today(),validUntil: string | null = today()) => ({ fullName,mobile,relationship: 'Uncle',validFrom,validUntil });
  const release = (authorizationId: string,calledGuardianId: string,callConfirmed = true) => ({ collector: { kind: 'AUTHORIZED_PERSON' as const,authorizationId },callConfirmed,calledGuardianId,note: null });

  it('A33: release recording needs a currently permitted collector, a confirmed call to a pickup-permitted guardian and no unresolved restriction; records are date-only and append-only',async () => {
    const family = await f.onboardFamily('PICK'); const recorder = await f.safetyStaff(['pickup.record'],[f.a.id]); const manager = await f.safetyStaff(['pickup.manage','pickup.record'],[f.a.id]);
    const oneDay = await f.safety.createAuthorization(family.first.token,family.childId,person('Uncle Sam'));
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0],false))).rejects.toMatchObject({ messageKey: 'safety.callNotConfirmed' });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[1]))).rejects.toMatchObject({ messageKey: 'safety.calledGuardianNotPermitted' });
    const record = await f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]));
    expect(record).toMatchObject({ businessDate: today(),collectorKind: 'AUTHORIZED_PERSON',collectorName: 'Uncle Sam',collectorRelationship: 'Uncle',calledGuardianName: 'Parent PICK' });
    expect(Object.keys(record)).toEqual(['id','businessDate','collectorKind','collectorName','collectorRelationship','calledGuardianName','note']);
    const columns = (await f.database.pool.query("select column_name from information_schema.columns where table_name='pickup_records'")).rows.map((r) => r.column_name as string);
    expect(columns.filter((c) => /arriv|depart|_time|clock/.test(c))).toEqual([]); expect(columns).toContain('business_date');
    await expect(f.database.pool.query('update pickup_records set note=$1 where id=$2',['rewrite',record.id])).rejects.toThrow(); await expect(f.database.pool.query('delete from pickup_records where id=$1',[record.id])).rejects.toThrow();
    const expired = await f.safety.createAuthorization(family.first.token,family.childId,person('Expired Aunt','01000000010',addIsoDays(today(),-3),addIsoDays(today(),-1)));
    const future = await f.safety.createAuthorization(family.first.token,family.childId,person('Future Aunt','01000000011',addIsoDays(today(),1),null));
    const removed = await f.safety.createAuthorization(family.first.token,family.childId,person('Removed Aunt','01000000012',today(),null)); await f.safety.deactivateAuthorization(family.first.token,removed.id,{ expectedVersion: 1 });
    const rejected = await f.safety.createAuthorization(family.first.token,family.childId,person('Rejected Aunt','01000000013',today(),null)); await f.safety.reviewAuthorization(manager.token,rejected.id,{ expectedVersion: 1,decision: 'REJECTED',note: 'Not recognized' });
    for (const id of [expired.id,future.id,removed.id,rejected.id,crypto.randomUUID()]) await expect(f.safety.recordPickup(recorder.token,family.childId,release(id,family.guardianIds[0]))).rejects.toMatchObject({ messageKey: 'safety.collectorNotPermitted' });
    const byName = await f.safety.createRestriction(manager.token,family.childId,{ kind: 'PROHIBITED_COLLECTOR',fullName: '  uncle   SAM ',mobile: null,summary: 'Court order on file',privateNote: 'CUSTODY PRIVATE DETAIL' });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]))).rejects.toMatchObject({ messageKey: 'safety.prohibitedCollector' });
    await f.safety.deactivateRestriction(manager.token,byName.id,{ expectedVersion: 1 });
    const byPhone = await f.safety.createRestriction(manager.token,family.childId,{ kind: 'PROHIBITED_COLLECTOR',fullName: 'Someone else',mobile: '+20 100 000 0009',summary: 'Phone match',privateNote: null });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]))).rejects.toMatchObject({ messageKey: 'safety.prohibitedCollector' });
    await f.safety.deactivateRestriction(manager.token,byPhone.id,{ expectedVersion: 1 });
    const review = await f.safety.createRestriction(manager.token,family.childId,{ kind: 'REVIEW_REQUIRED',fullName: null,mobile: null,summary: 'Management confirms every authorized person',privateNote: 'CUSTODY PRIVATE DETAIL' });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]))).rejects.toMatchObject({ messageKey: 'safety.unresolvedRestriction' });
    const staffView = await f.safety.staffView(recorder.token,family.childId);
    expect(staffView.pickup!.authorizations.find((a) => a.id === oneDay.id)!.blockers).toEqual(['REVIEW_REQUIRED']); expect(staffView.pickup!.restrictions[0]).toMatchObject({ summary: 'Management confirms every authorized person',privateNote: null });
    expect((await f.safety.staffView(manager.token,family.childId)).pickup!.restrictions[0].privateNote).toBe('CUSTODY PRIVATE DETAIL');
    const guardianView = await f.safety.guardianView(family.first.token,family.childId);
    expect(guardianView.pickup!.authorizations.find((a) => a.id === oneDay.id)!.pendingNurseryConfirmation).toBe(true); expect(JSON.stringify(guardianView)).not.toMatch(/PRIVATE DETAIL|summary|REVIEW_REQUIRED|PROHIBITED|blockers|review/);
    await expect(f.safety.reviewAuthorization(recorder.token,oneDay.id,{ expectedVersion: 1,decision: 'APPROVED',note: null })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await f.safety.reviewAuthorization(manager.token,oneDay.id,{ expectedVersion: 1,decision: 'APPROVED',note: 'Confirmed by phone with mother' });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]))).resolves.toMatchObject({ collectorName: 'Uncle Sam' });
    const later = await f.safety.createRestriction(manager.token,family.childId,{ kind: 'REVIEW_REQUIRED',fullName: null,mobile: null,summary: 'New situation',privateNote: null });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]))).rejects.toMatchObject({ messageKey: 'safety.unresolvedRestriction' });
    await f.safety.deactivateRestriction(manager.token,later.id,{ expectedVersion: 1 }); await f.safety.deactivateRestriction(manager.token,review.id,{ expectedVersion: 1 });
    await expect(f.safety.recordPickup(recorder.token,family.childId,{ collector: { kind: 'GUARDIAN',accountId: family.guardianIds[1] },callConfirmed: true,calledGuardianId: family.guardianIds[0],note: null })).rejects.toMatchObject({ messageKey: 'safety.collectorNotPermitted' });
    await expect(f.safety.recordPickup(recorder.token,family.childId,{ collector: { kind: 'GUARDIAN',accountId: family.guardianIds[0] },callConfirmed: true,calledGuardianId: family.guardianIds[0],note: 'Mother collected' })).resolves.toMatchObject({ collectorKind: 'GUARDIAN',collectorName: 'Parent PICK' });
    expect((await request(recorder.token,`/api/v1/children/${family.childId}/pickup-records`,'POST',{ ...release(oneDay.id,family.guardianIds[0]),departureTime: '15:00' })).statusCode).toBe(400);
    await f.children.lifecycle(f.root.token,family.childId,{ expectedVersion: 1,status: 'PAUSED',reason: 'Away',publicMessage: null });
    await expect(f.safety.recordPickup(recorder.token,family.childId,release(oneDay.id,family.guardianIds[0]))).rejects.toMatchObject({ messageKey: 'safety.childNotActive' });
    await f.children.lifecycle(f.root.token,family.childId,{ expectedVersion: 2,status: 'ACTIVE',reason: 'Back',publicMessage: null });
    expect((await f.database.pool.query("select count(*)::int as count from child_audit_events where child_id=$1 and event='pickup.recorded'",[family.childId])).rows[0].count).toBe(3);
  });

  it('A01/A03/A37: safety views and actions follow child, branch, classroom and guardian-link scope; private notes and foreign records never leak',async () => {
    const family = await f.onboardFamily('SCOPE'); const other = await f.onboardFamily('FOREIGN',f.b.id,f.classes[2].id);
    const branchB = await f.safetyStaff(['health.read','health.manage','pickup.record','pickup.manage','incidents.read','incidents.manage'],[f.b.id]);
    const wrongClass = await f.safetyStaff(['health.read','pickup.record','incidents.read'],[f.a.id],[f.classes[1].id],'CLASSROOM'); const rightClass = await f.safetyStaff(['health.read','pickup.record','incidents.read'],[f.a.id],[f.classes[0].id],'CLASSROOM');
    const nurse = await f.safetyStaff(['health.read','health.manage'],[f.a.id]); const plain = await f.safetyStaff([],[f.a.id]);
    const allergy = await f.safety.createHealthEntry(nurse.token,family.childId,{ kind: 'ALLERGY',title: 'Peanuts',body: 'Severe reaction; epinephrine in bag',mobile: null,severity: 'CRITICAL' });
    await f.safety.createHealthEntry(nurse.token,family.childId,{ kind: 'EMERGENCY_CONTACT',title: 'Grandmother',body: 'Call after guardians',mobile: '0100 000 0005',severity: 'INFO' });
    for (const token of [branchB.token,wrongClass.token,plain.token]) {
      expect((await request(token,`/api/v1/children/${family.childId}/safety`)).statusCode).toBe(403);
      expect((await request(token,`/api/v1/children/${family.childId}/health-entries`,'POST',{ kind: 'NOTE',title: 'x',body: '',mobile: null,severity: 'INFO' })).statusCode).toBe(403);
      expect((await request(token,`/api/v1/health-entries/${allergy.id}`,'PUT',{ expectedVersion: 1,title: 'Rewritten',body: '',mobile: null,severity: 'INFO' })).statusCode).toBe(403);
      expect((await request(token,`/api/v1/children/${family.childId}/incidents`,'POST',{ occurredOn: today(),occurredTime: '09:00',description: 'x',actionTaken: 'y',guardianInformed: false,contactMethod: null,followUp: null })).statusCode).toBe(403);
    }
    const scoped = await f.safety.staffView(rightClass.token,family.childId);
    expect(scoped.capabilities.sort()).toEqual(['health.read','incidents.read','pickup.record']); expect(scoped.health!.map((h) => h.title)).toEqual(['Peanuts','Grandmother']); expect(scoped.incidents).toEqual([]);
    expect(scoped.guardians.map((g) => [g.fullName,g.whatsappNumber])).toEqual([['Parent SCOPE','201000000000'],['Second SCOPE','201000000002']]); expect(JSON.stringify(scoped)).not.toMatch(/wa\.me|created_at|password|username/);
    expect((await request(rightClass.token,`/api/v1/children/${other.childId}/safety`)).statusCode).toBe(403);
    await expect(f.safety.guardianView(other.first.token,family.childId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.safety.createAuthorization(family.second.token,family.childId,person('Not allowed'))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await f.safety.guardianView(family.second.token,family.childId)).pickup).toBeNull();
    const shared = await f.safety.createAuthorization(family.first.token,family.childId,person('Shared Uncle','01000000014',today(),null));
    await expect(f.safety.deactivateAuthorization(other.first.token,shared.id,{ expectedVersion: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.safety.deactivateAuthorization(family.first.token,crypto.randomUUID(),{ expectedVersion: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(f.safety.createHealthEntry(family.first.token,family.childId,{ kind: 'NOTE',title: 'Parent note',body: '',mobile: null,severity: 'INFO' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const first = await f.safety.guardianView(family.first.token,family.childId); const second = await f.safety.guardianView(family.second.token,family.childId);
    expect(first.health).toEqual(second.health); expect(first.health!.map((h) => h.title)).toEqual(['Peanuts','Grandmother']); expect(first.pickup!.authorizations.map((a) => a.fullName)).toEqual(['Shared Uncle']);
    expect(first.pickup!.authorizations[0]).not.toHaveProperty('blockers'); expect(first.pickup!.authorizations[0]).not.toHaveProperty('review');
    await expect(f.safety.updateHealthEntry(nurse.token,allergy.id,{ expectedVersion: 1,title: 'Peanuts',body: 'Updated',mobile: '01000000005',severity: 'CRITICAL' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const results = await Promise.allSettled([f.safety.updateHealthEntry(nurse.token,allergy.id,{ expectedVersion: 1,title: 'Peanuts',body: 'First writer',mobile: null,severity: 'CRITICAL' }),f.safety.updateHealthEntry(nurse.token,allergy.id,{ expectedVersion: 1,title: 'Peanuts',body: 'Second writer',mobile: null,severity: 'CRITICAL' })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'STALE_VERSION' } });
    await f.safety.retireHealthEntry(nurse.token,allergy.id,{ expectedVersion: 2 });
    expect((await f.safety.guardianView(family.first.token,family.childId)).health!.map((h) => h.title)).toEqual(['Grandmother']);
    expect((await f.safety.staffView(nurse.token,family.childId)).health!.map((h) => [h.title,h.active])).toEqual([['Grandmother',true],['Peanuts',false]]);
    expect((await f.database.pool.query("select count(*)::int as count from child_audit_events where child_id=$1 and event like 'health.%'",[family.childId])).rows[0].count).toBe(4);
  });

  it('A31: disabling HEALTH keeps the staff emergency view, disabling PICKUP/INCIDENTS keeps history; all three block new entries and parent sections',async () => {
    const family = await f.onboardFamily('MODULE'); const staff = await f.safetyStaff(['health.read','health.manage','pickup.record','pickup.manage','incidents.read','incidents.manage'],[f.a.id]);
    // Exact current retained module catalog, including Phases18–19 additions.
    expect((await f.licensing.modules(f.root.token)).map((m) => m.moduleKey).sort()).toEqual(['ACTIVITIES','ATTENDANCE','CUSTOM_CHECKPOINTS','EXAMS','FINANCE','HEALTH','HOMEWORK','INCIDENTS','PAYROLL','PICKUP','TRANSPORT']);
    const contact = await f.safety.createHealthEntry(staff.token,family.childId,{ kind: 'EMERGENCY_CONTACT',title: 'Neighbour',body: '',mobile: '01000000015',severity: 'INFO' });
    const auth = await f.safety.createAuthorization(family.first.token,family.childId,person('Module Uncle','01000000016',today(),null));
    const incident = await f.safety.reportIncident(staff.token,family.childId,{ occurredOn: today(),occurredTime: '11:30',description: 'Bumped head on the slide',actionTaken: 'Ice applied; observed for 30 minutes',guardianInformed: true,contactMethod: 'CALL',followUp: null });
    await f.setModule('HEALTH',false);
    try {
      expect((await f.licensing.previewModuleChange(f.root.token,'HEALTH',{ enabled: false })).impacts.join(' ')).toMatch(/emergency/i);
      const emergency = await f.safety.staffView(staff.token,family.childId); expect(emergency.modules.health).toBe(false); expect(emergency.health!.map((h) => h.id)).toEqual([contact.id]);
      const parent = await f.safety.guardianView(family.first.token,family.childId); expect(parent.health).toBeNull(); expect(parent.modules.health).toBe(false); expect(parent.pickup).not.toBeNull();
      await expect(f.safety.createHealthEntry(staff.token,family.childId,{ kind: 'NOTE',title: 'Blocked',body: '',mobile: null,severity: 'INFO' })).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      await expect(f.safety.retireHealthEntry(staff.token,contact.id,{ expectedVersion: 1 })).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      expect((await request(staff.token,`/api/v1/children/${family.childId}/health-entries`,'POST',{ kind: 'NOTE',title: 'Blocked',body: '',mobile: null,severity: 'INFO' })).json()).toMatchObject({ code: 'MODULE_DISABLED',messageKey: 'safety.moduleDisabled' });
    } finally { await f.setModule('HEALTH',true); }
    expect((await f.safety.guardianView(family.first.token,family.childId)).health!.map((h) => h.id)).toEqual([contact.id]);
    await f.setModule('PICKUP',false);
    try {
      await expect(f.safety.createAuthorization(family.first.token,family.childId,person('Blocked'))).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      await expect(f.safety.recordPickup(staff.token,family.childId,release(auth.id,family.guardianIds[0]))).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      await expect(f.safety.createRestriction(staff.token,family.childId,{ kind: 'REVIEW_REQUIRED',fullName: null,mobile: null,summary: 'x',privateNote: null })).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      expect((await f.safety.staffView(staff.token,family.childId)).pickup!.authorizations.map((a) => a.id)).toEqual([auth.id]); expect((await f.safety.guardianView(family.first.token,family.childId)).pickup).toBeNull();
    } finally { await f.setModule('PICKUP',true); }
    await f.setModule('INCIDENTS',false);
    try {
      await expect(f.safety.reportIncident(staff.token,family.childId,{ occurredOn: today(),occurredTime: '12:00',description: 'x',actionTaken: 'y',guardianInformed: false,contactMethod: null,followUp: null })).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      await expect(f.safety.updateIncident(staff.token,incident.id,{ expectedVersion: 1,actionTaken: 'z',guardianInformed: true,contactMethod: 'CALL',followUp: null,status: 'CLOSED' })).rejects.toMatchObject({ code: 'MODULE_DISABLED' });
      expect((await f.safety.staffView(staff.token,family.childId)).incidents!.map((i) => i.id)).toEqual([incident.id]); expect((await f.safety.guardianView(family.first.token,family.childId)).incidents).toBeNull();
    } finally { await f.setModule('INCIDENTS',true); }
    expect((await f.safety.guardianView(family.first.token,family.childId)).incidents!.map((i) => i.id)).toEqual([incident.id]);
    expect((await f.database.pool.query("select count(*)::int as count from module_settings_history where module_key in ('HEALTH','PICKUP','INCIDENTS')")).rows[0].count).toBe(6);
  });

  it('incidents commit a durable notification event with a recipient snapshot and hint payload; updates are versioned and events append-only',async () => {
    const family = await f.onboardFamily('INCIDENT'); const teacher = await f.safetyStaff(['incidents.manage'],[f.a.id],[f.classes[0].id],'CLASSROOM'); const reader = await f.safetyStaff(['incidents.read'],[f.a.id]);
    const input = { occurredOn: today(),occurredTime: '10:15',description: 'Fell while running in the yard; scraped knee',actionTaken: 'Cleaned, plaster applied, comforted',guardianInformed: false,contactMethod: null,followUp: null };
    await expect(f.safety.reportIncident(teacher.token,family.childId,{ ...input,occurredOn: addIsoDays(today(),1) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(f.safety.reportIncident(reader.token,family.childId,input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const incident = await f.safety.reportIncident(teacher.token,family.childId,input); expect(incident).toMatchObject({ occurredTime: '10:15',status: 'OPEN',version: 1,guardianInformed: false,contactMethod: null });
    const events = async () => (await f.database.pool.query('select kind,resource_type,resource_id,resource_revision,recipient_ids,payload,branch_id from notification_events where child_id=$1 order by created_at',[family.childId])).rows;
    expect(await events()).toEqual([{ kind: 'incident.reported',resource_type: 'incident',resource_id: incident.id,resource_revision: 1,recipient_ids: [family.guardianIds[0]],payload: { childId: family.childId,incidentId: incident.id,occurredOn: today() },branch_id: f.a.id }]);
    expect(JSON.stringify((await events())[0].payload)).not.toMatch(/scraped|plaster/);
    await expect(f.safety.updateIncident(teacher.token,incident.id,{ expectedVersion: 2,actionTaken: 'x',guardianInformed: true,contactMethod: 'WHATSAPP',followUp: null,status: 'OPEN' })).rejects.toMatchObject({ code: 'STALE_VERSION' });
    await f.safety.updateIncident(teacher.token,incident.id,{ expectedVersion: 1,actionTaken: 'Cleaned, plaster applied, comforted; mother informed',guardianInformed: true,contactMethod: 'WHATSAPP',followUp: 'Mother will check tonight',status: 'CLOSED' });
    expect((await events()).map((e) => [e.kind,e.resource_revision])).toEqual([['incident.reported',1],['incident.updated',2]]);
    await expect(f.database.pool.query('delete from notification_events where child_id=$1',[family.childId])).rejects.toThrow(); await expect(f.database.pool.query("update notification_events set payload='{}' where child_id=$1",[family.childId])).rejects.toThrow();
    const reported = (await f.safety.guardianView(family.first.token,family.childId)).incidents!; expect(reported).toEqual((await f.safety.guardianView(family.second.token,family.childId)).incidents);
    expect(reported[0]).toMatchObject({ id: incident.id,status: 'CLOSED',contactMethod: 'WHATSAPP',followUp: 'Mother will check tonight',version: 2 });
    expect((await f.safety.staffView(reader.token,family.childId)).incidents!.map((i) => i.id)).toEqual([incident.id]);
    await f.children.moveClassroom(f.root.token,family.childId,{ expectedVersion: 1,classroomId: f.classes[1].id,reason: 'Moved' });
    await expect(f.safety.updateIncident(teacher.token,incident.id,{ expectedVersion: 2,actionTaken: 'x',guardianInformed: true,contactMethod: 'CALL',followUp: null,status: 'CLOSED' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const long = 'ع'.repeat(2000);
    expect((await request(f.root.token,`/api/v1/children/${family.childId}/incidents`,'POST',{ ...input,description: long,actionTaken: long,followUp: long })).statusCode).toBe(201);
    expect((await f.database.pool.query("select count(*)::int as count from child_audit_events where child_id=$1 and event like 'incident.%'",[family.childId])).rows[0].count).toBe(3);
  });
});
