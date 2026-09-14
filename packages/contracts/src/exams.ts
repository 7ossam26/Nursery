import { z } from 'zod';
import type { CheckpointDefinition } from './learning.js';

const name120 = z.string().trim().min(1).max(120);
const examName = z.string().trim().min(1).max(160);
const comment = z.string().trim().max(2000).nullable().default(null).transform((v) => v || null);
const label60 = z.string().trim().min(1).max(60);

export const catalogInputSchema = z.object({ name: name120, enabled: z.boolean().default(true) }).strict();
export type ExamCatalogItem = { id: string; name: string; enabled: boolean; version: number };

export const gradeFormats = ['NUMERIC', 'LABEL'] as const;
export type GradeFormat = typeof gradeFormats[number];
export const examInputSchema = z.object({
  name: examName,
  subjectId: z.uuid(),
  typeId: z.uuid(),
  classroomId: z.uuid(),
  assessedOn: z.iso.date(),
  gradeFormat: z.enum(gradeFormats),
  maximumMarks: z.number().positive().max(100000).nullable(),
  decimalAllowed: z.boolean(),
  labelOptions: z.array(label60).min(2).max(12).nullable(),
  operationId: z.uuid()
}).strict()
  .refine((v) => (v.gradeFormat === 'NUMERIC') === (v.maximumMarks !== null), { message: 'maximumMarks required only for NUMERIC' })
  .refine((v) => (v.gradeFormat === 'LABEL') === (v.labelOptions !== null), { message: 'labelOptions required only for LABEL' })
  .refine((v) => v.gradeFormat === 'NUMERIC' || !v.decimalAllowed)
  .refine((v) => v.maximumMarks === null || v.decimalAllowed || Number.isInteger(v.maximumMarks))
  .refine((v) => !v.labelOptions || new Set(v.labelOptions.map((l) => l.toLowerCase())).size === v.labelOptions.length);
export type ExamInput = z.infer<typeof examInputSchema>;
export type ExamDefinition = {
  id: string; name: string; subjectId: string; subjectName: string; typeId: string; typeName: string;
  classroomId: string; branchId: string; assessedOn: string; gradeFormat: GradeFormat;
  maximumMarks: string | null; decimalAllowed: boolean; labelOptions: string[] | null; creatorId: string;
};

export const examResultOutcomes = ['RESULT', 'CHILD_ABSENT'] as const;
export const examResultEntrySchema = z.object({
  childId: z.uuid(), outcome: z.enum(examResultOutcomes),
  score: z.number().min(0).max(100000).nullable(),
  label: label60.nullable(),
  comment, expectedVersion: z.number().int().min(0)
}).strict()
  .refine((v) => v.outcome === 'RESULT' ? (v.score !== null) !== (v.label !== null) : v.score === null && v.label === null);
export type ExamResultEntry = z.infer<typeof examResultEntrySchema>;
export const examResultClassroomPublicationSchema = z.object({
  examId: z.uuid(), operationId: z.uuid(), entries: z.array(examResultEntrySchema).min(1).max(100)
}).strict().refine((v) => new Set(v.entries.map((e) => e.childId)).size === v.entries.length);
export const examResultCorrectionSchema = examResultEntrySchema.extend({
  examId: z.uuid(), operationId: z.uuid(), reason: z.string().trim().min(1).max(500)
});
export const examNoExamDaySchema = z.object({ classroomId: z.uuid(), date: z.iso.date(), operationId: z.uuid() }).strict();
export const examHistoryQuerySchema = z.object({
  subjectId: z.uuid().optional(), typeId: z.uuid().optional(),
  from: z.iso.date().optional(), until: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict().refine((v) => !v.from || !v.until || v.until >= v.from);

export type ExamResult = { outcome: typeof examResultOutcomes[number]; score: string | null; label: string | null; comment: string | null };
export type ExamRosterEntry = { childId: string; fullName: string; result: ExamResult | null; slotRevision: number };
export type ExamClassroomDraft = { exam: ExamDefinition; entries: ExamRosterEntry[]; complete: number; total: number };
export type ExamHistoryEntry = { exam: ExamDefinition; result: ExamResult | null; corrected: boolean };

export const examStatusOutcomes = ['AWAITING_RESULT', 'RESULT_PUBLISHED', 'NO_EXAM', 'CHILD_ABSENT'] as const;
export function findExamStatus(definition: CheckpointDefinition, outcome: typeof examStatusOutcomes[number]) {
  return definition.statuses.find((s) => s.outcome === outcome && s.enabled);
}
