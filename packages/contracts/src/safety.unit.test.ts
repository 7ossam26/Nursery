import { expect, it } from 'vitest';
import { healthEntryInputSchema, pickupAuthorizationInputSchema, pickupRecordInputSchema, pickupRestrictionInputSchema, incidentInputSchema, incidentUpdateSchema } from './safety.js';
it('health entries pair mobiles only with emergency contacts and reject medication-style extra fields', () => {
  expect(healthEntryInputSchema.safeParse({ kind: 'ALLERGY',title: 'Peanuts',body: 'Carries epinephrine',mobile: null,severity: 'CRITICAL' }).success).toBe(true);
  expect(healthEntryInputSchema.safeParse({ kind: 'EMERGENCY_CONTACT',title: 'Grandmother',body: 'Call first',mobile: '01000000005',severity: 'INFO' }).success).toBe(true);
  expect(healthEntryInputSchema.safeParse({ kind: 'NOTE',title: 'Asthma',body: '',mobile: '01000000005',severity: 'INFO' }).success).toBe(false);
  expect(healthEntryInputSchema.safeParse({ kind: 'EMERGENCY_CONTACT',title: 'Aunt',body: '',mobile: null,severity: 'INFO' }).success).toBe(false);
  expect(healthEntryInputSchema.safeParse({ kind: 'NOTE',title: 'Asthma',body: '',mobile: null,severity: 'INFO',doseMg: 5 }).success).toBe(false);
});
it('pickup authorizations need name/phone/relationship and an ordered validity; one-day authorization is from=until', () => {
  const person = { fullName: 'Uncle',mobile: '01000000006',relationship: 'Uncle',validFrom: '2026-09-14',validUntil: '2026-09-14' };
  expect(pickupAuthorizationInputSchema.safeParse(person).success).toBe(true);
  expect(pickupAuthorizationInputSchema.safeParse({ ...person,validUntil: null }).success).toBe(true);
  expect(pickupAuthorizationInputSchema.safeParse({ ...person,validUntil: '2026-09-13' }).success).toBe(false);
  expect(pickupAuthorizationInputSchema.safeParse({ ...person,mobile: 'none' }).success).toBe(false);
  expect(pickupAuthorizationInputSchema.safeParse({ ...person,reviewDecision: 'APPROVED' }).success).toBe(false);
});
it('release recording carries a collector, a boolean call confirmation and the called guardian but no clock fields', () => {
  const record = { collector: { kind: 'AUTHORIZED_PERSON',authorizationId: crypto.randomUUID() },callConfirmed: true,calledGuardianId: crypto.randomUUID(),note: null };
  expect(pickupRecordInputSchema.safeParse(record).success).toBe(true);
  expect(pickupRecordInputSchema.safeParse({ ...record,callConfirmed: false }).success).toBe(true);
  expect(pickupRecordInputSchema.safeParse({ ...record,collector: { kind: 'GUARDIAN',accountId: crypto.randomUUID() } }).success).toBe(true);
  expect(pickupRecordInputSchema.safeParse({ ...record,departureTime: '15:30' }).success).toBe(false);
  expect(pickupRecordInputSchema.safeParse({ ...record,businessDate: '2026-09-14' }).success).toBe(false);
  expect(pickupRestrictionInputSchema.safeParse({ kind: 'PROHIBITED_COLLECTOR',fullName: null,mobile: '01000000007',summary: 'Court order',privateNote: null }).success).toBe(false);
  expect(pickupRestrictionInputSchema.safeParse({ kind: 'REVIEW_REQUIRED',fullName: null,mobile: null,summary: 'Custody review',privateNote: 'Private detail' }).success).toBe(true);
});
it('incidents keep informed status and contact method consistent and use wall-clock occurrence time', () => {
  const incident = { occurredOn: '2026-09-14',occurredTime: '10:15',description: 'Fell in the yard',actionTaken: 'Cleaned and applied ice',guardianInformed: true,contactMethod: 'CALL',followUp: null };
  expect(incidentInputSchema.safeParse(incident).success).toBe(true);
  expect(incidentInputSchema.safeParse({ ...incident,guardianInformed: false,contactMethod: null }).success).toBe(true);
  expect(incidentInputSchema.safeParse({ ...incident,guardianInformed: false }).success).toBe(false);
  expect(incidentInputSchema.safeParse({ ...incident,contactMethod: null }).success).toBe(false);
  expect(incidentInputSchema.safeParse({ ...incident,occurredTime: '25:00' }).success).toBe(false);
  expect(incidentInputSchema.safeParse({ ...incident,photo: 'data:image/png;base64,AAAA' }).success).toBe(false);
  expect(incidentUpdateSchema.safeParse({ expectedVersion: 1,actionTaken: 'Observed',guardianInformed: true,contactMethod: 'WHATSAPP',followUp: 'Parent will visit doctor',status: 'CLOSED' }).success).toBe(true);
});
