import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

// `off` keeps the socket address; otherwise a list of proxy addresses/CIDRs (or proxy-addr keywords such as
// `uniquelocal` for Docker networks) whose X-Forwarded-* headers are believed. Never `true` (trust everything).
const trustProxySchema = z.string().trim().default('off').transform((value): false | string[] => {
  if (value === '' || value === 'off' || value === 'false') return false;
  return value.split(',').map((part) => part.trim()).filter(Boolean);
}).refine((value) => value === false || !value.some((part) => ['true', '*', 'all'].includes(part.toLowerCase())), 'TRUST_PROXY must list proxy addresses/CIDRs or be off');
const backupTargetSchema = z.string().min(1).refine((value) => value === 'local-development-only' || value === 'none' || /^directory:.+/.test(value), 'BACKUP_TARGET must be local-development-only, none, or directory:<absolute path>');
const configSchema = z.object({
  DATABASE_URL: z.url(), APP_ORIGIN: z.url(), SESSION_SECRET: z.string().min(32),
  INSTALLATION_ID: z.uuid(), BUSINESS_TIMEZONE: z.string().min(1), PRIVATE_FILES_DIR: z.string().min(1),
  SUPPORT_CONTACT: z.string().min(1), BACKUP_TARGET: backupTargetSchema,
  HOST: z.string().min(1).default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: trustProxySchema, WEB_DIST_DIR: z.string().min(1).optional(), RELEASE_VERSION: z.string().trim().min(1).max(120).default('development'),
  BACKUP_DIR: z.string().min(1).optional(), BACKUP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)').optional(),
  BACKUP_SCHEDULE: z.string().trim().regex(/^(\S+\s+){4}\S+$/, 'BACKUP_SCHEDULE must be a five-field cron expression').default('0 2 * * *'),
  BACKUP_RETENTION_DAILY: z.coerce.number().int().min(1).max(365).default(7), BACKUP_RETENTION_WEEKLY: z.coerce.number().int().min(0).max(104).default(4), BACKUP_RETENTION_MANUAL: z.coerce.number().int().min(1).max(100).default(4),
  RESTORE_VALIDATION_DATABASE_URL: z.url().optional(), RESTORE_VALIDATION_FILES_DIR: z.string().min(1).optional(),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000)
});
export type BackupConfig = Readonly<{ backupDir: string | null; encryptionKey: string | null; target: string; schedule: string; retention: Readonly<{ daily: number; weekly: number; manual: number }>; restoreValidationDatabaseUrl: string | null; restoreValidationFilesDir: string | null }>;
export type AppConfig = Readonly<{ databaseUrl: string; appOrigin: string; sessionSecret: string; installationId: string; businessTimezone: string; privateFilesDir: string; supportContact: string; backupTarget: string; production?: boolean;
  host?: string; port?: number; trustProxy?: false | string[]; webDistDir?: string | null; releaseVersion?: string; backup?: BackupConfig; shutdownTimeoutMs?: number }>;
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const input = configSchema.parse(environment);
  const production = environment.NODE_ENV === 'production';
  const problems: string[] = [];
  if (production) {
    const database = new URL(input.DATABASE_URL);
    if (database.protocol !== 'postgresql:' && database.protocol !== 'postgres:') problems.push('DATABASE_URL must use PostgreSQL in production.');
    if (!database.username || !database.password || decodeURIComponent(database.password).length < 8) problems.push('DATABASE_URL must contain a database username and a password of at least 8 characters in production.');
    if (new URL(input.APP_ORIGIN).protocol !== 'https:') problems.push('APP_ORIGIN must use HTTPS in production.');
    if (['development', 'local', 'unknown'].includes(input.RELEASE_VERSION.toLowerCase())) problems.push('RELEASE_VERSION must identify the immutable deployed release in production.');
  }
  if (production && input.BACKUP_TARGET === 'local-development-only') problems.push('BACKUP_TARGET=local-development-only is not allowed in production; configure an off-host directory or set none deliberately.');
  if (input.BACKUP_DIR && !input.BACKUP_ENCRYPTION_KEY) problems.push('BACKUP_ENCRYPTION_KEY is required whenever BACKUP_DIR is configured.');
  if (production && !input.BACKUP_DIR) problems.push('BACKUP_DIR is required in production so scheduled backups have a private destination.');
  if ((input.RESTORE_VALIDATION_DATABASE_URL ? 1 : 0) + (input.RESTORE_VALIDATION_FILES_DIR ? 1 : 0) === 1) problems.push('RESTORE_VALIDATION_DATABASE_URL and RESTORE_VALIDATION_FILES_DIR must be configured together.');
  if (input.RESTORE_VALIDATION_DATABASE_URL && sameDatabase(input.RESTORE_VALIDATION_DATABASE_URL, input.DATABASE_URL)) problems.push('RESTORE_VALIDATION_DATABASE_URL must name a different database than DATABASE_URL.');
  if (input.RESTORE_VALIDATION_FILES_DIR && resolve(input.RESTORE_VALIDATION_FILES_DIR) === resolve(input.PRIVATE_FILES_DIR)) problems.push('RESTORE_VALIDATION_FILES_DIR must differ from PRIVATE_FILES_DIR.');
  if (problems.length) throw new Error(problems.join(' '));
  return {
    databaseUrl: input.DATABASE_URL, appOrigin: input.APP_ORIGIN, sessionSecret: input.SESSION_SECRET, installationId: input.INSTALLATION_ID, businessTimezone: input.BUSINESS_TIMEZONE, privateFilesDir: input.PRIVATE_FILES_DIR, supportContact: input.SUPPORT_CONTACT, backupTarget: input.BACKUP_TARGET, production,
    host: input.HOST, port: input.PORT, trustProxy: input.TRUST_PROXY, webDistDir: input.WEB_DIST_DIR ?? null, releaseVersion: input.RELEASE_VERSION, shutdownTimeoutMs: input.SHUTDOWN_TIMEOUT_MS,
    backup: { backupDir: input.BACKUP_DIR ?? null, encryptionKey: input.BACKUP_ENCRYPTION_KEY?.toLowerCase() ?? null, target: input.BACKUP_TARGET, schedule: input.BACKUP_SCHEDULE, retention: { daily: input.BACKUP_RETENTION_DAILY, weekly: input.BACKUP_RETENTION_WEEKLY, manual: input.BACKUP_RETENTION_MANUAL }, restoreValidationDatabaseUrl: input.RESTORE_VALIDATION_DATABASE_URL ?? null, restoreValidationFilesDir: input.RESTORE_VALIDATION_FILES_DIR ?? null }
  };
}
export function sameDatabase(a: string, b: string): boolean {
  try { const x = new URL(a), y = new URL(b); return x.hostname === y.hostname && (x.port || '5432') === (y.port || '5432') && x.pathname === y.pathname; } catch { return false; }
}
// Operators run this before a deployment; it never prints secret values, only the names of problems.
export function describeConfigProblems(environment: NodeJS.ProcessEnv = process.env): string[] {
  try { loadConfig(environment); return []; }
  catch (error) {
    if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`);
    return [error instanceof Error ? error.message : 'Invalid configuration'];
  }
}
