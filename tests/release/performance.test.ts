import { it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cairoIsoDate } from '@nursery/domain';
import type { CollectionInput } from '@nursery/contracts';
import { financeFixture, reconcileFinance } from '../helpers/finance.js';
import { defaultLimitsInput } from '../helpers/licensing.js';
import { keyedHash } from '../../apps/api/src/modules/auth/crypto.js';
import { explainServiceReads } from '../helpers/query-plans.js';

function configured(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer in ${min}..${max}`);
  return value;
}
function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples: samples.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
}

it('measures authenticated reads, real collection commits and live invalidation on a moderate isolated fixture', async () => {
  const childrenCount = configured('PERF_CHILDREN', 300, 20, 1000);
  const staffCount = configured('PERF_STAFF', 50, 2, 100);
  const concurrency = configured('PERF_CONCURRENCY', 5, 1, 10);
  const samples = configured('PERF_SAMPLES', 100, 20, 500);
  const f = await financeFixture();
  const directory = resolve('output/phase24');
  await mkdir(directory, { recursive: true });
  const results: Record<string, unknown> = {};
  try {
    const limits = (await f.licensing.context(f.root.token)).limits!;
    await f.licensing.saveLimits(f.root.token, { expectedVersion: limits.version, value: { ...defaultLimitsInput, parentCapacity: childrenCount, employeeCapacity: staffCount } });
    const date = cairoIsoDate();
    const children: { id: string; branchId: typeof f.a.id; accountId: typeof f.cashA.id }[] = [];
    let parentToken = '';
    // Domain-created families preserve seat, link, placement and audit invariants.
    for (let offset = 0; offset < childrenCount; offset += 10) {
      const branchId = offset % 20 === 0 ? f.a.id : f.b.id;
      const classroomId = branchId === f.a.id ? f.classes[0].id : f.classes[2].id;
      const family = f.family(`PERF-${offset}`, branchId, classroomId);
      family.children = Array.from({ length: Math.min(10, childrenCount - offset) }, (_, i) => ({
        child: { ...family.children[0].child, code: `PERF-${offset + i}`, fullName: `Synthetic child ${offset + i}` },
        links: family.children[0].links.map(link => ({ ...link, permissions: { ...link.permissions, finance: true } }))
      }));
      const created = await f.children.onboard(f.root.token, family);
      children.push(...created.childIds.map(id => ({ id, branchId, accountId: branchId === f.a.id ? f.cashA.id : f.cashB.id })));
      if (offset === 0) parentToken = (await f.parent(created.guardianIds[0], family.guardians[0].kind === 'NEW' ? family.guardians[0].username : '', created.credentials![0].temporaryPassword)).token;
    }
    for (let i = 0; i < staffCount; i++) await f.licensing.provisionStaff(f.root.token, { username: `perf-staff-${i}` });
    const inputs: CollectionInput[] = [];
    for (let i = 0; i < Math.max(childrenCount, samples); i++) {
      const child = children[i % childrenCount];
      const charge = await f.charge(child.id, '10000');
      if (i < samples) inputs.push(f.collect(charge.installmentIds[0], '10000', child.branchId, child.accountId));
    }
    // Retained attendance history and immutable configuration snapshots exist before reads.
    const draft = await f.app.attendance.classroom(f.root.token, f.classes[0].id, date);
    await f.app.attendance.publishClassroom(f.root.token, { operationId: crypto.randomUUID(), classroomId: f.classes[0].id, date,
      entries: draft.entries.map(entry => ({ childId: entry.childId, expectedVersion: 0, statusId: entry.definition.statuses.find(s => s.outcome === 'PRESENT')!.id, absenceReason: null })) });
    await f.database.pool.query('analyze');
    await f.app.homework.publish(f.root.token, { operationId: crypto.randomUUID(), classroomId: f.classes[0].id, assignedOn: date, dueOn: date, title: 'Retained homework', instructions: 'Synthetic history', childIds: [children[0].id] });
    results.environment = { recordedAt: new Date().toISOString(), baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(), node: process.version,
      os: `${platform()} ${release()}`, cpu: cpus()[0].model, logicalCpus: cpus().length, memoryGiB: totalmem() / 1024 ** 3,
      postgres: (await f.database.pool.query('select version() as version')).rows[0].version,
      database: 'Disposable schema on the explicitly configured DATABASE_URL; no URL/credentials stored', poolMax: 10 };
    results.fixture = { branches: 2, classrooms: 3, children: childrenCount, staff: staffCount, guardians: Math.ceil(childrenCount / 10), obligations: Math.max(childrenCount, samples), attendancePublished: draft.entries.length, concurrency, samples, date };
    results.method = 'Fastify inject elapsed includes authentication, service SQL/locks, transaction commit and JSON serialization; excludes network/TLS. 5 warmups per read; nearest-rank p95. Writes are distinct real payments without warmup. Live is loopback HTTP publication-to-invalidation plus authenticated fresh history, not browser paint.';
    async function measure(work: (index: number) => Promise<unknown>, warmup = true) {
      if (warmup) for (let i = 0; i < 5; i++) await work(i);
      const times: number[] = [];
      let next = 0;
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (next < samples) { const index = next++; const started = performance.now(); await work(index); times.push(performance.now() - started); }
      }));
      return summary(times);
    }
    const headers = { cookie: `__Host-nursery_session=${f.root.token}` };
    const read = async (url: string, token = f.root.token) => {
      const response = await f.app.inject({ method: 'GET', url, headers: { cookie: `__Host-nursery_session=${token}` } });
      expect(response.statusCode, response.body.slice(0, 300)).toBe(200);
      return response.json().data;
    };
    const timings: Record<string, ReturnType<typeof summary>> = {};
    results.timings = timings;
    for (const [name, url, token] of [
      ['outstanding', `/api/v1/reports?kind=OUTSTANDING&from=2026-01-01&to=${date}&limit=20`, f.root.token],
      ['attendance', `/api/v1/attendance/classrooms/${f.classes[0].id}/draft?date=${date}`, f.root.token],
      ['guardianHistory', `/api/v1/homework/children/${children[0].id}/history?limit=20&offset=0`, parentToken]
    ]) timings[name] = await measure(() => read(url, token));
    timings.collection = await measure(async index => {
      const response = await f.app.inject({ method: 'POST', url: '/api/v1/payments', headers: { ...headers, origin: f.config.appOrigin, 'x-csrf-token': keyedHash(f.config.sessionSecret, `session-csrf:${f.root.token}`) }, payload: inputs[index] });
      expect(response.statusCode, response.body.slice(0, 300)).toBe(200);
    }, false);
    expect(await reconcileFinance(f.database)).toEqual([]);
    expect((await f.database.pool.query('select count(*)::int as count from receipts')).rows[0].count).toBe(samples);
    results.timings = timings;
    const plans: Record<string, unknown> = {};
    for (const kind of ['OUTSTANDING', 'ATTENDANCE'] as const) plans[kind] = await f.children.withPolicy(f.root.token, (tx, p) => f.app.reports.engine.explain(tx, p, { kind, from: date, to: date, limit: 20, offset: 0 }));
    plans.guardianHistory = await explainServiceReads(f.database, () => f.app.homework.history(parentToken, children[0].id, {limit:20,offset:0}), sql => /from homework_(assignments|outcomes)/.test(sql));
    plans.attendanceDraft = await explainServiceReads(f.database, () => f.app.attendance.classroom(f.root.token,f.classes[0].id,date), sql => /from (children|daily_snapshots|attendance_planned_absences)/.test(sql));
    await writeFile(resolve(directory, 'query-plans.json'), JSON.stringify(plans, null, 2));
    const url = await f.app.listen({ host: '127.0.0.1', port: 0 });
    const abort = new AbortController();
    const response = await fetch(`${url}/api/v1/parent/live?childId=${children[0].id}`, { headers: { cookie: `__Host-nursery_session=${parentToken}` }, signal: abort.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    async function event(name: string) {
      const timeout = setTimeout(() => abort.abort(), 10_000);
      let wire = '';
      try { while (!wire.includes(`event: ${name}`)) { const chunk = await reader.read(); if (chunk.done) throw new Error('SSE ended before expected event'); wire += new TextDecoder().decode(chunk.value); } }
      finally { clearTimeout(timeout); }
      expect(wire).not.toContain(children[0].id);
    }
    const live: number[] = [];
    try {
      await event('snapshot');
      for (let i = 0; i < 10; i++) {
        const started = performance.now();
        const announcement = await f.app.communication.publish(f.root.token, { operationId: crypto.randomUUID(), title: `Measured update ${i}`, body: 'Synthetic live update', target: { kind: 'CHILDREN', ids: [children[0].id] }, acknowledgmentRequired: false, holiday: null });
        await event('invalidate');
        expect((await f.app.communication.announcement(parentToken, announcement.id)).title).toBe(`Measured update ${i}`);
        live.push(performance.now() - started);
      }
    } finally { abort.abort(); await reader.cancel().catch(() => {}); }
    timings.liveFreshRead = summary(live);
    results.targets = { readsP95Under500ms: ['outstanding', 'attendance', 'guardianHistory'].every(key => timings[key].p95Ms < 500), collectionsP95Under1000ms: timings.collection.p95Ms < 1000, liveAllUnder5000ms: live.every(ms => ms < 5000) };
    // A latency failure remains an explicit failure with measurements saved for diagnosis.
    expect(results.targets).toEqual({ readsP95Under500ms: true, collectionsP95Under1000ms: true, liveAllUnder5000ms: true });
  } catch (error) { results.error = error instanceof Error ? error.message : String(error); throw error; }
  finally { await writeFile(resolve(directory, 'performance.json'), JSON.stringify(results, null, 2)); await f.close(); }
});
