import { expect, it } from 'vitest';
import { examInputSchema, examResultEntrySchema, examResultClassroomPublicationSchema, findExamStatus } from './exams.js';
import type { CheckpointDefinition } from './learning.js';

const base = { name: 'Mid-term',subjectId: crypto.randomUUID(),typeId: crypto.randomUUID(),classroomId: crypto.randomUUID(),assessedOn: '2026-09-14',operationId: crypto.randomUUID() };
it('exam definitions require a maximum only for NUMERIC, label options only for LABEL, and integer maximums unless decimals are allowed',() => {
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'NUMERIC',maximumMarks: 10,decimalAllowed: false,labelOptions: null }).success).toBe(true);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'NUMERIC',maximumMarks: null,decimalAllowed: false,labelOptions: null }).success).toBe(false);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'NUMERIC',maximumMarks: 10.5,decimalAllowed: false,labelOptions: null }).success).toBe(false);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'NUMERIC',maximumMarks: 10.5,decimalAllowed: true,labelOptions: null }).success).toBe(true);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'LABEL',maximumMarks: null,decimalAllowed: false,labelOptions: ['A','B'] }).success).toBe(true);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'LABEL',maximumMarks: 10,decimalAllowed: false,labelOptions: ['A','B'] }).success).toBe(false);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'LABEL',maximumMarks: null,decimalAllowed: false,labelOptions: ['A','a'] }).success).toBe(false);
  expect(examInputSchema.safeParse({ ...base,gradeFormat: 'NUMERIC',maximumMarks: 10,decimalAllowed: true,labelOptions: null }).success).toBe(true);
});
it('a result entry carries exactly one of score/label for RESULT and neither for CHILD_ABSENT',() => {
  const entry = { childId: crypto.randomUUID(),expectedVersion: 0,comment: null };
  expect(examResultEntrySchema.safeParse({ ...entry,outcome: 'RESULT',score: 0,label: null }).success).toBe(true);
  expect(examResultEntrySchema.safeParse({ ...entry,outcome: 'RESULT',score: null,label: null }).success).toBe(false);
  expect(examResultEntrySchema.safeParse({ ...entry,outcome: 'RESULT',score: 5,label: 'A' }).success).toBe(false);
  expect(examResultEntrySchema.safeParse({ ...entry,outcome: 'CHILD_ABSENT',score: null,label: null }).success).toBe(true);
  expect(examResultEntrySchema.safeParse({ ...entry,outcome: 'CHILD_ABSENT',score: 0,label: null }).success).toBe(false);
});
it('a classroom result batch rejects duplicate children and requires at least one entry',() => {
  const entry = { childId: crypto.randomUUID(),outcome: 'CHILD_ABSENT' as const,score: null,label: null,comment: null,expectedVersion: 0 };
  expect(examResultClassroomPublicationSchema.safeParse({ examId: crypto.randomUUID(),operationId: crypto.randomUUID(),entries: [entry] }).success).toBe(true);
  expect(examResultClassroomPublicationSchema.safeParse({ examId: crypto.randomUUID(),operationId: crypto.randomUUID(),entries: [entry,entry] }).success).toBe(false);
  expect(examResultClassroomPublicationSchema.safeParse({ examId: crypto.randomUUID(),operationId: crypto.randomUUID(),entries: [] }).success).toBe(false);
});
it('findExamStatus selects only the enabled status matching the requested built-in outcome',() => {
  const definition = { statuses: [
    { id: '1',outcome: 'AWAITING_RESULT',enabled: true },
    { id: '2',outcome: 'RESULT_PUBLISHED',enabled: true },
    { id: '3',outcome: 'NO_EXAM',enabled: false }
  ] } as unknown as CheckpointDefinition;
  expect(findExamStatus(definition,'AWAITING_RESULT')?.id).toBe('1');
  expect(findExamStatus(definition,'NO_EXAM')).toBeUndefined();
  expect(findExamStatus(definition,'CHILD_ABSENT')).toBeUndefined();
});
