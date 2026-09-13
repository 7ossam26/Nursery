import { childFixture } from './children.js';
import type { Capability, ModuleKey } from '@nursery/contracts';
export async function safetyFixture(https = true) {
  const f = await childFixture(https);
  try {
    const org = f.app.organization;
    async function safetyStaff(capabilities: Capability[],branchIds: string[],classroomIds: string[] = [],mode: 'BRANCH' | 'CLASSROOM' = 'BRANCH') {
      const user = await f.account(); const role = await org.save(f.root.token,'roles',{ name: `Safety role ${crypto.randomUUID()}`,capabilities: ['children.read',...capabilities] });
      await org.assign(f.root.token,user.id,{ expectedVersion: 1,roleIds: [role.id],branchIds,classroomIds,scopeMode: mode });
      return { ...user,...await f.app.auth.login(user.username,user.password) };
    }
    // Two guardians: the first may authorize pickups and receives notifications; the second is read-only.
    async function onboardFamily(code: string,branchId = f.a.id,classroomId: string | null = f.classes[0].id) {
      const input = f.family(code,branchId,classroomId);
      input.guardians.push({ kind: 'NEW',username: `parent-${code.toLowerCase()}-two`,profile: { fullName: `Second ${code}`,mobile: '01000000002' } });
      input.children[0].links[0].permissions = { read: true,finance: false,pickup: true,notify: true };
      input.children[0].links.push({ guardianIndex: 1,relationship: 'Father',permissions: { read: true,finance: false,pickup: false,notify: false } });
      const result = await f.children.onboard(f.root.token,input);
      const first = await f.parent(result.credentials[0].id,result.credentials[0].username,result.credentials[0].temporaryPassword);
      const second = await f.parent(result.credentials[1].id,result.credentials[1].username,result.credentials[1].temporaryPassword);
      return { childId: result.childIds[0],guardianIds: result.guardianIds,first,second };
    }
    async function setModule(moduleKey: ModuleKey,enabled: boolean) {
      const current = (await f.licensing.modules(f.root.token)).find((m) => m.moduleKey === moduleKey)!;
      if (current.enabled !== enabled) await f.licensing.saveModuleSetting(f.root.token,moduleKey,{ expectedVersion: current.version,enabled,reason: 'Verification toggle',catchupAcknowledged: enabled });
    }
    return { ...f,safety: f.app.safety,safetyStaff,onboardFamily,setModule };
  } catch (error) { await f.close(); throw error; }
}
