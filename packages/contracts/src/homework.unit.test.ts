import { expect,it } from 'vitest';
import { homeworkAssignmentSchema,homeworkContentCorrectionSchema,homeworkOutcomeBatchSchema,homeworkReportingRule } from './homework.js';
it('requires bounded unique recipients, plain content and ordered dates without privilege fields',() => {
  const input={ classroomId: crypto.randomUUID(),title: 'Read',instructions: 'Read page 2',assignedOn: '2026-09-14',dueOn: '2026-09-15',childIds: [crypto.randomUUID()],operationId: crypto.randomUUID() };
  expect(homeworkAssignmentSchema.safeParse(input).success).toBe(true);
  expect(homeworkAssignmentSchema.safeParse({ ...input,dueOn: '2026-09-13' }).success).toBe(false);
  expect(homeworkAssignmentSchema.safeParse({ ...input,childIds: [input.childIds[0],input.childIds[0]] }).success).toBe(false);
  expect(homeworkAssignmentSchema.safeParse({ ...input,creatorId: crypto.randomUUID() }).success).toBe(false);
  expect(homeworkContentCorrectionSchema.safeParse({ expectedVersion: 1,title: 'Read again',instructions: 'Page 3',reason: '',operationId: crypto.randomUUID() }).success).toBe(false);
  expect(homeworkOutcomeBatchSchema.safeParse({ assignmentId: crypto.randomUUID(),date: input.assignedOn,operationId: crypto.randomUUID(),entries: [{ childId: input.childIds[0],statusId: crypto.randomUUID(),note: null,expectedVersion: 0,completed: true }] }).success).toBe(false);
});
it('keeps future visibility, missing, noncompletion and excusal distinct in a single reporting slot',() => {
  expect(homeworkReportingRule([],1)).toMatchObject({ meaning: 'RESOLVED',future: 1,reported: true });
  expect(homeworkReportingRule(['COMPLETED',null],1)).toMatchObject({ meaning: 'PENDING',due: 2,missing: 1 });
  expect(homeworkReportingRule(['COMPLETED','NOT_COMPLETED'],0)).toMatchObject({ meaning: 'RESOLVED',outcome: 'NOT_COMPLETED' });
  expect(homeworkReportingRule(['EXCUSED'],0)).toMatchObject({ meaning: 'NOT_APPLICABLE',outcome: 'EXCUSED' });
  expect(homeworkReportingRule([],0,true)).toMatchObject({ outcome: 'NO_HOMEWORK',meaning: 'NOT_APPLICABLE' });
  expect(homeworkReportingRule([],0)).toMatchObject({ reported: false,meaning: 'PENDING' });
});
