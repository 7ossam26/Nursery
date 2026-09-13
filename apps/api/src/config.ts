import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const configSchema = z.object({
  DATABASE_URL: z.url(), APP_ORIGIN: z.url(), SESSION_SECRET: z.string().min(32),
  INSTALLATION_ID: z.uuid(), BUSINESS_TIMEZONE: z.string().min(1), PRIVATE_FILES_DIR: z.string().min(1),
  SUPPORT_CONTACT: z.string().min(1), BACKUP_TARGET: z.string().min(1)
});
export type AppConfig = Readonly<{ databaseUrl: string; appOrigin: string; sessionSecret: string; installationId: string; businessTimezone: string; privateFilesDir: string; supportContact: string; backupTarget: string; production?: boolean }>;
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const input = configSchema.parse(environment);
  return { databaseUrl: input.DATABASE_URL, appOrigin: input.APP_ORIGIN, sessionSecret: input.SESSION_SECRET, installationId: input.INSTALLATION_ID, businessTimezone: input.BUSINESS_TIMEZONE, privateFilesDir: input.PRIVATE_FILES_DIR, supportContact: input.SUPPORT_CONTACT, backupTarget: input.BACKUP_TARGET, production: environment.NODE_ENV === 'production' };
}
