import { z } from 'zod';
import type { CheckpointDefinition, DailyLearning, LearningEvent } from './learning.js';

const reason = z.string().trim().max(500).nullable().default(null).transform((value) => value || null);
export const attendanceEntrySchema = z.object({
  childId: z.uuid(), statusId: z.uuid(), absenceReason: reason, expectedVersion: z.number().int().min(0)
}).strict();
export const attendanceClassroomPublicationSchema = z.object({
  classroomId: z.uuid(), date: z.iso.date(), operationId: z.uuid(), entries: z.array(attendanceEntrySchema).min(1).max(100)
}).strict().refine((value) => new Set(value.entries.map((entry) => entry.childId)).size === value.entries.length);
export const attendanceCorrectionSchema = attendanceEntrySchema.extend({
  date: z.iso.date(), operationId: z.uuid(), reason: z.string().trim().min(1).max(500)
});
export const noClassDaySchema = z.object({ classroomId: z.uuid(), date: z.iso.date(), operationId: z.uuid(), offset: z.number().int().min(0).max(100000).optional() }).strict();
export const plannedAbsenceSchema = z.object({
  childId: z.uuid(), from: z.iso.date(), until: z.iso.date(), reason
}).strict().refine((value) => value.until >= value.from);

export type AttendancePresence = 'PRESENT' | 'ABSENT' | 'NO_CLASS';
export type AttendanceRecord = { event: LearningEvent; presence: AttendancePresence; absenceReason: string | null };
export type PlannedAbsence = { date: string; reason: string | null; version: number };
export type AttendanceRosterEntry = {
  childId: string; fullName: string; definition: CheckpointDefinition; record: AttendanceRecord | null; notices: PlannedAbsence[];
};
export type AttendanceClassroomDraft = {
  classroomId: string; classroomName: string; date: string; entries: AttendanceRosterEntry[]; complete: number; total: number; noClass: boolean;
};
export type AttendanceDailyReport = DailyLearning & { attendance: AttendanceRecord | null; plannedAbsences: PlannedAbsence[] };
