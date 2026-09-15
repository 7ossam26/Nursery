import 'dotenv/config';
import { assertInstallationIdentity, createDatabase, schemaStatus } from '@nursery/db';
import { checkTools, checkWritable, fail, log, requireConfig } from './common.js';

// Step 1 of the start/upgrade sequence: configuration, storage permissions, tools and database reachability.
const config = requireConfig();
const problems = [...(await checkWritable(config.privateFilesDir, 'PRIVATE_FILES_DIR')), ...(config.backup?.backupDir ? await checkWritable(config.backup.backupDir, 'BACKUP_DIR') : []), ...(config.backup?.restoreValidationFilesDir ? await checkWritable(config.backup.restoreValidationFilesDir, 'RESTORE_VALIDATION_FILES_DIR') : []), ...(config.backup?.backupDir ? await checkTools() : [])];
if (config.backup?.target.startsWith('directory:')) problems.push(...await checkWritable(config.backup.target.slice('directory:'.length), 'BACKUP_TARGET directory'));
const database = createDatabase(config.databaseUrl);
try {
  await database.checkConnection();
  const status = await schemaStatus(database.pool);
  await assertInstallationIdentity(database.pool, config.installationId);
  log(`database reachable; schema ${status.version ?? 'empty'}; pending migrations ${status.pending.length}; unknown migrations ${status.unknown.length}`);
  if (status.unknown.length) problems.push(`database schema is ahead of this release: ${status.unknown.join(', ')}`);
} catch (error) {
  const code = (error as { code?: string }).code;
  problems.push(code ? `database unreachable: ${code}` : error instanceof Error ? error.message : 'database check failed');
} finally { await database.close(); }
if (config.backup?.restoreValidationDatabaseUrl) {
  const validation = createDatabase(config.backup.restoreValidationDatabaseUrl);
  try { await validation.checkConnection(); log('restore validation database reachable'); }
  catch (error) { problems.push(`restore validation database unreachable: ${(error as { code?: string }).code ?? 'connection failed'}`); }
  finally { await validation.close(); }
}
log(`release ${config.releaseVersion}; installation ${config.installationId}; origin ${config.appOrigin}; backups ${config.backup?.backupDir ? 'configured' : 'NOT configured'}; offsite ${config.backup?.target}; restore validation target ${config.backup?.restoreValidationDatabaseUrl ? 'configured' : 'not configured'}`);
if (problems.length) { for (const problem of problems) process.stderr.write(`- ${problem}\n`); fail('Environment check failed.'); }
log('Environment check passed.');
