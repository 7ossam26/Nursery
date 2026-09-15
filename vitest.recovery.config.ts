import { defineConfig } from 'vitest/config';
// Backup/restore checks create and drop whole databases and run pg_dump/pg_restore; they run alone so that catalog
// locks and I/O from the parallel integration suite cannot starve fixture setup (see docs/DEPLOYMENT_AND_BACKUP.md).
export default defineConfig({ test: { include: ['tests/integration/backup-restore.test.ts'], environment: 'node', testTimeout: 240_000, hookTimeout: 60_000, fileParallelism: false } });
