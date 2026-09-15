import { defineConfig } from 'vitest/config';

// Run alone: latency measurements must not contend with the regression suites.
export default defineConfig({ test: { include: ['tests/release/**/*.test.ts'], environment: 'node', maxWorkers: 1, testTimeout: 300_000 } });
