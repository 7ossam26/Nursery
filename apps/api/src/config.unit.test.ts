import { describe, expect, it } from 'vitest';
import { describeConfigProblems, loadConfig } from './config.js';

const validProduction = {
  NODE_ENV: 'production', DATABASE_URL: `postgresql://nursery:${'a'.repeat(32)}@postgres:5432/nursery`, APP_ORIGIN: 'https://nursery.example',
  SESSION_SECRET: 'session-secret-with-at-least-thirty-two-characters', INSTALLATION_ID: '11111111-1111-4111-8111-111111111111', BUSINESS_TIMEZONE: 'Africa/Cairo',
  PRIVATE_FILES_DIR: '/data/private-files', SUPPORT_CONTACT: 'support@example.test', BACKUP_TARGET: 'directory:/offsite', BACKUP_DIR: '/data/backups', BACKUP_ENCRYPTION_KEY: 'ab'.repeat(32), RELEASE_VERSION: 'phase23-4fa331a'
};

describe('production deployment configuration', () => {
  it('accepts an identified HTTPS release with strong database/session/archive secrets', () => {
    expect(() => loadConfig(validProduction)).not.toThrow(); expect(describeConfigProblems(validProduction)).toEqual([]);
  });
  it.each([
    [{ APP_ORIGIN: 'http://nursery.example' }, 'APP_ORIGIN must use HTTPS'],
    [{ DATABASE_URL: 'postgresql://nursery:short@postgres:5432/nursery' }, 'password of at least 32 characters'],
    [{ RELEASE_VERSION: 'development' }, 'immutable deployed release'],
    [{ BACKUP_TARGET: 'local-development-only' }, 'not allowed in production']
  ] as const)('rejects unsafe production input %j', (change, message) => {
    expect(describeConfigProblems({ ...validProduction, ...change }).join(' ')).toContain(message);
  });
});
