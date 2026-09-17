// Local visual-review server. All records live in the existing helper's disposable PostgreSQL
// schema and temporary private-file directory. No production fixture or route is added.
// Run: npx tsx tests/scripts/ui-consistency-preview.ts
// Send "stop" on stdin (or Ctrl+C) to close the servers and remove the disposable fixture.
import { createServer } from 'vite';
import { resolve } from 'node:path';
import { cairoIsoDate } from '@nursery/domain';
import { financeFixture } from '../helpers/finance.js';

const fixture = await financeFixture(false);
let web: Awaited<ReturnType<typeof createServer>> | undefined;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await web?.close();
  await fixture.close();
  console.log('Visual fixture closed; isolated schema and temporary files removed.');
  process.exit(0);
}

try {
  const today = cairoIsoDate();
  const family = await fixture.child('VISUAL');
  await fixture.child('SECOND', fixture.b.id, fixture.classes[2].id);
  await fixture.parent(family.guardianIds[0], 'parent-visual', family.credentials[0].temporaryPassword);
  const teacher = await fixture.financeStaff([fixture.a.id], [fixture.classes[0].id], 'CLASSROOM', ['learning.read', 'learning.publish', 'activities.read']);
  const charge = await fixture.charge(family.childId, '125000');
  await fixture.payments.collect(fixture.root.token, fixture.collect(charge.installmentIds[0], '25000'));
  await fixture.app.transport.subscribe(fixture.root.token, { operationId: crypto.randomUUID(), childId: family.childId, categoryId: fixture.bus.id, periodStart: today, periodEnd: today, amount: '0', dueOn: today, administrativePermission: true });
  const trip = await fixture.ledger.category(fixture.root.token, { operationId: crypto.randomUUID(), code: 'VISUAL-TRIP', name: 'Classroom outing', kind: 'TRIP' });
  await fixture.app.transport.createActivity(fixture.root.token, { operationId: crypto.randomUUID(), branchId: fixture.a.id, categoryId: trip.id, title: 'A day of learning together', details: 'Classroom activity with the existing nursery workflow.', eventDate: today, fee: '0', dueOn: today, childIds: [family.childId] });
  const notice = await fixture.app.communication.publish(fixture.root.token, { operationId: crypto.randomUUID(), title: 'Reading together · القراءة مع بعض', body: 'Please bring a favourite book to our next classroom reading activity.', target: { kind: 'CHILDREN', ids: [family.childId] }, acknowledgmentRequired: true });
  await fixture.app.homework.publish(fixture.root.token, { operationId: crypto.randomUUID(), classroomId: fixture.classes[0].id, assignedOn: today, dueOn: today, title: 'Read with family', instructions: 'Read a favourite story together.', childIds: [family.childId] });

  // The fixture config is shared with the unchanged application's origin checks.
  fixture.config.appOrigin = 'http://localhost:5180';
  const apiOrigin = await fixture.app.listen({ host: '127.0.0.1', port: 0 });
  web = await createServer({ root: resolve('apps/web'), configFile: resolve('apps/web/vite.config.ts'), server: { host: 'localhost', port: 5180, strictPort: true, proxy: { '/api': apiOrigin } } });
  await web.listen();
  console.log(JSON.stringify({ origin: fixture.config.appOrigin, childId: family.childId, noticeId: notice.id, accounts: {
    system: { username: fixture.root.account.username, password: fixture.password },
    teacher: { username: teacher.username, password: teacher.password },
    parent: { username: 'parent-visual', password: `Permanent guardian secret ${family.guardianIds[0]}` }
  } }, null, 2));
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (data: string) => { if (data.trim() === 'stop') void close(); });
  process.on('SIGINT', () => void close());
  process.on('SIGTERM', () => void close());
} catch (error) {
  await web?.close();
  await fixture.close();
  throw error;
}
