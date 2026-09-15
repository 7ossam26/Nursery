import { access, constants, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeConfigProblems, loadConfig, type AppConfig } from '../../apps/api/src/config.js';
import { runTool } from '../../apps/api/src/modules/support/pg-tools.js';

export const log = (line: string) => process.stdout.write(`${line}\n`);
export const fail = (line: string, code = 1): never => { process.stderr.write(`${line}\n`); process.exit(code); };
export function flag(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`); if (index === -1) return fallback;
  const value = process.argv[index + 1]; return value === undefined || value.startsWith('--') ? 'true' : value;
}
// Operator commands never print secret values: problems are reported by variable name only.
export function requireConfig(): AppConfig {
  const problems = describeConfigProblems(process.env);
  if (problems.length) { for (const problem of problems) process.stderr.write(`- ${problem}\n`); return fail('Configuration is invalid; fix the variables above and retry.'); }
  return loadConfig(process.env);
}
export function requireBackupConfig(config: AppConfig): { backupDir: string; encryptionKey: string; target: string; retention: { daily: number; weekly: number; manual: number } } {
  const backup = config.backup;
  if (!backup?.backupDir || !backup.encryptionKey) return fail('BACKUP_DIR and BACKUP_ENCRYPTION_KEY are required for this command.');
  return { backupDir: backup.backupDir, encryptionKey: backup.encryptionKey, target: backup.target, retention: backup.retention };
}
export async function checkWritable(path: string, label: string): Promise<string[]> {
  try {
    await mkdir(path, { recursive: true, mode: 0o700 }); await access(path, constants.W_OK);
    const probe = join(path, `.write-probe-${process.pid}`); await writeFile(probe, 'ok', { mode: 0o600 }); await rm(probe, { force: true });
    return [];
  } catch (error) { return [`${label} (${path}) is not writable: ${(error as NodeJS.ErrnoException).code ?? 'error'}`]; }
}
export async function checkTools(): Promise<string[]> {
  const problems: string[] = [];
  for (const tool of ['pg_dump', 'pg_restore'] as const) { try { await runTool(tool, ['--version'], {}); } catch { problems.push(`${tool} is not available (install postgresql-client or set PG_BIN_DIR)`); } }
  return problems;
}
