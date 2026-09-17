import { loadConfig } from './config.js';
import { createDatabase } from '@nursery/db';
import { AuthService } from './modules/auth/service.js';

async function seed() {
  const config = loadConfig();
  const database = createDatabase(config.databaseUrl);
  try {
    const existing = await database.pool.query("select 1 from accounts where kind='SYSTEM'");
    if (existing.rowCount && existing.rowCount > 0) {
      process.stdout.write('Superadmin account already exists. Skipping automatic seed.\n');
      return;
    }

    const username = 'superadmin';
    const password = 'SuperAdmin1234567!';

    const auth = new AuthService(database, config.installationId, config.sessionSecret);
    await auth.bootstrap(username, password);

    // Make the password permanent so it does not expire after 24 hours
    await database.pool.query("update accounts set must_change_password=false, temporary_expires_at=null where kind='SYSTEM'");

    process.stdout.write(`[SEED] Superadmin account created successfully: username="${username}"\n`);
  } catch (err: unknown) {
    process.stderr.write(`[SEED] Superadmin seed note: ${(err as Error)?.message || err}\n`);
  } finally {
    await database.close();
  }
}

seed();
