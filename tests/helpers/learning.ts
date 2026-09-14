import { cairoIsoDate } from '@nursery/domain';
import { progressMeanings, type Capability, type CheckpointDefinition, type ModuleKey } from '@nursery/contracts';
import { LearningService } from '../../apps/api/src/modules/learning/service.js';
import { AttendanceService } from '../../apps/api/src/modules/attendance/service.js';
import { childFixture } from './children.js';
export function addDays(date: string,days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function customDefinition(): CheckpointDefinition { return { id: crypto.randomUUID(),kind: 'STATUS_NOTE',label: { en: 'Reading practice','ar-EG': 'تدريب القراءة' },order: 3,icon: 'learning',enabled: true,enabledFrom: null,enabledUntil: null,statuses: progressMeanings.map((meaning,i) => ({ id: crypto.randomUUID(),label: { en: ['Pending','Recorded','Not applicable'][i],'ar-EG': ['لسه مستني','اتسجل','مش مطلوب'][i] },order: i,enabled: true,meaning,theme: 'neutral',outcome: null })) }; }
export async function learningFixture(https = true) {
  const f = await childFixture(https);
  try {
    let date = cairoIsoDate(); const learning = new LearningService(f.children,() => date); const custom = customDefinition();
    const setup = new LearningService(f.children,() => addDays(date,-1)); const config = await setup.configuration(f.root.token);
    await setup.saveConfiguration(f.root.token,{ expectedVersion: config.version,definitions: [...config.definitions,custom] });
    async function learningStaff(classroomIds: string[],capabilities: Capability[] = ['learning.read','learning.publish']) {
      const user = await f.account(); const role = await f.app.organization.save(f.root.token,'roles',{ name: `Learning ${crypto.randomUUID()}`,capabilities });
      await f.app.organization.assign(f.root.token,user.id,{ expectedVersion: 1,roleIds: [role.id],branchIds: [f.a.id],classroomIds,scopeMode: 'CLASSROOM' });
      return { ...user,roleId: role.id,...await f.app.auth.login(user.username,user.password) };
    }
    async function onboard(code: string,classroomId = f.classes[0].id,branchId = f.a.id) { return f.children.onboard(f.root.token,f.family(code,branchId,classroomId)); }
    async function setModule(key: ModuleKey,enabled: boolean) { const module = (await f.licensing.modules(f.root.token)).find((m) => m.moduleKey===key)!; await f.licensing.saveModuleSetting(f.root.token,key,{ expectedVersion: module.version,enabled,reason: 'Phase 08 test module toggle' }); }
    const attendance = new AttendanceService(f.children,learning,() => date);
    return { ...f,learning,attendance,custom,learningStaff,onboard,setModule,date: () => date,setDate: (v: string) => { date=v; } };
  } catch (error) { await f.close(); throw error; }
}
