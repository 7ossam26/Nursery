import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { AppConfig } from './config.js';

const config: AppConfig = {
  databaseUrl: 'postgresql://unreachable/unreachable', appOrigin: 'http://localhost:5173', sessionSecret: '01234567890123456789012345678901',
  installationId: '00000000-0000-4000-8000-000000000001', businessTimezone: 'Africa/Cairo', privateFilesDir: './private-files', supportContact: 'Support team', backupTarget: 'local-development-only'
};
const database = {
  checkConnection: async () => { throw new Error('database unavailable'); },
  close: async () => undefined
};
const app = buildApp(config, database);
app.get('/api/v1/private-probe', async () => ({ privateData: true }));

describe('readiness endpoint', () => {
  afterAll(async () => { await app.close(); });
  it('returns a safe 503 response when PostgreSQL is unavailable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/readiness' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'not_ready' });
    expect(response.body).not.toContain('postgresql://');
  });
  it('denies a route unless it is explicitly public', async () => {
    const response = await app.inject('/api/v1/private-probe');
    expect(response.statusCode).toBe(401); expect(response.json().code).toBe('UNAUTHORIZED');
    expect(response.body).not.toContain('privateData');
  });
  it('refuses insecure production or non-HTTP development origins', () => {
    expect(() => buildApp({ ...config, production: true }, database)).toThrow('HTTPS');
    expect(() => buildApp({ ...config, appOrigin: 'ftp://localhost' }, database)).toThrow('HTTPS');
    expect(() => buildApp({ ...config, appOrigin: 'http://nursery.example' }, database)).toThrow('HTTPS');
  });
});
