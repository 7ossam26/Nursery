import type { Transaction } from '@nursery/db';
import type { Child, LinkPermissions, Capability } from '@nursery/contracts';
import { denied, requireRecord, requireBranch, requireCapability, type Policy } from '../organization/policy.js';
export const GUARDIAN_SCOPE_LOCK = 7190601;
export const childProjection = 'c.id,c.code,c.full_name as "fullName",c.birth_date::text as "birthDate",c.branch_id as "branchId",c.classroom_id as "classroomId",c.status,c.public_message as "publicMessage",c.version';
export function staffChildScope(p: Policy, capability: Capability) {
  requireCapability(p,capability);
  return { sql: '($1::boolean or c.branch_id=any($2::uuid[])) and ($3::boolean or c.classroom_id=any($4::uuid[]))', values: [p.account.kind === 'SYSTEM',p.scope.branchIds,p.account.kind === 'SYSTEM' || p.scope.mode === 'BRANCH',p.scope.classroomIds] };
}
export function requireChild(p: Policy, capability: Capability, child: Child) {
  requireRecord(p,capability,{ branchId: child.branchId,classroomId: child.classroomId ?? undefined,childId: child.id });
}
export async function resolveChild(tx: Transaction, id: string, edit = false): Promise<Child> {
  const child = (await tx.query<Child>(`select ${childProjection} from children c where c.id=$1 ${edit ? 'for update' : 'for share'}`,[id])).rows[0];
  if (!child) throw denied();
  return child;
}
export async function requireGuardianChild(tx: Transaction, p: Policy, id: string, permission: keyof LinkPermissions): Promise<{ child: Child; permissions: LinkPermissions }> {
  if (p.account.kind !== 'GUARDIAN' || p.account.mustChangePassword) throw denied();
  const child = await resolveChild(tx,id);
  const link = (await tx.query<{ permissions: LinkPermissions }>(`select json_build_object('read',can_read,'finance',can_finance,'pickup',can_pickup,'notify',can_notify) as permissions
    from guardian_child_links where guardian_id=$1 and child_id=$2 and active for share`,[p.account.id,id])).rows[0];
  if (child.status !== 'ACTIVE' || !link?.permissions[permission]) throw denied();
  return { child,permissions: link.permissions };
}
// Called inside the parent's account lock. The exclusive link-scope advisory lock taken by
// licensing prevents new/moved links from racing this global account action.
export async function requireParentAdministration(tx: Transaction,p: Policy,id: string) {
  if (p.account.kind === 'SYSTEM') return;
  const children = (await tx.query<{ branch_id: string; classroom_id: string | null }>(`select c.branch_id,c.classroom_id from children c join guardian_child_links l on l.child_id=c.id
    where l.guardian_id=$1 and l.active and c.status='ACTIVE'`,[id])).rows;
  if (!children.length) throw denied();
  for (const child of children) {
    requireBranch(p,child.branch_id);
    if (p.scope.mode === 'CLASSROOM' && (!child.classroom_id || !p.scope.classroomIds.includes(child.classroom_id))) throw denied();
  }
}
