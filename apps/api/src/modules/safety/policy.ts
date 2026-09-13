import type { Transaction } from '@nursery/db';
import type { Capability, Child, LinkPermissions, SafetyModules } from '@nursery/contracts';
import { denied, type Policy } from '../organization/policy.js';
import { requireChild, requireGuardianChild, resolveChild } from '../children/policy.js';
import { SafeError } from '../../errors.js';

export const safetyCapabilities: Capability[] = ['health.read','health.manage','pickup.record','pickup.manage','incidents.read','incidents.manage'];
export const moduleDisabled = () => new SafeError('MODULE_DISABLED','safety.moduleDisabled',false,403);
// Missing rows fail closed: a module that cannot be confirmed enabled behaves as disabled.
export async function loadModules(tx: Transaction): Promise<SafetyModules> {
  const rows = (await tx.query<{ module_key: string; enabled: boolean }>("select module_key,enabled from module_settings where module_key in ('HEALTH','PICKUP','INCIDENTS')")).rows;
  const on = (key: string) => rows.find((r) => r.module_key === key)?.enabled ?? false;
  return { health: on('HEALTH'),pickup: on('PICKUP'),incidents: on('INCIDENTS') };
}
export function requireModule(modules: SafetyModules, key: keyof SafetyModules) { if (!modules[key]) throw moduleDisabled(); }
export function hasChildCapability(p: Policy, capability: Capability, child: Child): boolean {
  try { requireChild(p,capability,child); return true; }
  catch (error) { if (error instanceof SafeError && error.code === 'FORBIDDEN') return false; throw error; }
}
export function requireAnyChildCapability(p: Policy, capabilities: Capability[], child: Child) {
  if (!capabilities.some((c) => hasChildCapability(p,c,child))) throw denied();
}
export type SafetyActor = { kind: 'STAFF'; child: Child } | { kind: 'GUARDIAN'; child: Child; permissions: LinkPermissions };
// Staff need a capability plus branch/classroom scope; guardians need their own active link permission. Neither path ever falls back to the other.
export async function safetyChild(tx: Transaction, p: Policy, id: string, access: { staff: Capability[]; guardian: keyof LinkPermissions | null }, edit = false): Promise<SafetyActor> {
  if (p.account.kind === 'GUARDIAN') {
    if (!access.guardian) throw denied();
    const { child,permissions } = await requireGuardianChild(tx,p,id,access.guardian); return { kind: 'GUARDIAN',child,permissions };
  }
  const child = await resolveChild(tx,id,edit); requireAnyChildCapability(p,access.staff,child); return { kind: 'STAFF',child };
}
export async function staffChild(tx: Transaction, p: Policy, id: string, capability: Capability, edit = false): Promise<Child> {
  const child = await resolveChild(tx,id,edit); requireChild(p,capability,child); return child;
}
