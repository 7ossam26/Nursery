import { z } from 'zod';

export const checkpointKinds = ['ATTENDANCE','EXAM','HOMEWORK','STATUS_NOTE'] as const;
export const progressMeanings = ['PENDING','RESOLVED','NOT_APPLICABLE'] as const;
export const checkpointIcons = ['calendar','learning','check','star'] as const;
export const statusThemes = ['neutral','success','warning','error'] as const;
const label = z.object({ en: z.string().trim().min(1).max(120), 'ar-EG': z.string().trim().min(1).max(120) }).strict();
export const checkpointStatusSchema = z.object({ id: z.uuid(), label, order: z.number().int().min(0).max(1000), enabled: z.boolean(), meaning: z.enum(progressMeanings), theme: z.enum(statusThemes), outcome: z.enum(['UNRECORDED','PRESENT','ABSENT','NO_CLASS','AWAITING_RESULT','RESULT_PUBLISHED','NO_EXAM','CHILD_ABSENT','NOT_ASSIGNED','AWAITING_REVIEW','COMPLETED','NOT_COMPLETED','EXCUSED','NO_HOMEWORK']).nullable() }).strict();
export const checkpointDefinitionSchema = z.object({ id: z.uuid(), kind: z.enum(checkpointKinds), label, icon: z.enum(checkpointIcons), order: z.number().int().min(0).max(1000), enabled: z.boolean(), enabledFrom: z.iso.date().nullable(), enabledUntil: z.iso.date().nullable(), statuses: z.array(checkpointStatusSchema).min(1).max(30) }).strict()
  .refine((d) => !d.enabledFrom || !d.enabledUntil || d.enabledUntil >= d.enabledFrom)
  .refine((d) => new Set(d.statuses.map((s) => s.id)).size === d.statuses.length)
  .refine((d) => d.statuses.some((s) => s.enabled && s.meaning === 'PENDING'));
export const saveCheckpointConfigurationSchema = z.object({ expectedVersion: z.number().int().positive(), definitions: z.array(checkpointDefinitionSchema).min(3).max(50) }).strict().refine((v) => new Set(v.definitions.map((d) => d.id)).size === v.definitions.length);
export const learningDateSchema = z.object({ date: z.iso.date() }).strict();
export const checkpointPublicationSchema = z.object({ childId: z.uuid(), date: z.iso.date(), definitionId: z.uuid(), statusId: z.uuid(), note: z.string().trim().max(2000).nullable().default(null).transform((v) => v || null), expectedVersion: z.number().int().min(0), operationId: z.uuid() }).strict();
export const checkpointCorrectionSchema = checkpointPublicationSchema.extend({ reason: z.string().trim().min(1).max(500) });
export const checkpointBatchSchema = z.object({ classroomId: z.uuid(), operationId: z.uuid(), entries: z.array(checkpointPublicationSchema.omit({ operationId: true })).min(1).max(100) }).strict().refine((v) => new Set(v.entries.map((e) => `${e.childId}/${e.date}/${e.definitionId}`)).size === v.entries.length);
export type CheckpointStatus = z.infer<typeof checkpointStatusSchema>;
export type CheckpointDefinition = z.infer<typeof checkpointDefinitionSchema>;
export type CheckpointConfiguration = { id: string; version: number; effectiveOn: string; definitions: CheckpointDefinition[] };
export type CheckpointPublication = z.infer<typeof checkpointPublicationSchema>;
export type LearningEvent = { id: string; revision: number; previousId: string | null; action: 'PUBLISH' | 'TRANSITION' | 'CORRECTION'; statusId: string; note: string | null; reason: string | null };
export type DailySlot = { definition: CheckpointDefinition; status: CheckpointStatus; event: LearningEvent | null };
export type DailyLearning = { childId: string; date: string; snapshotId: string | null; branchId: string; classroomId: string | null; slots: DailySlot[]; progress: { completed: number; total: number; hidden: boolean }; canPublish: boolean };
export function learningProgress(slots: Pick<DailySlot,'event' | 'status'>[]) {
  return { completed: slots.filter((s) => s.event !== null && s.status.meaning !== 'PENDING').length, total: slots.length, hidden: slots.length === 0 };
}
// Stable semantic mappings: labels and colors never drive reporting.
export const builtInMeanings: Record<string, CheckpointStatus['meaning']> = { UNRECORDED: 'PENDING', PRESENT: 'RESOLVED', ABSENT: 'RESOLVED', NO_CLASS: 'NOT_APPLICABLE', AWAITING_RESULT: 'PENDING', RESULT_PUBLISHED: 'RESOLVED', NO_EXAM: 'NOT_APPLICABLE', CHILD_ABSENT: 'NOT_APPLICABLE', NOT_ASSIGNED: 'PENDING', AWAITING_REVIEW: 'PENDING', COMPLETED: 'RESOLVED', NOT_COMPLETED: 'RESOLVED', EXCUSED: 'NOT_APPLICABLE', NO_HOMEWORK: 'NOT_APPLICABLE' };
export const builtInOutcomes = { ATTENDANCE: ['UNRECORDED','PRESENT','ABSENT','NO_CLASS'], EXAM: ['AWAITING_RESULT','RESULT_PUBLISHED','NO_EXAM','CHILD_ABSENT'], HOMEWORK: ['NOT_ASSIGNED','AWAITING_REVIEW','COMPLETED','NOT_COMPLETED','EXCUSED','NO_HOMEWORK'], STATUS_NOTE: [] };
