import { z } from 'zod';
import { usernameSchema } from './identity.js';
import { versionSchema } from './organization.js';
const name = z.string().trim().min(1).max(160);
const mobile = z.string().trim().min(7).max(40).regex(/^\+?[0-9 ()-]+$/).refine((value) => value.replace(/\D/g,'').length >= 7);
const reason = z.string().trim().min(1).max(500);
export const contactInputSchema = z.object({ fullName: name, mobile, relationship: z.string().trim().min(1).max(80) }).strict();
export const guardianProfileSchema = z.object({ fullName: name, mobile }).strict();
export const guardianUpdateSchema = z.object({ expectedVersion: versionSchema, profile: guardianProfileSchema }).strict();
export const linkPermissionsSchema = z.object({ read: z.boolean(), finance: z.boolean(), pickup: z.boolean(), notify: z.boolean() }).strict();
export const defaultLinkPermissions = { read: true, finance: false, pickup: false, notify: true };
export type LinkPermissions = z.infer<typeof linkPermissionsSchema>;
export const childStateSchema = z.enum(['ACTIVE','PAUSED','ARCHIVED']);
export const childInputSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/), fullName: name, birthDate: z.iso.date(), branchId: z.uuid(), classroomId: z.uuid().nullable(), contacts: z.array(contactInputSchema).max(10) }).strict();
export const onboardingGuardianSchema = z.discriminatedUnion('kind',[
 z.object({ kind: z.literal('NEW'), username: usernameSchema, profile: guardianProfileSchema }).strict(),
 z.object({ kind: z.literal('EXISTING'), accountId: z.uuid(), profile: guardianProfileSchema.optional() }).strict()
]);
export const onboardingInputSchema = z.object({ operationId: z.uuid(), guardians: z.array(onboardingGuardianSchema).min(1).max(4), children: z.array(z.object({ child: childInputSchema, links: z.array(z.object({ guardianIndex: z.number().int().min(0).max(3), relationship: z.string().trim().min(1).max(80), permissions: linkPermissionsSchema }).strict()).min(1).max(4) }).strict()).min(1).max(10) }).strict()
 .refine((v) => v.children.every((c) => new Set(c.links.map((l) => l.guardianIndex)).size === c.links.length && c.links.every((l) => l.guardianIndex < v.guardians.length)) && v.guardians.every((_,i) => v.children.some((c) => c.links.some((l) => l.guardianIndex === i))));
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export type OnboardingResult = { childIds: string[]; guardianIds: string[]; credentials: { id: string; username: string; temporaryPassword: string }[]; replayed: boolean; warnings: string[] };
export const childUpdateSchema = z.object({ expectedVersion: versionSchema, fullName: name, birthDate: z.iso.date(), contacts: z.array(contactInputSchema).max(10) }).strict();
export const lifecycleInputSchema = z.object({ expectedVersion: versionSchema, status: childStateSchema, reason, publicMessage: z.string().trim().max(500).nullable() }).strict();
export const classroomMoveSchema = z.object({ expectedVersion: versionSchema, classroomId: z.uuid().nullable(), reason }).strict();
export const guardianLinkInputSchema = z.object({ expectedChildVersion: versionSchema, accountId: z.uuid(), relationship: z.string().trim().min(1).max(80), permissions: linkPermissionsSchema, active: z.boolean() }).strict();
export const childListQuerySchema = z.object({ search: z.string().trim().max(100).default(''), status: childStateSchema.optional(), branchId: z.uuid().optional(), classroomId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export const guardianListQuerySchema = z.object({ search: z.string().trim().max(100).default(''), limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const documentInputSchema = z.object({ name, expiresOn: z.iso.date().nullable(), mimeType: z.enum(['application/pdf','image/jpeg','image/png']), contentBase64: z.string().min(4).max(4 * Math.ceil(MAX_DOCUMENT_BYTES / 3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict();
export type Child = { id: string; code: string; fullName: string; birthDate: string; branchId: string; classroomId: string | null; status: z.infer<typeof childStateSchema>; publicMessage: string | null; version: number };
export type GuardianOption = { id: string; username: string; fullName: string; mobile: string; version: number };
export type GuardianLink = GuardianOption & { relationship: string; permissions: LinkPermissions; active: boolean };
export type ChildDocument = { id: string; name: string; expiresOn: string | null; mimeType: string; byteSize: number };
export type ChildDetail = { child: Child; contacts: z.infer<typeof contactInputSchema>[]; guardians: GuardianLink[]; statusHistory: { previousStatus: string | null; newStatus: string; effectiveOn: string; reason: string; publicMessage: string | null }[]; classroomHistory: { previousClassroomId: string | null; classroomId: string | null; effectiveOn: string; reason: string }[]; documents: ChildDocument[] };
export type GuardianChild = { id: string; fullName: string; status: Child['status']; publicMessage: string | null; permissions: LinkPermissions };
export type GuardianChildDetail = { child: Pick<Child,'id' | 'fullName' | 'birthDate' | 'status'>; permissions: LinkPermissions };
export type ChildrenOptions = { branches: { id: string; code: string; name: string }[]; classrooms: { id: string; branchId: string; name: string; capacity: number; occupancy: number }[]; capabilities: string[]; integration: { finance: { enabled: boolean; implemented: false }; transport: { implemented: false }; availableSteps: ['accounts','children','documents'] } };
