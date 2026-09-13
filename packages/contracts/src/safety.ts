import { z } from 'zod';
import { versionSchema } from './organization.js';
import { mobileSchema, type LinkPermissions } from './children.js';
const name = z.string().trim().min(1).max(160);
const longText = (max: number) => z.string().trim().max(max);
export const safetyModuleKeys = ['HEALTH','PICKUP','INCIDENTS'] as const;
export type SafetyModuleKey = typeof safetyModuleKeys[number];
export type SafetyModules = { health: boolean; pickup: boolean; incidents: boolean };
export const healthEntryKinds = ['NOTE','ALLERGY','ALERT','EMERGENCY_CONTACT'] as const;
export const healthSeverities = ['INFO','CRITICAL'] as const;
// Emergency contacts carry a mobile; notes/alerts never do. No medication, dose or schedule fields exist (U19).
export const healthEntryInputSchema = z.object({ kind: z.enum(healthEntryKinds), title: name, body: longText(1000), mobile: mobileSchema.nullable(), severity: z.enum(healthSeverities) }).strict()
  .refine((v) => (v.kind === 'EMERGENCY_CONTACT') === (v.mobile !== null));
export const healthEntryUpdateSchema = z.object({ expectedVersion: versionSchema, title: name, body: longText(1000), mobile: mobileSchema.nullable(), severity: z.enum(healthSeverities) }).strict();
export const versionOnlySchema = z.object({ expectedVersion: versionSchema }).strict();
export const pickupAuthorizationInputSchema = z.object({ fullName: name, mobile: mobileSchema, relationship: z.string().trim().min(1).max(80), validFrom: z.iso.date(), validUntil: z.iso.date().nullable() }).strict()
  .refine((v) => v.validUntil === null || v.validUntil >= v.validFrom);
export const pickupReviewSchema = z.object({ expectedVersion: versionSchema, decision: z.enum(['APPROVED','REJECTED']), note: longText(500).nullable() }).strict();
export const pickupRestrictionKinds = ['PROHIBITED_COLLECTOR','REVIEW_REQUIRED'] as const;
export const pickupRestrictionInputSchema = z.object({ kind: z.enum(pickupRestrictionKinds), fullName: name.nullable(), mobile: mobileSchema.nullable(), summary: z.string().trim().min(1).max(200), privateNote: longText(1000).nullable() }).strict()
  .refine((v) => v.kind !== 'PROHIBITED_COLLECTOR' || v.fullName !== null);
export const pickupCollectorSchema = z.discriminatedUnion('kind',[
  z.object({ kind: z.literal('AUTHORIZED_PERSON'), authorizationId: z.uuid() }).strict(),
  z.object({ kind: z.literal('GUARDIAN'), accountId: z.uuid() }).strict()
]);
// callConfirmed stays a boolean so a missing confirmation is a distinct business rejection, not a generic schema error.
export const pickupRecordInputSchema = z.object({ collector: pickupCollectorSchema, callConfirmed: z.boolean(), calledGuardianId: z.uuid(), note: longText(500).nullable() }).strict();
export const incidentContactMethods = ['CALL','WHATSAPP','IN_PERSON','IN_APP'] as const;
const wallClock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const informed = { guardianInformed: z.boolean(), contactMethod: z.enum(incidentContactMethods).nullable(), followUp: longText(2000).nullable() };
export const incidentInputSchema = z.object({ occurredOn: z.iso.date(), occurredTime: wallClock, description: z.string().trim().min(1).max(2000), actionTaken: z.string().trim().min(1).max(2000), ...informed }).strict()
  .refine((v) => v.guardianInformed === (v.contactMethod !== null));
export const incidentUpdateSchema = z.object({ expectedVersion: versionSchema, actionTaken: z.string().trim().min(1).max(2000), ...informed, status: z.enum(['OPEN','CLOSED']) }).strict()
  .refine((v) => v.guardianInformed === (v.contactMethod !== null));
export type HealthEntry = { id: string; kind: typeof healthEntryKinds[number]; title: string; body: string; mobile: string | null; severity: typeof healthSeverities[number]; active: boolean; version: number };
export type PickupBlocker = 'INACTIVE' | 'REJECTED' | 'NOT_YET_VALID' | 'EXPIRED' | 'PROHIBITED_COLLECTOR' | 'REVIEW_REQUIRED';
export type PickupAuthorizationBase = { id: string; fullName: string; mobile: string; relationship: string; validFrom: string; validUntil: string | null; active: boolean; version: number };
export type PickupAuthorization = PickupAuthorizationBase & { review: { decision: 'APPROVED' | 'REJECTED'; note: string | null } | null; blockers: PickupBlocker[] };
export type GuardianPickupAuthorization = PickupAuthorizationBase & { pendingNurseryConfirmation: boolean };
export type PickupRestriction = { id: string; kind: typeof pickupRestrictionKinds[number]; fullName: string | null; mobile: string | null; summary: string; privateNote: string | null; active: boolean; version: number };
export type PickupRecord = { id: string; businessDate: string; collectorKind: 'AUTHORIZED_PERSON' | 'GUARDIAN'; collectorName: string; collectorRelationship: string; calledGuardianName: string; note: string | null };
export type Incident = { id: string; occurredOn: string; occurredTime: string; description: string; actionTaken: string; guardianInformed: boolean; contactMethod: typeof incidentContactMethods[number] | null; followUp: string | null; status: 'OPEN' | 'CLOSED'; version: number };
export type SafetyGuardian = { id: string; fullName: string; mobile: string; whatsappNumber: string | null; relationship: string; permissions: LinkPermissions };
export type ChildSafetyView = { modules: SafetyModules; capabilities: string[]; child: { id: string; fullName: string; status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }; guardians: SafetyGuardian[]; health: HealthEntry[] | null; pickup: { authorizations: PickupAuthorization[]; restrictions: PickupRestriction[]; records: PickupRecord[] } | null; incidents: Incident[] | null };
export type GuardianSafetyView = { modules: SafetyModules; permissions: LinkPermissions; health: HealthEntry[] | null; pickup: { authorizations: GuardianPickupAuthorization[] } | null; incidents: Incident[] | null };
