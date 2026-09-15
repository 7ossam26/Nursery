import { z } from 'zod';

// Phase 23: Superadmin support tools. Fixed, validated job types only — no shell, SQL or filesystem browsing.
export const backupKindSchema = z.enum(['SCHEDULED', 'MANUAL', 'PRE_UPGRADE', 'PRE_RESTORE']);
export const backupStatusSchema = z.enum(['REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED']);
export const restoreValidationStatusSchema = z.enum(['REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED']);
const reason = z.string().trim().min(1).max(500);
export const backupRequestSchema = z.object({ reason }).strict();
export const restoreValidationRequestSchema = z.object({ backupRunId: z.uuid(), operatorPassword: z.string().min(1).max(128), confirmArchiveName: z.string().trim().min(1).max(200), reason }).strict();
export const supportAuditQuerySchema = z.object({
  query: z.string().trim().max(120).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
}).strict();
export const supportAccountQuerySchema = z.object({ query: z.string().trim().min(1).max(64) }).strict();

export type BackupRunSummary = {
  id: string; kind: z.infer<typeof backupKindSchema>; status: z.infer<typeof backupStatusSchema>; requestedAt: string; startedAt: string | null; finishedAt: string | null;
  requestedBy: string | null; reason: string | null; releaseVersion: string | null; schemaVersion: string | null; archiveName: string | null; archiveBytes: number | null; archiveSha256: string | null;
  fileCount: number | null; offsiteCopiedAt: string | null; archiveDeletedAt: string | null; errorCode: string | null;
};
export type RestoreValidationSummary = {
  id: string; backupRunId: string; archiveName: string | null; status: z.infer<typeof restoreValidationStatusSchema>; requestedAt: string; finishedAt: string | null; requestedBy: string;
  targetLabel: string | null; errorCode: string | null; report: Record<string, unknown> | null;
};
export type SupportQueueState = { name: string; state: string; count: number; oldestCreatedAt: string | null };
export type SupportStatus = {
  installation: { id: string; releaseVersion: string; schemaVersion: string | null; pendingMigrations: number; licenseStatus: string; supportContact: string; now: string };
  worker: { lastSeenAt: string | null; releaseVersion: string | null; ageSeconds: number | null; healthy: boolean };
  queues: SupportQueueState[]; failedJobs24h: number; overdueJobs: number;
  billing: { lastOccurrenceAt: string | null; lastReminderAt: string | null };
  backups: { configured: boolean; offsiteConfigured: boolean; last: BackupRunSummary | null; lastSuccessfulAt: string | null; ageHours: number | null; failedLast7Days: number; restoreValidationConfigured: boolean };
  storage: { privateFiles: { totalBytes: number; freeBytes: number } | null; backups: { totalBytes: number; freeBytes: number } | null };
};
export type SupportAuditEvent = { source: 'auth' | 'licensing' | 'support' | 'finance' | 'children'; event: string; actorId: string | null; actorUsername: string | null; targetId: string | null; createdAt: string; details: Record<string, unknown> | null };
export type SupportAccount = { id: string; username: string; kind: 'SYSTEM' | 'STAFF' | 'GUARDIAN'; status: string; statusUntil: string | null; mustChangePassword: boolean; reservationActive: boolean; lastLoginAt: string | null; version: number };
export type ChildDependents = { childId: string; code: string; fullName: string; status: string; version: number; guardianLinks: number; obligations: number; outstandingPiastres: string; receipts: number; documents: number; attendanceRecords: number; learningRecords: number };
