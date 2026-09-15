import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { decryptFile, encryptingStream, parseKey, sha256File } from './archive-crypto.js';
import { finishTar, parseTarHeader, readTar, tarHeader, writeTarEntry } from './tar.js';
import { isoWeekKey, selectExpired, type RecoverySet } from './retention.js';
import { connectionArguments, redact } from './pg-tools.js';
import { describeConfigProblems, loadConfig } from '../../config.js';

const directory = await mkdtemp(join(tmpdir(), 'nursery-backup-unit-'));
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
async function collect(source: AsyncIterable<Buffer>) { const chunks: Buffer[] = []; for await (const chunk of source) chunks.push(chunk); return Buffer.concat(chunks); }

describe('ustar archive', () => {
  it('round-trips entries of odd sizes and rejects a corrupted header checksum', async () => {
    const path = join(directory, 'plain.tar'); const out = createWriteStream(path);
    const big = randomBytes(1_500_000);
    const hashes = [await writeTarEntry(out, 'files/child-documents/a.blob', 3, Buffer.from('abc')), await writeTarEntry(out, 'database.dump', 0, Buffer.alloc(0)), await writeTarEntry(out, 'files/report-exports/b.blob', big.length, big)];
    await finishTar(out); out.end(); await once(out, 'finish');
    const seen: { name: string; size: number; body: Buffer }[] = [];
    for await (const entry of readTar(createReadStream(path))) seen.push({ name: entry.name, size: entry.size, body: await collect(entry.body) });
    expect(seen.map((e) => [e.name, e.size])).toEqual([['files/child-documents/a.blob', 3], ['database.dump', 0], ['files/report-exports/b.blob', big.length]]);
    expect(seen[2].body.equals(big)).toBe(true); expect(hashes[0]).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    // Entry bodies may be skipped without draining them.
    const names: string[] = []; for await (const entry of readTar(createReadStream(path))) names.push(entry.name); expect(names).toHaveLength(3);
    const header = tarHeader('x', 1); header[0] ^= 0xff; expect(() => parseTarHeader(header)).toThrow('checksum');
    expect(() => tarHeader('n'.repeat(101), 1)).toThrow('too long');
    // Cross-check with the system tar reader when one exists (bsdtar ships with Windows 10+ and most Linux images).
    try { const { stdout } = await promisify(execFile)('tar', ['-tf', 'plain.tar'], { cwd: directory }); expect(stdout.trim().split(/\r?\n/)).toEqual(['files/child-documents/a.blob', 'database.dump', 'files/report-exports/b.blob']); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  });
});

describe('archive encryption', () => {
  const key = parseKey('a'.repeat(64));
  it('decrypts what it encrypted and refuses tampering, truncation, a wrong key and a foreign file', async () => {
    const plain = randomBytes(70_001); const path = join(directory, 'set.tar.enc');
    const out = createWriteStream(path); const cipher = encryptingStream(key); cipher.pipe(out); cipher.end(plain); await once(out, 'finish');
    expect((await collect(decryptFile(path, key))).equals(plain)).toBe(true);
    const bytes = await readFile(path); expect(bytes.subarray(0, 4).toString()).toBe('NBK1'); expect(bytes.length).toBe(4 + 12 + plain.length + 16);
    const flipped = Buffer.from(bytes); flipped[40] ^= 1; await writeFile(join(directory, 'flipped.enc'), flipped);
    await expect(collect(decryptFile(join(directory, 'flipped.enc'), key))).rejects.toThrow();
    await writeFile(join(directory, 'short.enc'), bytes.subarray(0, bytes.length - 5));
    await expect(collect(decryptFile(join(directory, 'short.enc'), key))).rejects.toThrow();
    await expect(collect(decryptFile(path, parseKey('b'.repeat(64))))).rejects.toThrow();
    await writeFile(join(directory, 'foreign.enc'), randomBytes(64));
    await expect(collect(decryptFile(join(directory, 'foreign.enc'), key))).rejects.toThrow('not a recovery set');
    expect(await sha256File(join(directory, 'foreign.enc'))).toMatch(/^[0-9a-f]{64}$/);
    expect(() => parseKey('zz')).toThrow();
  });
});

describe('retention policy (D23)', () => {
  const at = (day: string) => new Date(`${day}T02:00:00Z`);
  it('keeps seven daily plus four weekly scheduled sets and a bounded number of manual sets', () => {
    const sets: RecoverySet<string>[] = [];
    for (let i = 0; i < 60; i++) { const date = new Date(Date.UTC(2026, 8, 15) - i * 86_400_000); sets.push({ kind: 'SCHEDULED', createdAt: date, ref: date.toISOString().slice(0, 10) }); }
    for (let i = 0; i < 6; i++) sets.push({ kind: 'MANUAL', createdAt: at(`2026-08-0${i + 1}`), ref: `manual-${i + 1}` });
    sets.push({ kind: 'PRE_UPGRADE', createdAt: at('2026-07-01'), ref: 'upgrade' });
    const expired = selectExpired(sets, { daily: 7, weekly: 4, manual: 4 }); const kept = sets.filter((s) => !expired.includes(s)).map((s) => s.ref).sort();
    // 2026-09-15 is a Tuesday: the seven daily sets end on 09-09, so the newest weekly slot is Monday 09-08 of that same ISO week.
    expect(kept).toEqual(['2026-08-23', '2026-08-30', '2026-09-06', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', 'manual-3', 'manual-4', 'manual-5', 'manual-6', 'upgrade']);
    expect(isoWeekKey(at('2026-01-01'))).toBe('2026-W01'); expect(isoWeekKey(at('2024-12-30'))).toBe('2025-W01');
    expect(selectExpired([], { daily: 7, weekly: 4, manual: 4 })).toEqual([]);
  });
});

describe('PostgreSQL tool arguments', () => {
  it('moves the password into the environment and redacts URLs and passwords from diagnostics', () => {
    const c = connectionArguments('postgresql://nursery:s3cr%40t@db:5433/nursery_x?options=-c%20search_path%3Dtest_schema&sslmode=require');
    expect(c.args).toEqual(['--host', 'db', '--port', '5433', '--dbname', 'nursery_x', '--username', 'nursery', '--no-password']);
    expect(c.env).toEqual({ PGPASSWORD: 's3cr@t', PGSSLMODE: 'require' }); expect(c.searchPath).toBe('test_schema');
    expect(redact('pg_dump: error: connection to postgresql://nursery:s3cr@t@db/x failed PGPASSWORD=abc')).toBe('pg_dump: error: connection to [redacted-url] failed PGPASSWORD=[redacted]');
    expect(() => connectionArguments('mysql://x/y')).toThrow('PostgreSQL');
  });
});

describe('deployment configuration', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@db/nursery', APP_ORIGIN: 'https://nursery.example', SESSION_SECRET: 's'.repeat(40), INSTALLATION_ID: '00000000-0000-4000-8000-000000000001', BUSINESS_TIMEZONE: 'Africa/Cairo', PRIVATE_FILES_DIR: '/data/private', SUPPORT_CONTACT: 'Support', BACKUP_TARGET: 'none' };
  it('applies safe defaults, parses proxy trust, and names production problems without echoing secret values', () => {
    const config = loadConfig({ ...base, TRUST_PROXY: 'uniquelocal, 10.0.0.0/8', BACKUP_DIR: '/data/backups', BACKUP_ENCRYPTION_KEY: 'A'.repeat(64) });
    expect(config.host).toBe('127.0.0.1'); expect(config.port).toBe(3000); expect(config.trustProxy).toEqual(['uniquelocal', '10.0.0.0/8']); expect(config.backup?.retention).toEqual({ daily: 7, weekly: 4, manual: 4 });
    expect(config.backup?.encryptionKey).toBe('a'.repeat(64)); expect(config.backup?.schedule).toBe('0 2 * * *'); expect(config.releaseVersion).toBe('development');
    expect(loadConfig({ ...base, TRUST_PROXY: 'off' }).trustProxy).toBe(false);
    expect(describeConfigProblems({ ...base, TRUST_PROXY: 'true' })).toEqual([expect.stringContaining('TRUST_PROXY')]);
    expect(describeConfigProblems({ ...base, BACKUP_DIR: '/data/backups' })).toEqual([expect.stringContaining('BACKUP_ENCRYPTION_KEY is required')]);
    expect(describeConfigProblems({ ...base, BACKUP_TARGET: 'ftp://x' })).toEqual([expect.stringContaining('BACKUP_TARGET')]);
    const production = describeConfigProblems({ ...base, NODE_ENV: 'production', BACKUP_TARGET: 'local-development-only' });
    expect(production.join(' ')).toContain('BACKUP_DIR is required'); expect(production.join(' ')).toContain('local-development-only'); expect(production.join(' ')).not.toContain('u:p@');
    expect(describeConfigProblems({ ...base, BACKUP_DIR: '/b', BACKUP_ENCRYPTION_KEY: 'a'.repeat(64), RESTORE_VALIDATION_DATABASE_URL: base.DATABASE_URL, RESTORE_VALIDATION_FILES_DIR: '/data/private' }).join(' ')).toMatch(/different database.*differ from PRIVATE_FILES_DIR/);
    expect(describeConfigProblems({ ...base, RESTORE_VALIDATION_DATABASE_URL: 'postgresql://u:p@db/other' })).toEqual([expect.stringContaining('configured together')]);
    expect(describeConfigProblems({ ...base, BACKUP_SCHEDULE: 'daily' })).toEqual([expect.stringContaining('BACKUP_SCHEDULE')]);
  });
});

describe('encrypted archive reading', () => {
  it('fails on a tampered archive even when the tar end marker appears before the authentication tag', async () => {
    const key = parseKey('a'.repeat(64)); const path = join(directory, 'tampered.tar.enc'); const plain = createWriteStream(join(directory, 'plain2.tar'));
    await writeTarEntry(plain, 'database.dump', 5, Buffer.from('hello')); await finishTar(plain); plain.end(); await once(plain, 'finish');
    const out = createWriteStream(path); const cipher = encryptingStream(key); cipher.pipe(out); cipher.end(await readFile(join(directory, 'plain2.tar'))); await once(out, 'finish');
    const bytes = await readFile(path); bytes[bytes.length - 40] ^= 1; await writeFile(path, bytes);
    await expect((async () => { for await (const entry of readTar(decryptFile(path, key))) await collect(entry.body); })()).rejects.toThrow();
  });
});
