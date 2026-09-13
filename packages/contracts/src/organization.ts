import { z } from 'zod';
import type { CurrentAccount } from './index.js';

export const capabilityKeys = ['organization.read', 'organization.manage', 'users.assign_roles', 'roles.define', 'grants.manage', 'accounts.reset_password', 'support.access', 'finance.correct'] as const;
export type Capability = typeof capabilityKeys[number];
export const scopeModeSchema = z.enum(['BRANCH', 'CLASSROOM']);
const ids = z.array(z.uuid()).max(100).refine((value) => new Set(value).size === value.length);
const name = z.string().trim().min(1).max(120);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/);
export const versionSchema = z.number().int().positive();
export const branchInputSchema = z.object({ code, name }).strict();
export const ageGroupInputSchema = z.object({ code, name, minMonths: z.number().int().min(0).max(216), maxMonths: z.number().int().min(0).max(216) }).strict().refine((v) => v.maxMonths >= v.minMonths);
export const classroomInputSchema = z.object({ code, name, branchId: z.uuid(), ageGroupId: z.uuid().nullable(), capacity: z.number().int().min(1).max(1000) }).strict();
export const roleInputSchema = z.object({ name, capabilities: z.array(z.enum(capabilityKeys)).max(50).refine((v) => new Set(v).size === v.length) }).strict();
export const assignmentInputSchema = z.object({ expectedVersion: versionSchema, roleIds: ids, branchIds: ids, classroomIds: ids, scopeMode: scopeModeSchema }).strict();
export const delegationInputSchema = z.object({ expectedVersion: versionSchema, roleIds: ids }).strict();
export const grantInputSchema = z.object({ expectedVersion: versionSchema, sensitiveFinancialEdit: z.boolean() }).strict();
export const listQuerySchema = z.object({ branchId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export const policyScopeSchema = z.object({ revision: versionSchema, mode: scopeModeSchema, branchIds: z.array(z.uuid()), classroomIds: z.array(z.uuid()) });
export type PolicyScope = z.infer<typeof policyScopeSchema>;
export type Branch = z.infer<typeof branchInputSchema> & { id: string; version: number };
export type AgeGroup = z.infer<typeof ageGroupInputSchema> & { id: string; version: number };
export type Classroom = z.infer<typeof classroomInputSchema> & { id: string; version: number };
export type Role = z.infer<typeof roleInputSchema> & { id: string; version: number };
export type Assignment = z.infer<typeof assignmentInputSchema>;
export type StaffAssignment = Omit<Assignment, 'expectedVersion'> & { id: string; username: string; version: number; delegatedRoleIds: string[]; sensitiveFinancialEdit: boolean };
export type OrganizationContext = { account: CurrentAccount; branches: Branch[]; classrooms: Classroom[]; ageGroups: AgeGroup[]; assignableRoles: Role[]; capabilities: { key: Capability; reserved: boolean }[] };

// Future placement services supply a canonical, transactionally read occupancy count.
// Capacity is advisory: this helper never rejects an otherwise authorized placement.
export function capacityWarnings(capacity: number, occupancyAfterPlacement: number): string[] {
  if (!Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(occupancyAfterPlacement) || occupancyAfterPlacement < 0) throw new Error('Invalid capacity input');
  return occupancyAfterPlacement > capacity ? ['CAPACITY_EXCEEDED'] : [];
}
