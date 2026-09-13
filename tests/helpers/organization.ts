import { authFixture } from './auth.js';
export const templateRoles = { admin: '04000000-0000-4000-8000-000000000001', manager: '04000000-0000-4000-8000-000000000002', teacher: '04000000-0000-4000-8000-000000000003' };
export async function organizationFixture(https = true) {
  const fixture = await authFixture(https);
  try {
    const auth = fixture.app.auth; const service = fixture.app.organization;
    await auth.bootstrap('organization-system',fixture.secret);
    const setup = await auth.login('organization-system',fixture.secret);
    const password = 'Organization permanent root phrase';
    const root = await auth.changePassword(setup.token,fixture.secret,password);
    const a = await service.save(root.token,'branches',{ code: 'A',name: 'Branch A' });
    const b = await service.save(root.token,'branches',{ code: 'B',name: 'Branch B' });
    const c = await service.save(root.token,'branches',{ code: 'C',name: 'Branch C' });
    const classes: { id: string; version: number }[] = [];
    for (let i = 0; i < 4; i++) classes.push(await service.save(root.token,'classrooms',{ code: `CLASS${i+1}`,name: `Class ${i+1}`,branchId: i < 3 ? a.id : b.id,ageGroupId: null,capacity: 2 }));
    async function staff(roleIds: string[], branchIds: string[], classroomIds: string[] = [], scopeMode: 'BRANCH' | 'CLASSROOM' = 'BRANCH', username?: string) {
      const account = await fixture.account('STAFF',username);
      await service.assign(root.token,account.id,{ expectedVersion: 1,roleIds,branchIds,classroomIds,scopeMode });
      return { ...account,...await auth.login(account.username,account.password) };
    }
    return { ...fixture,root,password,service,a,b,c,classes,staff };
  } catch (error) { await fixture.close(); throw error; }
}
