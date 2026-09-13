import { z } from 'zod';
import { createDatabase } from '@nursery/db';
import { passwordSchema, usernameSchema } from '@nursery/contracts';
import { loadConfig } from './config.js';
import { AuthService } from './modules/auth/service.js';
import { SafeError } from './errors.js';

// Redirect JSON from an operator-controlled secret source. Never put passwords in argv or output.
async function main() {
  const mode = process.argv[2];
  if (!['bootstrap', 'recover-system'].includes(mode) || process.argv.length !== 3 || process.stdin.isTTY) throw new Error('invalid command');
  let input = '';
  for await (const chunk of process.stdin) { input += String(chunk); if (Buffer.byteLength(input) > 4096) throw new Error('input too large'); }
  const payload: unknown = JSON.parse(input); input = '';
  const config = loadConfig(); const database = createDatabase(config.databaseUrl);
  try {
    const service = new AuthService(database, config.installationId, config.sessionSecret);
    if (mode === 'bootstrap') {
      const credentials = z.object({ username: usernameSchema, password: passwordSchema }).strict().parse(payload);
      await service.bootstrap(credentials.username, credentials.password);
    } else {
      const credentials = z.object({ password: passwordSchema }).strict().parse(payload);
      await service.recoverSystem(credentials.password);
    }
    process.stdout.write('Credential setup completed. Sign in once within 24 hours and change the temporary password.\n');
  } finally { await database.close(); }
}
main().catch((error: unknown) => {
  process.stderr.write(error instanceof SafeError ? `Credential setup failed: ${error.code}.\n` : 'Credential setup failed. Check command, private stdin JSON, configuration, and migrations.\n');
  process.exitCode = 1;
});
