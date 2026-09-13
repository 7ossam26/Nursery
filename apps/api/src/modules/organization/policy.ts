import type { Transaction } from '@nursery/db';
import { cairoIsoDate, subscriptionAccessStatus } from '@nursery/domain';
import { capabilityKeys, type Capability, type CurrentAccount, type LicenseStatus, type PolicyScope } from '@nursery/contracts';
import { SafeError } from '../../errors.js';

export const denied = () => new SafeError('FORBIDDEN', 'auth.forbidden', false, 403);
export const stale = () => new SafeError('STALE_VERSION', 'organization.stale', false, 409);
export type Policy = { account: CurrentAccount; scope: PolicyScope; sensitiveFinancialEdit: boolean; licenseStatus: LicenseStatus };

// One statement gives an internally consistent projection, including for auth responses.
export async function loadPolicy(tx: Transaction, account: CurrentAccount): Promise<Policy> {
  const row = (await tx.query<{ revision: number; mode: PolicyScope['mode']; branches: string[]; classrooms: string[]; capabilities: string[]; sensitive: boolean; validUntil: string | null; graceDays: number | null }>(`
    select p.version as revision,a.scope_mode as mode,
      array(select branch_id from account_branches where account_id=a.id order by branch_id) as branches,
      array(select classroom_id from teacher_classrooms where account_id=a.id order by classroom_id) as classrooms,
      array(select distinct rc.capability_key from account_roles ar join role_capabilities rc on rc.role_id=ar.role_id
        join capabilities c on c.key=rc.capability_key where ar.account_id=a.id and not c.reserved order by rc.capability_key) as capabilities,
      coalesce((select sensitive_financial_edit from sensitive_grants where account_id=a.id),false) as sensitive,
      l.valid_until::text as "validUntil", l.grace_days as "graceDays"
    from accounts a cross join policy_revision p left join license_limits l on l.singleton where a.id=$1`, [account.id])).rows[0];
  if (!row) throw denied();
  const active = !account.mustChangePassword && account.kind !== 'GUARDIAN';
  const scope: PolicyScope = { revision: row.revision, mode: row.mode, branchIds: active ? row.branches : [], classroomIds: active ? row.classrooms : [] };
  const capabilities = !active ? [] : account.kind === 'SYSTEM' ? [...capabilityKeys] : row.capabilities;
  const licenseStatus: LicenseStatus = row.validUntil === null ? 'NOT_CONFIGURED' : subscriptionAccessStatus(cairoIsoDate(), row.validUntil, row.graceDays!);
  // Root support stays available after suspension; every other kind loses normal access without any data/seat loss.
  if (licenseStatus === 'SUSPENDED' && account.kind !== 'SYSTEM') throw new SafeError('LICENSE_SUSPENDED', 'licensing.suspended', false, 403);
  return { account: { ...account, capabilities, policyReady: true, scope, licenseStatus }, scope, sensitiveFinancialEdit: active && row.sensitive, licenseStatus };
}

export function requireCapability(policy: Policy, capability: Capability) {
  if (!policy.account.policyReady || policy.account.mustChangePassword || policy.account.kind === 'GUARDIAN' || !policy.account.capabilities.includes(capability)) throw denied();
}
export function requireBranch(policy: Policy, branchId: string) {
  if (policy.account.kind !== 'SYSTEM' && !policy.scope.branchIds.includes(branchId)) throw denied();
}
export function requireRecord(policy: Policy, capability: Capability, resource: { branchId: string; classroomId?: string; childId?: string }) {
  requireCapability(policy, capability);
  // Guardian links are deliberately unavailable until Phase 06. Never fall back to staff scope.
  if (resource.childId && policy.account.kind === 'GUARDIAN') throw denied();
  requireBranch(policy, resource.branchId);
  if (policy.account.kind !== 'SYSTEM' && policy.scope.mode === 'CLASSROOM' && (!resource.classroomId || !policy.scope.classroomIds.includes(resource.classroomId))) throw denied();
}
// SQL fragments use only fixed identifiers supplied by the owning query, never request input.
// List and aggregate callers share precisely the same predicate and parameter positions.
export function queryScope(policy: Policy, capability: Capability, resource: 'branch' | 'classroom', selectedBranch?: string) {
  requireCapability(policy, capability);
  if (selectedBranch) requireBranch(policy, selectedBranch);
  const system = policy.account.kind === 'SYSTEM';
  const column = resource === 'branch' ? 'b.id' : 'c.branch_id';
  return {
    sql: `($1::boolean or ${column}=any($2::uuid[])) and ($3::uuid is null or ${column}=$3)${resource === 'classroom' ? ' and ($4::boolean or c.id=any($5::uuid[]))' : ''}`,
    values: resource === 'branch' ? [system, policy.scope.branchIds, selectedBranch ?? null] : [system, policy.scope.branchIds, selectedBranch ?? null, system || policy.scope.mode === 'BRANCH', policy.scope.classroomIds]
  };
}
export function requireSensitiveCorrection(policy: Policy, resource: { branchId: string; classroomId?: string }) {
  requireRecord(policy, 'finance.correct', resource);
  if (!policy.sensitiveFinancialEdit) throw denied();
}
export function requireGuardianLink(): never { throw denied(); }
