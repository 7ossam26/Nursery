import { z } from 'zod';
import type { CheckpointStatus } from './learning.js';
const text = z.string().trim().min(1).max(4000);
const version = z.number().int().min(0);
const reason = z.string().trim().min(1).max(500);
export const homeworkAssignmentSchema = z.object({ classroomId: z.uuid(), title: z.string().trim().min(1).max(160), instructions: text, assignedOn: z.iso.date(), dueOn: z.iso.date(), childIds: z.array(z.uuid()).min(1).max(100), operationId: z.uuid() }).strict().refine((v) => v.dueOn>=v.assignedOn && new Set(v.childIds).size===v.childIds.length);
export const homeworkContentCorrectionSchema = z.object({ expectedVersion: z.number().int().positive(), title: z.string().trim().min(1).max(160), instructions: text, reason, operationId: z.uuid() }).strict();
const note = z.string().trim().max(2000).nullable().default(null).transform((v) => v || null);
export const homeworkOutcomeEntrySchema = z.object({ childId: z.uuid(), statusId: z.uuid(), note, expectedVersion: version }).strict();
export const homeworkOutcomeBatchSchema = z.object({ assignmentId: z.uuid(), date: z.iso.date(), operationId: z.uuid(), entries: z.array(homeworkOutcomeEntrySchema).min(1).max(100) }).strict().refine((v) => new Set(v.entries.map((e) => e.childId)).size===v.entries.length);
export const homeworkOutcomeCorrectionSchema = homeworkOutcomeEntrySchema.extend({ assignmentId: z.uuid(), date: z.iso.date(), operationId: z.uuid(), reason });
export const homeworkNoDaySchema = z.object({ classroomId: z.uuid(), date: z.iso.date(), operationId: z.uuid(), entries: z.array(z.object({ childId: z.uuid(), expectedVersion: version, statusId: z.uuid(), note }).strict()).min(1).max(100) }).strict().refine((v) => new Set(v.entries.map((e) => e.childId)).size===v.entries.length);
export const homeworkHistoryQuerySchema = z.object({ overdue: z.enum(['true','false']).default('false'), from: z.iso.date().optional(), until: z.iso.date().optional(), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict().refine((v) => !v.from || !v.until || v.until>=v.from);
export type HomeworkAssignment = { id: string; classroomId: string; branchId: string; assignedOn: string; dueOn: string; title: string; instructions: string; version: number; corrected: boolean };
export type HomeworkOutcome = { id: string; version: number; status: CheckpointStatus; note: string | null; date: string; reason: string | null };
export type HomeworkEntry = { childId: string; fullName: string; outcome: HomeworkOutcome | null; canRecord: boolean };
export type HomeworkRoster = { assignment: HomeworkAssignment; entries: HomeworkEntry[]; statuses: CheckpointStatus[] };
export type HomeworkHistoryEntry = { assignment: HomeworkAssignment; outcome: HomeworkOutcome | null; overdue: boolean };
export type HomeworkReporting = { meaning: CheckpointStatus['meaning']; outcome: string; due: number; missing: number; future: number; reported: boolean };
// Due-today work drives today's outcome reporting. Old overdue work remains a separate checklist.
export function homeworkReportingRule(due: (string | null)[],future: number,noDay = false): HomeworkReporting {
  const missing = due.filter((v) => v===null).length;
  return { due: due.length,missing,future,reported: due.length>0 || future>0 || noDay,
    outcome: missing>0 ? 'AWAITING_REVIEW' : due.length>0 ? due.every((v) => v==='EXCUSED') ? 'EXCUSED' : due.includes('NOT_COMPLETED') ? 'NOT_COMPLETED' : 'COMPLETED' : future>0 ? 'AWAITING_REVIEW' : noDay ? 'NO_HOMEWORK' : 'NOT_ASSIGNED',
    meaning: missing>0 ? 'PENDING' : due.length>0 ? due.every((v) => v==='EXCUSED') ? 'NOT_APPLICABLE' : 'RESOLVED' : future>0 ? 'RESOLVED' : noDay ? 'NOT_APPLICABLE' : 'PENDING' };
}
