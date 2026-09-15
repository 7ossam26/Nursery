import { config as loadDotenv } from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../src/index.js';
import { applyMigrations } from '../src/migrate.js';

loadDotenv({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for migrations.');
const database = createDatabase(databaseUrl);
try { await applyMigrations(database.pool, { log: (line) => process.stdout.write(`${line}\n`) }); }
finally { await database.close(); }
