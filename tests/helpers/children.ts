import { licensingFixture, defaultLimitsInput } from './licensing.js';
import { defaultLinkPermissions, type OnboardingInput } from '@nursery/contracts';
export async function childFixture(https = true) {
  const f = await licensingFixture(https);
  try {
    await f.licensing.saveLimits(f.root.token,{ expectedVersion: null,value: { ...defaultLimitsInput,parentCapacity: 20,employeeCapacity: 20 } });
    const org = f.app.organization;
    const a = await org.save(f.root.token,'branches',{ code: 'A',name: 'Branch A' }); const b = await org.save(f.root.token,'branches',{ code: 'B',name: 'Branch B' });
    const classes: { id: string; version: number }[] = [];
    for (let i=0; i<3; i++) classes.push(await org.save(f.root.token,'classrooms',{ code: `C${i}`,name: `Class ${i}`,branchId: i===2 ? b.id : a.id,ageGroupId: null,capacity: 1 }));
    async function staff(branchIds: string[],classroomIds: string[] = [],mode: 'BRANCH' | 'CLASSROOM' = 'BRANCH') {
      const user = await f.account(); const role = await org.save(f.root.token,'roles',{ name: `Child role ${crypto.randomUUID()}`,capabilities: ['children.read','children.manage','guardians.manage','documents.manage','users.create_parent','parents.block'] });
      await org.assign(f.root.token,user.id,{ expectedVersion: 1,roleIds: [role.id],branchIds,classroomIds,scopeMode: mode });
      return { ...user,...await f.app.auth.login(user.username,user.password) };
    }
    function family(code: string,branchId = a.id,classroomId: string | null = classes[0].id): OnboardingInput {
      return { operationId: crypto.randomUUID(),guardians: [{ kind: 'NEW',username: `parent-${code.toLowerCase()}`,profile: { fullName: `Parent ${code}`,mobile: '01000000000' } }],
        children: [{ child: { code,fullName: `Child ${code}`,birthDate: '2022-01-01',branchId,classroomId,contacts: [{ fullName: 'Secondary contact',mobile: '01000000001',relationship: 'Aunt' }] },links: [{ guardianIndex: 0,relationship: 'Parent',permissions: { ...defaultLinkPermissions } }] }] };
    }
    async function parent(id: string,username: string,password: string) {
      const login = await f.app.auth.login(username,password); const session = await f.app.auth.changePassword(login.token,password,`Permanent guardian secret ${id}`);
      return session;
    }
    return { ...f,children: f.app.children,documents: f.app.childDocuments,a,b,classes,staff,family,parent };
  } catch (error) { await f.close(); throw error; }
}
