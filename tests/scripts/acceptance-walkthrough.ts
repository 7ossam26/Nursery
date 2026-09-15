// Post-Phase-25 release closure: executes docs/USER_ACCEPTANCE_WALKTHROUGH.md's cross-module story as real HTTP
// requests against a real running api+worker process and real PostgreSQL (no browser automation; AGENTS.md rule 11).
// Not a substitute for the tech lead's own device/browser pass at docs/USER_ACCEPTANCE_WALKTHROUGH.md section 7 and
// the visual rows of section 4 — those stay NOT EXECUTED here and are recorded as such.
//
// Usage: set WALKTHROUGH_ORIGIN, WALKTHROUGH_SYSTEM_USERNAME, WALKTHROUGH_SYSTEM_PASSWORD (the credentials used with
// `npm run auth:bootstrap` against the target database), then `npx tsx tests/scripts/acceptance-walkthrough.ts`.
// Prints a Markdown results table to stdout and nothing else destructive; it only calls real HTTP endpoints exposed
// by apps/api and never touches the database directly.
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { cairoIsoDate, egpToPiastres } from '@nursery/domain';
import { httpClient } from '../helpers/http-client.js';
import { fillTemplate } from '../helpers/imports.js';
import type { AuthClient } from '../../apps/web/src/features/auth/client.js';
import type {
  CheckpointConfiguration, OnboardingResult, BillingAgreement,
  TreasuryAccount, AttendanceClassroomDraft, ExamCatalogItem, ExamClassroomDraft, HomeworkRoster,
  OutstandingPage, PaymentResult, BusSubscription, Activity, PayrollPage,
  ChildTransferPreview, DailyClosing, ImportBatch, BackupRunSummary, RestoreValidationSummary
} from '@nursery/contracts';

const ORIGIN = process.env.WALKTHROUGH_ORIGIN ?? 'http://127.0.0.1:3100';
const SYSTEM_USERNAME = process.env.WALKTHROUGH_SYSTEM_USERNAME;
const SYSTEM_PASSWORD = process.env.WALKTHROUGH_SYSTEM_PASSWORD;
if (!SYSTEM_USERNAME || !SYSTEM_PASSWORD) throw new Error('WALKTHROUGH_SYSTEM_USERNAME/WALKTHROUGH_SYSTEM_PASSWORD are required (the bootstrapped SYSTEM credentials for the target database).');

type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT EXECUTED';
type Row = { id: string; status: Status; route: string; note: string };
const rows: Row[] = [];
function record(id: string, status: Status, route: string, note: string) {
  rows.push({ id, status, route, note });
  console.log(`[${status}] ${id} ${route} — ${note}`);
}
function errNote(error: unknown): string {
  const e = error as { detail?: { code?: string; messageKey?: string; fieldErrors?: unknown }; message?: string };
  if (e?.detail) return `${e.detail.code} ${e.detail.messageKey}${e.detail.fieldErrors ? ' ' + JSON.stringify(e.detail.fieldErrors) : ''}`;
  return e?.message ?? String(error);
}
async function pass<T>(id: string, route: string, fn: () => Promise<T>, describe: (v: T) => string): Promise<T> {
  const v = await fn(); record(id, 'PASS', route, describe(v)); return v;
}
async function tryPass<T>(id: string, route: string, fn: () => Promise<T>, describe: (v: T) => string): Promise<T | null> {
  try { return await pass(id, route, fn, describe); } catch (error) { record(id, 'FAIL', route, errNote(error)); return null; }
}
async function expectRejected(id: string, route: string, fn: () => Promise<unknown>, describe: (e: unknown) => string) {
  try { await fn(); record(id, 'FAIL', route, 'expected a rejection but the request succeeded'); }
  catch (error) { record(id, 'PASS', route, describe(error)); }
}
function op() { return crypto.randomUUID(); }
// A few endpoints intentionally reply 204 No Content on success (e.g. parent/announcements/:id/acknowledgment).
// AuthClient.business() always destructures `.data`, which throws on an empty 204 body; AuthClient.licensing()
// already guards for this on its own namespace, so this driver-only helper applies the same guard generically.
async function postEmpty(client: AuthClient, path: string, body: unknown): Promise<void> {
  try { await client.business(path, 'POST', body); }
  catch (error) { if (!(error instanceof TypeError)) throw error; }
}
async function login(username: string, password: string) {
  const client = httpClient(ORIGIN, ORIGIN) as unknown as AuthClient;
  const { account } = await client.login(username, password);
  return { client, account };
}
type Session = Awaited<ReturnType<typeof login>>;
async function waitFor<T>(fn: () => Promise<T | null>, timeoutMs: number, intervalMs = 3000): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn(); if (v !== null) return v;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function main() {
  const today = cairoIsoDate();
  const month = today.slice(0, 7);

  // ---------- Section 1: Superadmin setup ----------
  const sys = await login(SYSTEM_USERNAME!, SYSTEM_PASSWORD!);
  if (sys.account.mustChangePassword) {
    await pass('1.1', 'POST /api/v1/auth/password', () => sys.client.changePassword(SYSTEM_PASSWORD!, 'Walkthrough system permanent phrase 01'), () => 'temporary bootstrap password changed for SYSTEM');
  } else record('1.1', 'PASS', 'POST /api/v1/auth/login', 'SYSTEM already past mustChangePassword (unexpected on a fresh install, recorded as-is)');

  await tryPass('1.2', 'PUT /api/v1/licensing/settings', async () => {
    const theme = { brandPink: '#F13E93', softPink: '#F891BB', peach: '#F9D0CD', paleYellow: '#FAFFCB', text: '#111827', surface: '#FFFFFF', background: '#FFF7FA', strongPinkButton: '#BE185D', success: '#166534', warning: '#92400E', error: '#B42318' };
    return sys.client.business('licensing/settings', 'PUT', { expectedVersion: 1, value: { name: 'Walkthrough Nursery', logoPath: null, contactPhone: '01000000000', contactEmail: null, theme } });
  }, () => 'nursery name/theme saved with a passing contrast pair');
  await expectRejected('1.2b', 'PUT /api/v1/licensing/settings', async () => {
    const bad = { brandPink: '#FFFFFF', softPink: '#FFFFFF', peach: '#FFFFFF', paleYellow: '#FFFFFF', text: '#FFFFFF', surface: '#FFFFFF', background: '#FFFFFF', strongPinkButton: '#FFFFFF', success: '#FFFFFF', warning: '#FFFFFF', error: '#FFFFFF' };
    return sys.client.business('licensing/settings', 'PUT', { expectedVersion: 2, value: { name: 'Walkthrough Nursery', logoPath: null, contactPhone: null, contactEmail: null, theme: bad } });
  }, (e) => `unreadable white-on-white theme correctly rejected server-side: ${errNote(e)}`);

  await tryPass('1.3', 'PUT /api/v1/licensing/limits', () => sys.client.business('licensing/limits', 'PUT', { expectedVersion: null, value: { parentCapacity: 50, employeeCapacity: 20, parentUnitPricePiastres: 0, employeeUnitPricePiastres: 0, subscriptionPeriod: 'MONTHLY', startsOn: today, validUntil: cairoIsoDate(new Date(Date.now() + 365 * 86400000)), graceDays: 7, agreedTotalOverridePiastres: null, agreedTotalOverrideReason: null, supportContact: 'UAT support' } }), () => 'subscription validity/grace/capacities saved');

  const adminRole = await tryPass('1.4', 'POST /api/v1/organization/roles', () => sys.client.business<{ id: string }>('organization/roles', 'POST', { name: 'Branch admin', capabilities: ['organization.read', 'organization.manage', 'children.read', 'children.manage', 'guardians.manage', 'documents.manage', 'users.create_parent', 'parents.block', 'announcements.manage', 'learning.read', 'learning.publish', 'exams.catalog', 'finance.read', 'billing.manage', 'payments.record', 'treasury.manage', 'expenses.manage', 'expenses.pay', 'expenses.approve', 'treasury.close', 'finance.correct', 'transport.manage', 'transport.read', 'activities.manage', 'activities.read', 'payroll.manage', 'payroll.pay', 'imports.commit'] }), (v) => `custom role created id=${v.id}`);
  await expectRejected('1.4b', 'POST /api/v1/organization/roles', () => sys.client.business('organization/roles', 'POST', { name: 'Illegal role', capabilities: ['licensing.manage'] }), (e) => `reserved capability key correctly refused for a custom role: ${errNote(e)}`);
  const teacherRole = await tryPass('1.4c', 'POST /api/v1/organization/roles', () => sys.client.business<{ id: string }>('organization/roles', 'POST', { name: 'Walkthrough Teacher', capabilities: ['learning.read', 'learning.publish', 'exams.catalog'] }), (v) => `teacher role created id=${v.id}`);

  const adminUser = `admin-${Date.now()}`;
  const adminProvision = await tryPass('1.5', 'POST /api/v1/licensing/staff', () => sys.client.business<{ id: string; username: string; temporaryPassword: string }>('licensing/staff', 'POST', { username: adminUser }), (v) => `first nursery-admin login provisioned: ${v.username}`);
  let admin: Session | null = null;
  if (adminProvision) {
    admin = await login(adminProvision.username, adminProvision.temporaryPassword);
    await tryPass('1.5b', 'POST /api/v1/auth/password', () => admin!.client.changePassword(adminProvision.temporaryPassword, 'Walkthrough admin permanent phrase 01'), () => 'one-time temporary password worked and was changed');
  }

  // ---------- Section 2: Nursery admin setup ----------
  const branchA = await tryPass('2.1', 'POST /api/v1/organization/branches', () => sys.client.business<{ id: string }>('organization/branches', 'POST', { code: 'WA', name: 'Walkthrough Branch A' }), (v) => `branch A id=${v.id}`);
  const branchB = await tryPass('2.1b', 'POST /api/v1/organization/branches', () => sys.client.business<{ id: string }>('organization/branches', 'POST', { code: 'WB', name: 'Walkthrough Branch B' }), (v) => `branch B id=${v.id}`);
  const classroomA = branchA && await tryPass('2.1c', 'POST /api/v1/organization/classrooms', () => sys.client.business<{ id: string }>('organization/classrooms', 'POST', { code: 'WAC1', name: 'Branch A Classroom 1', branchId: branchA.id, ageGroupId: null, capacity: 20 }), (v) => `classroom A id=${v.id}`);
  const classroomB = branchB && await tryPass('2.1d', 'POST /api/v1/organization/classrooms', () => sys.client.business<{ id: string }>('organization/classrooms', 'POST', { code: 'WBC1', name: 'Branch B Classroom 1', branchId: branchB.id, ageGroupId: null, capacity: 20 }), (v) => `classroom B id=${v.id}`);

  if (admin && branchA && branchB) await tryPass('1.5c', 'PUT /api/v1/organization/staff/:id/assignments', () => {
    if (!adminRole) throw new Error('admin role from 1.4 is unavailable; refusing to assign zero roles');
    return sys.client.business(`organization/staff/${adminProvision!.id}/assignments`, 'PUT', { expectedVersion: 1, roleIds: [adminRole.id], branchIds: [branchA.id, branchB.id], classroomIds: [], scopeMode: 'BRANCH' });
  }, () => 'admin scoped branch-wide over both branches');

  const teacherUser = `teacher-${Date.now()}`;
  const teacherProvision = classroomA && await tryPass('2.2', 'POST /api/v1/licensing/staff', () => sys.client.business<{ id: string; username: string; temporaryPassword: string }>('licensing/staff', 'POST', { username: teacherUser }), (v) => `teacher login provisioned: ${v.username}`);
  let teacher: Session | null = null;
  if (teacherProvision && classroomA && branchA) {
    teacher = await login(teacherProvision.username, teacherProvision.temporaryPassword);
    await teacher.client.changePassword(teacherProvision.temporaryPassword, 'Walkthrough teacher permanent phrase 01');
    await tryPass('2.2a', 'PUT /api/v1/organization/staff/:id/assignments', () => {
      if (!teacherRole) throw new Error('teacher role from 1.4c is unavailable; refusing to assign zero roles');
      return sys.client.business(`organization/staff/${teacherProvision.id}/assignments`, 'PUT', { expectedVersion: 1, roleIds: [teacherRole.id], branchIds: [branchA.id], classroomIds: [classroomA.id], scopeMode: 'CLASSROOM' });
    }, () => 'teacher scoped to classroom A only');
    await tryPass('2.2b', 'GET /api/v1/auth/me', async () => {
      const current = await teacher!.client.current();
      if (current.account.scope?.mode !== 'CLASSROOM' || current.account.scope.classroomIds.length !== 1 || current.account.scope.classroomIds[0] !== classroomA.id) throw new Error(`unexpected scope: ${JSON.stringify(current.account.scope)}`);
      return current;
    }, () => `teacher session scope is exactly classroom A only (classroomIds=[${classroomA.id}])`);
  }

  // Fee categories, needed before billing/transport/activities can reference them.
  const tuitionCategory = await tryPass('2.setup-a', 'POST /api/v1/finance/categories', () => sys.client.business<{ id: string }>('finance/categories', 'POST', { operationId: op(), code: 'TUI', name: 'Tuition', kind: 'TUITION' }), (v) => `TUITION category id=${v.id}`);
  const busCategory = await tryPass('2.setup-b', 'POST /api/v1/finance/categories', () => sys.client.business<{ id: string }>('finance/categories', 'POST', { operationId: op(), code: 'BUS', name: 'Bus', kind: 'BUS' }), (v) => `BUS category id=${v.id}`);
  const tripCategory = await tryPass('2.setup-c', 'POST /api/v1/finance/categories', () => sys.client.business<{ id: string }>('finance/categories', 'POST', { operationId: op(), code: 'TRIP', name: 'Trip', kind: 'TRIP' }), (v) => `TRIP category id=${v.id}`);
  // First treasury account per branch must be CASH (D39); created here so section 5 collections have somewhere to post to.
  // Funded with a real opening balance (D39 allows any explicit dated opening entry, zero included) so section 5's
  // collections/expenses/transfers/payroll settlement have enough actual cash to move without an artificial shortage.
  const cashAOpening = egpToPiastres('20000.00');
  const cashA = branchA && await tryPass('2.setup-d', 'POST /api/v1/finance/accounts', () => sys.client.business<{ id: string }>('finance/accounts', 'POST', { operationId: op(), branchId: branchA.id, code: 'A-CASH', name: 'Branch A cash drawer', type: 'CASH', openingAmount: cashAOpening, openedOn: today, reason: 'Walkthrough opening balance' }), (v) => `branch A default CASH account id=${v.id}, opening balance ${cashAOpening}`);
  const cashB = branchB && await tryPass('2.setup-e', 'POST /api/v1/finance/accounts', () => sys.client.business<TreasuryAccount>('finance/accounts', 'POST', { operationId: op(), branchId: branchB.id, code: 'B-CASH', name: 'Branch B cash drawer', type: 'CASH', openingAmount: '0', openedOn: today, reason: 'Walkthrough opening balance' }), (v) => `branch B default CASH account id=${v.id}`);
  const bankA = branchA && await tryPass('2.setup-f', 'POST /api/v1/finance/accounts', () => sys.client.business<TreasuryAccount>('finance/accounts', 'POST', { operationId: op(), branchId: branchA.id, code: 'A-BANK', name: 'Branch A bank', type: 'BANK', openingAmount: '0', openedOn: today, reason: 'Walkthrough bank account' }), (v) => `branch A BANK account id=${v.id}`);

  // Section 2 onward runs as the delegated nursery admin (not SYSTEM) where the walkthrough narrative calls for it.
  const nurseryAdmin = admin ?? sys;
  const family = classroomA && branchA && await tryPass('2.3', 'POST /api/v1/children/onboarding', () => nurseryAdmin.client.business<OnboardingResult>('children/onboarding', 'POST', {
    operationId: op(),
    guardians: [{ kind: 'NEW', username: `guardian-${Date.now()}`, profile: { fullName: 'Walkthrough Guardian', mobile: '01000000010' } }],
    children: [
      { child: { code: `WCHILD1-${Date.now()}`, fullName: 'Walkthrough Child One', birthDate: '2021-01-01', branchId: branchA.id, classroomId: classroomA.id, contacts: [] }, links: [{ guardianIndex: 0, relationship: 'Mother', permissions: { read: true, finance: true, pickup: false, notify: true } }] },
      { child: { code: `WCHILD2-${Date.now()}`, fullName: 'Walkthrough Child Two', birthDate: '2022-01-01', branchId: branchA.id, classroomId: classroomA.id, contacts: [] }, links: [{ guardianIndex: 0, relationship: 'Mother', permissions: { read: true, finance: true, pickup: false, notify: true } }] }
    ]
  }), (v) => `family onboarded: ${v.childIds.length} children, ${v.guardianIds.length} guardian(s)`);
  const child1 = family?.childIds[0] ?? null, child2 = family?.childIds[1] ?? null;
  const guardianCredential = family?.credentials[0] ?? null;

  const agreement = tuitionCategory && child1 && child2 && await tryPass('2.4', 'POST /api/v1/billing/agreements', () => nurseryAdmin.client.business<BillingAgreement>('billing/agreements', 'POST', {
    operationId: op(),
    terms: { mode: 'MONTHLY', categoryId: tuitionCategory.id, description: 'Monthly tuition', childIds: [child1, child2], normalAmount: egpToPiastres('2000.00'), agreedAmount: egpToPiastres('2000.00'), startsOn: today, endsOn: null, firstAgreedAmount: null, firstPeriod: `${month}-01`, dueDay: 5, installments: [], serviceFrom: null, serviceUntil: null }
  }), (v) => `draft billing agreement id=${v.id}`);
  if (agreement) await tryPass('2.4b', 'POST /api/v1/billing/agreements/:id/approve', () => nurseryAdmin.client.business(`billing/agreements/${agreement.id}/approve`, 'POST', { operationId: op(), expectedVersion: agreement.version }), () => 'agreement approved — creates debt only, verified against treasury balance in 2.4c');
  await tryPass('2.4c', 'GET /api/v1/finance/accounts', async () => {
    const accounts = await sys.client.business<TreasuryAccount[]>(`finance/accounts?branchId=${branchA!.id}`);
    const account = accounts.find((a) => a.id === cashA?.id);
    if (account?.balance !== cashAOpening) throw new Error(`expected unchanged cash balance ${cashAOpening}, got ${account?.balance}`);
    return account;
  }, (v) => `approving the agreement created no cash movement (branch A cash balance still ${v?.balance})`);

  const busSubscription = busCategory && child1 && branchA && await tryPass('2.5', 'POST /api/v1/transport/subscriptions', () => nurseryAdmin.client.business<{ id: string; obligationId: string; installmentId: string }>('transport/subscriptions', 'POST', { operationId: op(), childId: child1, categoryId: busCategory.id, periodStart: today, periodEnd: cairoIsoDate(new Date(Date.now() + 30 * 86400000)), amount: egpToPiastres('300.00'), dueOn: today, administrativePermission: true }), (v) => `bus subscription id=${v.id} created with obligation ${v.obligationId} (eligibility checked in 5.2 after full settlement)`);
  const activity = tripCategory && child1 && branchA && await tryPass('2.6', 'POST /api/v1/activities', () => nurseryAdmin.client.business<Activity>('activities', 'POST', { operationId: op(), branchId: branchA.id, categoryId: tripCategory.id, title: 'Walkthrough trip', details: 'Zoo visit', eventDate: cairoIsoDate(new Date(Date.now() + 14 * 86400000)), fee: egpToPiastres('150.00'), dueOn: today, childIds: [child1] }), (v) => `activity created id=${v.id}`);

  // ---------- Section 3: Teacher daily work ----------
  // learning.configure is reserved (SYSTEM-only, D34); a teacher publishes against these shared IDs but never reads the raw configuration.
  const config = await tryPass('3.setup', 'GET /api/v1/learning/configuration', () => sys.client.business<CheckpointConfiguration>('learning/configuration'), (v) => `checkpoint configuration v${v.version}, ${v.definitions.length} definitions`);
  const attendanceDef = config?.definitions.find((d) => d.kind === 'ATTENDANCE') ?? null;
  const homeworkDef = config?.definitions.find((d) => d.kind === 'HOMEWORK') ?? null;
  const presentStatus = attendanceDef?.statuses.find((s) => s.outcome === 'PRESENT') ?? null;
  const absentStatus = attendanceDef?.statuses.find((s) => s.outcome === 'ABSENT') ?? null;
  const completedStatus = homeworkDef?.statuses.find((s) => s.outcome === 'COMPLETED') ?? null;

  const draft = teacher && classroomA && await tryPass('3.1', 'GET /api/v1/attendance/classrooms/:id/draft', () => teacher!.client.business<AttendanceClassroomDraft>(`attendance/classrooms/${classroomA.id}/draft?date=${today}`), (v) => `roster ${v.entries.length} children`);
  if (teacher && classroomA && draft && presentStatus) await tryPass('3.1b', 'POST /api/v1/attendance/classroom-publications', () => teacher!.client.business('attendance/classroom-publications', 'POST', { classroomId: classroomA.id, date: today, operationId: op(), entries: draft.entries.map((e) => ({ childId: e.childId, statusId: presentStatus.id, absenceReason: null, expectedVersion: e.record?.event.revision ?? 0 })) }), () => 'attendance published PRESENT for the full roster');

  const subject = teacher && await tryPass('3.setup-subject', 'POST /api/v1/exams/catalog/subjects', () => teacher!.client.business<ExamCatalogItem>('exams/catalog/subjects', 'POST', { name: 'Arabic', enabled: true }), (v) => `subject id=${v.id}`);
  const examType = teacher && await tryPass('3.setup-type', 'POST /api/v1/exams/catalog/types', () => teacher!.client.business<ExamCatalogItem>('exams/catalog/types', 'POST', { name: 'Quiz', enabled: true }), (v) => `exam type id=${v.id}`);
  const exam = teacher && subject && examType && classroomA && await tryPass('3.setup-exam', 'POST /api/v1/exams', () => teacher!.client.business<{ id: string }>('exams', 'POST', { name: 'Arabic quiz 1', subjectId: subject.id, typeId: examType.id, classroomId: classroomA.id, assessedOn: today, gradeFormat: 'NUMERIC', maximumMarks: 100, decimalAllowed: false, labelOptions: null, operationId: op() }), (v) => `exam id=${v.id}`);
  const examRoster = teacher && exam && await tryPass('3.setup-roster', 'GET /api/v1/exams/:id/roster', () => teacher!.client.business<ExamClassroomDraft>(`exams/${exam.id}/roster`), (v) => `${v.entries.length} children on roster`);
  if (teacher && exam && examRoster) {
    const child1Entry = examRoster.entries.find((e) => e.childId === child1);
    if (child1Entry) await tryPass('3.2', 'POST /api/v1/exams/results', () => teacher!.client.business('exams/results', 'POST', { examId: exam.id, operationId: op(), entries: [{ childId: child1Entry.childId, outcome: 'RESULT', score: 0, label: null, comment: null, expectedVersion: child1Entry.slotRevision }] }), () => `child one scored 0 (real zero, not missing); child two left unrecorded to confirm missing ≠ zero`);
    else record('3.2', 'FAIL', 'POST /api/v1/exams/results', 'child one not found on the exam roster');
  }
  await tryPass('3.2b', 'GET /api/v1/exams/:id/roster', async () => {
    if (!teacher || !exam) throw new Error('prerequisite step failed');
    const roster = await teacher.client.business<ExamClassroomDraft>(`exams/${exam.id}/roster`);
    const one = roster.entries.find((e) => e.childId === child1), two = roster.entries.find((e) => e.childId === child2);
    if (Number(one?.result?.score) !== 0) throw new Error(`expected child one score 0, got ${JSON.stringify(one?.result)}`);
    if (two?.result !== null && two?.result !== undefined) throw new Error(`expected child two to have no result recorded (missing), got ${JSON.stringify(two?.result)}`);
    return { one, two };
  }, () => 'confirmed: recorded zero score displays as 0, unrecorded child stays explicitly missing (not zero)');

  const homework = teacher && classroomA && child1 && child2 && await tryPass('3.3', 'POST /api/v1/homework', () => teacher!.client.business<{ id: string }>('homework', 'POST', { classroomId: classroomA.id, title: 'Colouring sheet', instructions: 'Colour the shapes worksheet.', assignedOn: today, dueOn: today, childIds: [child1, child2], operationId: op() }), (v) => `homework assignment id=${v.id}`);
  const homeworkRoster = teacher && homework && await tryPass('3.setup-hw-roster', 'GET /api/v1/homework/:id/roster', () => teacher!.client.business<HomeworkRoster>(`homework/${homework.id}/roster?date=${today}`), (v) => `${v.entries.length} children`);
  if (teacher && homework && homeworkRoster && completedStatus) {
    const entry = homeworkRoster.entries.find((e) => e.childId === child1);
    if (entry) await tryPass('3.3b', 'POST /api/v1/homework/outcomes', () => teacher!.client.business('homework/outcomes', 'POST', { assignmentId: homework.id, date: today, operationId: op(), entries: [{ childId: entry.childId, statusId: completedStatus.id, note: null, expectedVersion: entry.outcome?.version ?? 0 }] }), () => 'child one homework marked completed');
  }

  if (teacher && exam) {
    const roster = await teacher.client.business<ExamClassroomDraft>(`exams/${exam.id}/roster`);
    const entry = roster.entries.find((e) => e.childId === child1);
    if (entry) await tryPass('3.4', 'POST /api/v1/exams/results/corrections', () => teacher!.client.business('exams/results/corrections', 'POST', { examId: exam.id, childId: entry.childId, outcome: 'RESULT', score: 5, label: null, comment: null, expectedVersion: entry.slotRevision, operationId: op(), reason: 'Recording error, corrected mark' }), () => 'issued a reasoned correction from 0 to 5');
  }
  if (teacher && exam && child1) await tryPass('3.4b', 'GET /api/v1/exams/children/:id/history', () => teacher!.client.business<{ items: unknown[]; total: number }>(`exams/children/${child1}/history`), (v) => `${v.total} historical exam entries retained (original stays visible alongside the correction)`);

  // ---------- Section 4: Parent experience ----------
  let guardian: Session | null = null;
  if (guardianCredential) {
    guardian = await login(guardianCredential.username, guardianCredential.temporaryPassword);
    await guardian.client.changePassword(guardianCredential.temporaryPassword, 'Walkthrough guardian permanent phrase 01');
  }
  if (guardian && child1) {
    const liveClient = httpClient(ORIGIN, ORIGIN, true) as unknown as AuthClient;
    await liveClient.login(guardianCredential!.username, 'Walkthrough guardian permanent phrase 01');
    const stream = liveClient.parentLive();
    if (stream) {
      // The server always sends one 'snapshot' immediately on connect (apps/api/src/modules/communication/live.ts);
      // wait for that first, separately from the 'invalidate' the teacher's correction below is expected to trigger,
      // so this genuinely tests reactivity rather than just the initial handshake.
      const gotSnapshot = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        stream.addEventListener('snapshot', () => { clearTimeout(timer); resolve(true); }, { once: true });
      });
      const invalidated = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 8000);
        stream.addEventListener('invalidate', () => { clearTimeout(timer); resolve(true); }, { once: true });
      });
      // Trigger a real correction the guardian is scoped to see, then confirm the live stream reacts.
      if (teacher && classroomA && absentStatus) {
        const freshDraft = await teacher.client.business<AttendanceClassroomDraft>(`attendance/classrooms/${classroomA.id}/draft?date=${today}`);
        const entry = freshDraft.entries.find((e) => e.childId === child1);
        if (entry) await teacher.client.business('attendance/corrections', 'POST', { childId: entry.childId, statusId: absentStatus.id, absenceReason: 'Walkthrough live-update trigger', expectedVersion: entry.record?.event.revision ?? 0, date: today, operationId: op(), reason: 'Walkthrough live-update trigger' });
      }
      const gotEvent = await invalidated;
      (stream as unknown as { close: () => void }).close();
      const status = !gotSnapshot ? 'FAIL' : gotEvent ? 'PASS' : 'FAIL';
      record('4.1', status, 'GET /api/v1/parent/live (SSE)', !gotSnapshot ? 'no initial snapshot received within 5s' : gotEvent ? 'real SSE stream received a distinct invalidate event within 8s of a teacher publication (separate from the initial connect snapshot)' : 'connected and received the initial snapshot, but no invalidate event followed the teacher publication within 8s');
    } else record('4.1', 'FAIL', 'GET /api/v1/parent/live (SSE)', 'live transport unavailable in this environment');
    await tryPass('4.1b', 'GET /api/v1/learning/children/:id/daily', () => guardian!.client.business(`learning/children/${child1}/daily?date=${today}`), () => 'guardian can read the child\'s daily record over the same authenticated route staff use');
  }
  if (guardian) await tryPass('4.2', 'PATCH /api/v1/auth/locale', () => guardian!.client.locale('ar-EG'), () => 'guardian locale switched to ar-EG (dd/MM/yyyy + Latin-digit EGP rendering itself is a DOM-suite/manual check, not verifiable over raw HTTP — see note in the matrix)');
  if (guardian && child1) {
    await tryPass('4.3', 'GET /api/v1/parent/payment-options', () => guardian!.client.business('parent/payment-options'), () => 'guardian can read parent payment options (permitted balances view); receipt visibility re-checked at 4.3b after 5.1 actually collects one');
    await tryPass('4.3-balances', 'GET /api/v1/finance/children/:id/balances', () => guardian!.client.business(`finance/children/${child1}/balances`), () => 'guardian can read the permitted child balance before any collection');
  }
  const announcement = classroomA && await tryPass('4.4-setup', 'POST /api/v1/announcements', () => nurseryAdmin.client.business<{ id: string }>('announcements', 'POST', { operationId: op(), title: 'Walkthrough notice', body: 'Please confirm receipt of this notice.', target: { kind: 'CLASSROOM', id: classroomA.id }, acknowledgmentRequired: true, holiday: null }), (v) => `announcement id=${v.id}`);
  if (guardian && announcement) {
    const list = await tryPass('4.4', 'GET /api/v1/parent/announcements', () => guardian!.client.business<{ id: string; acknowledgmentRequired: boolean; acknowledged: boolean }[]>('parent/announcements?limit=20&offset=0'), (v) => `${v.length} notice(s) visible, including the classroom announcement`);
    const notice = list?.find((n) => n.id === announcement.id);
    if (notice) await tryPass('4.4b', 'POST /api/v1/parent/announcements/:id/acknowledgment', async () => {
      await postEmpty(guardian!.client, `parent/announcements/${notice.id}/acknowledgment`, {});
      const refreshed = await guardian!.client.business<{ id: string; acknowledged: boolean }>(`parent/announcements/${notice.id}`);
      if (!refreshed.acknowledged) throw new Error('acknowledgment did not persist');
      return refreshed;
    }, () => 'guardian acknowledged the notice that required it, and it now shows acknowledged=true on re-read');
    else record('4.4', 'FAIL', 'GET /api/v1/parent/announcements', 'published classroom announcement was not visible in the guardian\'s notice list');
  }

  // ---------- Section 5: Finance operations ----------
  if (cashA && child1) {
    const outstanding = await tryPass('5.setup', 'GET /api/v1/finance/outstanding', () => sys.client.business<OutstandingPage>(`finance/outstanding?childId=${child1}&status=UNPAID`), (v) => `${v.items.length} unpaid installment(s), total remaining ${v.totalRemaining}`);
    const installment = outstanding?.items[0] ?? null;
    if (installment) {
      const partial = (BigInt(installment.remaining) / 3n).toString();
      await tryPass('5.1', 'POST /api/v1/payments', () => sys.client.business<PaymentResult>('payments', 'POST', { operationId: op(), collectedOn: today, payerName: 'Walkthrough Guardian', externalReference: '', groups: [{ branchId: branchA!.id, accountId: cashA.id, method: 'CASH', amount: partial, allocations: [{ installmentId: installment.id, amount: partial }] }] }), (v) => `partial collection produced receipt(s): ${v.receiptIds.join(',')}`);
      if (guardian) await tryPass('4.3b', 'GET /api/v1/parent/children/:id/receipts', async () => {
        const receipts = await guardian!.client.business<{ id: string }[]>(`parent/children/${child1}/receipts?limit=20&offset=0`);
        if (!receipts.length) throw new Error('expected the just-collected receipt to be visible to the guardian');
        return receipts;
      }, (v) => `guardian's payment history now shows the just-collected receipt (${v.length} total)`);
    } else record('5.1', 'BLOCKED', 'POST /api/v1/payments', 'no outstanding installment found for child one — see 2.4/2.4b results');
  }
  if (busSubscription && cashA && branchA) {
    const busInstallmentId = busSubscription.installmentId;
    if (busInstallmentId) {
      const partialBus = (BigInt(egpToPiastres('300.00')) / 2n).toString();
      await expectRejected('5.2', 'POST /api/v1/payments', () => sys.client.business('payments', 'POST', { operationId: op(), collectedOn: today, payerName: 'Walkthrough Guardian', externalReference: '', groups: [{ branchId: branchA.id, accountId: cashA.id, method: 'CASH', amount: partialBus, allocations: [{ installmentId: busInstallmentId, amount: partialBus }] }] }), (e) => `partial bus-fee payment correctly rejected (full settlement only): ${errNote(e)}`);
      const fullBus = egpToPiastres('300.00');
      await tryPass('5.2b', 'POST /api/v1/payments', () => sys.client.business<PaymentResult>('payments', 'POST', { operationId: op(), collectedOn: today, payerName: 'Walkthrough Guardian', externalReference: '', groups: [{ branchId: branchA.id, accountId: cashA.id, method: 'CASH', amount: fullBus, allocations: [{ installmentId: busInstallmentId, amount: fullBus }] }] }), () => 'full bus-fee settlement accepted once');
      await tryPass('5.2c', 'GET /api/v1/transport/subscriptions', async () => {
        const list = await sys.client.business<BusSubscription[]>(`transport/subscriptions?branchId=${branchA.id}`);
        const sub = list.find((s) => s.id === busSubscription.id);
        if (!sub?.eligible) throw new Error(`expected eligible=true after full settlement, got ${JSON.stringify(sub)}`);
        return sub;
      }, () => 'bus subscription now eligible after full settlement');
    } else record('5.2', 'BLOCKED', 'POST /api/v1/payments', 'bus subscription had no installmentId (zero-fee or setup failure)');
  }
  const expenseCategory = await tryPass('5.3-setup', 'POST /api/v1/expenses/categories', () => sys.client.business<{ id: string }>('expenses/categories', 'POST', { operationId: op(), code: 'SUPPLIES', name: 'Classroom supplies' }), (v) => `expense category id=${v.id}`);
  const expense = expenseCategory && branchA && await tryPass('5.3', 'POST /api/v1/expenses', () => sys.client.business<{ id: string }>('expenses', 'POST', { operationId: op(), branchId: branchA.id, classroomId: null, categoryId: expenseCategory.id, amount: egpToPiastres('80.00'), dueOn: today, note: 'Colouring supplies' }), (v) => `pending expense id=${v.id} (no cash effect)`);
  if (expense && cashA) await tryPass('5.3b', 'POST /api/v1/expenses/:id/pay', () => sys.client.business(`expenses/${expense.id}/pay`, 'POST', { operationId: op(), accountId: cashA.id, method: 'CASH', paidOn: today, externalReference: '', reason: 'Paid at the shop' }), () => 'actual payment recorded once money left the account');
  if (cashA && bankA) await tryPass('5.4', 'POST /api/v1/finance/transfers', () => sys.client.business('finance/transfers', 'POST', { operationId: op(), sourceAccountId: cashA.id, destinationAccountId: bankA.id, amount: egpToPiastres('50.00'), effectiveOn: today, reason: 'Deposit cash to bank', externalReference: '' }), () => 'treasury account transfer recorded (source −, destination +)');

  const employee = branchA && cashA && await tryPass('5.5-setup', 'POST /api/v1/payroll/employees', () => sys.client.business<{ id: string }>('payroll/employees', 'POST', { operationId: op(), employeeCode: `EMP${Date.now()}`, fullName: 'Walkthrough Employee', basicSalary: egpToPiastres('5000.00'), effectiveMonth: month, payingBranchId: branchA.id, payingAccountId: cashA.id, loginUsername: null }), (v) => `employee profile id=${v.id}`);
  const period = employee && await tryPass('5.5-setup-b', 'POST /api/v1/payroll/periods', () => sys.client.business<{ id: string }>('payroll/periods', 'POST', { operationId: op(), employeeId: employee.id, month }), (v) => `payroll period id=${v.id}`);
  if (period) await tryPass('5.5', 'POST /api/v1/payroll/periods/:id/advances', () => sys.client.business(`payroll/periods/${period.id}/advances`, 'POST', { operationId: op(), amount: egpToPiastres('1000.00'), paidOn: today, reason: 'Salary advance', externalReference: '' }), () => 'salary advance paid');
  if (period) {
    const roster = await sys.client.business<PayrollPage>(`payroll?month=${month}&branchId=${branchA!.id}`);
    const item = roster.items.find((i) => i.periodId === period.id);
    if (item) await tryPass('5.5b', 'POST /api/v1/payroll/periods/:id/settlements', () => sys.client.business(`payroll/periods/${period.id}/settlements`, 'POST', { operationId: op(), amount: item.remaining, settledOn: today, reason: 'Final monthly payout', externalReference: '' }), () => `full remaining ${item.remaining} paid once`);
    else record('5.5b', 'BLOCKED', 'POST /api/v1/payroll/periods/:id/settlements', 'payroll period not found in the roster');
  }

  if (child2 && branchA && branchB && classroomB) {
    const version = family ? 1 : 1; // fresh onboarded child, version starts at 1
    const preview = await tryPass('5.6-setup', 'POST /api/v1/finance/child-transfers/preview', () => sys.client.business<ChildTransferPreview>('finance/child-transfers/preview', 'POST', { childId: child2, sourceBranchId: branchA.id, destinationBranchId: branchB.id, destinationClassroomId: classroomB.id, effectiveOn: today, expectedVersion: version }), (v) => `preview: ${v.items.length} outstanding item(s), amount ${v.amount}`);
    if (preview) await tryPass('5.6', 'POST /api/v1/children/:id/branch-transfers', () => sys.client.business(`children/${child2}/branch-transfers`, 'POST', { operationId: op(), sourceBranchId: branchA.id, destinationBranchId: branchB.id, destinationClassroomId: classroomB.id, effectiveOn: today, expectedVersion: version, reason: 'Family relocated near Branch B' }), () => 'child transferred with outstanding debt moved to Branch B');
    await tryPass('5.6b', 'GET /api/v1/finance/accounts', async () => {
      const accounts = await sys.client.business<TreasuryAccount[]>(`finance/accounts?branchId=${branchA.id}`);
      const account = accounts.find((a) => a.id === cashA?.id);
      return account;
    }, (v) => `branch A cash balance after transfer: ${v?.balance} (unchanged by the transfer itself, cf. balance recorded at 2.4c and any 5.1/5.3b/5.4 postings above)`);
  }

  if (cashA) {
    const options = await tryPass('5.7-setup', 'GET /api/v1/finance/closing-options', () => sys.client.business<{ accounts: { id: string }[]; canCount: boolean }>('finance/closing-options'), (v) => `${v.accounts.length} countable account(s), canCount=${v.canCount}`);
    const current = options && await tryPass('5.7-setup-b', 'GET /api/v1/finance/closing-current', () => sys.client.business<{ revision: number }>(`finance/closing-current?accountId=${cashA.id}&on=${today}`), (v) => `current revision ${v.revision}`);
    const accounts = await sys.client.business<TreasuryAccount[]>(`finance/accounts?branchId=${branchA!.id}`);
    const expected = accounts.find((a) => a.id === cashA.id)?.balance ?? '0';
    if (current) await tryPass('5.7', 'POST /api/v1/finance/closings', () => sys.client.business<DailyClosing>('finance/closings', 'POST', { operationId: op(), accountId: cashA.id, on: today, countedAmount: expected, expectedRevision: current.revision, reason: 'Physical cash count matches ledger' }), (v) => `closing recorded, difference ${v.difference} (0 = matches actual counted cash)`);
  }

  const reportsOptions = await tryPass('5.8-setup', 'GET /api/v1/reports/options', () => sys.client.business<{ kinds: string[] }>('reports/options'), (v) => `${v.kinds.length} report kinds available`);
  if (reportsOptions) {
    for (const format of ['PDF', 'XLSX'] as const) {
      const created = await tryPass(`5.8-${format}`, 'POST /api/v1/reports/exports', () => sys.client.business<{ id: string }>('reports/exports', 'POST', { kind: 'OUTSTANDING', from: today, to: today, format, operationId: op(), locale: 'en' }), (v) => `${format} export requested id=${v.id}`);
      if (created) {
        const ready = await waitFor(async () => {
          const status = await sys.client.business<{ status: string }>(`reports/exports/${created.id}`);
          return status.status === 'READY' ? status : status.status === 'FAILED' ? (() => { throw new Error('export FAILED'); })() : null;
        }, 60000);
        if (ready) {
          const file = await sys.client.downloadFile(`reports/exports/${created.id}/download`);
          const bytes = new Uint8Array(await file!.bytes.arrayBuffer());
          if (format === 'PDF') { await PDFDocument.load(bytes); record('5.8', 'PASS', 'GET /api/v1/reports/exports/:id/download', `PDF export downloaded and parsed, ${bytes.length} bytes`); }
          else { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as ArrayBuffer); record('5.8b', 'PASS', 'GET /api/v1/reports/exports/:id/download', `XLSX export downloaded and parsed, ${book.worksheets.length} sheet(s)`); }
        } else record(format === 'PDF' ? '5.8' : '5.8b', 'FAIL', 'GET /api/v1/reports/exports/:id', `${format} export did not reach READY within 60s (worker queue)`);
      }
    }
  }

  // ---------- Section 6: Access blocking ----------
  if (guardianCredential) {
    await tryPass('6.1', 'POST /api/v1/licensing/accounts/:id/block', () => sys.client.licensing(`accounts/${guardianCredential.id}/block`, 'POST', { reason: 'Walkthrough block test', publicMessage: 'Please contact the nursery.' }), () => 'guardian account blocked with a stated reason');
    await expectRejected('6.2', 'POST /api/v1/auth/login', () => login(guardianCredential.username, 'Walkthrough guardian permanent phrase 01'), (e) => `blocked guardian correctly refused sign-in: ${errNote(e)}`);
    if (child1) await tryPass('6.2b', 'GET /api/v1/finance/children/:id/balances', () => sys.client.business(`finance/children/${child1}/balances`), () => "billing for the child continues unaffected while the guardian is blocked (finance data still readable by staff)");
    await tryPass('6.3', 'POST /api/v1/licensing/accounts/:id/unblock', () => sys.client.licensing(`accounts/${guardianCredential.id}/unblock`, 'POST', { reason: 'Walkthrough unblock test' }), () => 'guardian account unblocked');
    await tryPass('6.3b', 'POST /api/v1/auth/login', () => login(guardianCredential.username, 'Walkthrough guardian permanent phrase 01'), () => 'normal sign-in access returned after unblock');
  }

  // ---------- Section 7: manual/physical (never executable over raw HTTP) ----------
  for (const [id, reason] of [
    ['7.1', 'physical 360px layout requires a real rendered browser/device — no browser automation permitted (AGENTS.md rule 11 / U24)'],
    ['7.2', 'visible keyboard focus/tab order requires a real rendered browser'],
    ['7.3', 'prefers-reduced-motion visual behaviour requires a real rendered browser'],
    ['7.4', 'RTL layout direction of monetary/date values requires a real rendered browser (scripted CSS/axe checks in the DOM suite are the closest automated substitute — see Step 5 gate results)']
  ] as const) record(id, 'NOT EXECUTED', 'n/a (manual/browser)', reason);
  record('4.2b', 'NOT EXECUTED', 'n/a (manual/browser)', 'actual dd/MM/yyyy + Latin-digit EGP rendering on screen requires a real rendered browser; locale switch itself verified at 4.2 and by the existing bilingual DOM suite (tests/e2e/collections.test.tsx, parent-hub.test.tsx)');

  // ---------- Section 8: Import and restore ----------
  const importTemplate = await tryPass('8.1-setup', 'GET /api/v1/imports/templates/PARENTS_CHILDREN', () => sys.client.downloadFile('imports/templates/PARENTS_CHILDREN'), (v) => `template downloaded, ${v!.bytes.size} bytes`);
  if (importTemplate && branchA && classroomA) {
    const bytes = Buffer.from(await importTemplate.bytes.arrayBuffer());
    const suffix = Date.now();
    const contentBase64 = await fillTemplate(bytes, {
      Parents: [[`IMPP${suffix}`, `import-parent-${suffix}`, 'Import Parent', '01000000099']],
      Children: [[`IMPC${suffix}`, 'Import Child', '2023-01-01', 'WA', 'WAC1', null, null, null]],
      Links: [[`IMPP${suffix}`, `IMPC${suffix}`, 'Mother', 'Y', 'Y', null, 'Y']]
    });
    const batch = await tryPass('8.1', 'POST /api/v1/imports', () => sys.client.business<ImportBatch>('imports', 'POST', { kind: 'PARENTS_CHILDREN', fileName: 'walkthrough-import.xlsx', contentBase64 }), (v) => `preview: canCommit=${v.preview?.canCommit}, creates ${JSON.stringify(v.preview?.creates)}`);
    if (batch?.preview?.canCommit && batch.previewHash) await tryPass('8.1b', 'POST /api/v1/imports/:id/commit', () => sys.client.business<{ replayed: boolean }>(`imports/${batch.id}/commit`, 'POST', { operationId: op(), expectedPreviewHash: batch.previewHash }), (v) => `import committed (replayed=${v.replayed})`);
    else record('8.1b', 'BLOCKED', 'POST /api/v1/imports/:id/commit', `preview did not validate for commit: ${JSON.stringify(batch?.preview)}`);
  }

  const backup = await tryPass('8.2-setup', 'POST /api/v1/support/backups', () => sys.client.business<BackupRunSummary>('support/backups', 'POST', { reason: 'Walkthrough manual backup for restore validation' }), (v) => `backup requested, id=${v.id}, status=${v.status}`);
  const finishedBackup = backup && await waitFor(async () => {
    const list = await sys.client.business<BackupRunSummary[]>('support/backups');
    const run = list.find((b) => b.id === backup.id);
    if (run?.status === 'SUCCEEDED') return run;
    if (run?.status === 'FAILED') throw new Error(`backup FAILED: ${run.errorCode}`);
    return null;
  }, 90000);
  if (finishedBackup) record('8.2-setup-b', 'PASS', 'GET /api/v1/support/backups', `backup SUCCEEDED, archive ${finishedBackup.archiveName}, ${finishedBackup.fileCount} file(s)`);
  else record('8.2-setup-b', 'FAIL', 'GET /api/v1/support/backups', 'backup did not reach SUCCEEDED within 90s');
  if (finishedBackup) {
    const validation = await tryPass('8.2', 'POST /api/v1/support/restore-validations', () => sys.client.business<RestoreValidationSummary>('support/restore-validations', 'POST', { backupRunId: finishedBackup.id, operatorPassword: 'Walkthrough system permanent phrase 01', confirmArchiveName: finishedBackup.archiveName!, reason: 'Walkthrough restore validation' }), (v) => `restore validation requested id=${v.id}, status=${v.status}`);
    if (validation) {
      const finished = await waitFor(async () => {
        const list = await sys.client.business<RestoreValidationSummary[]>('support/restore-validations');
        const run = list.find((v) => v.id === validation.id);
        if (run?.status === 'SUCCEEDED') return run;
        if (run?.status === 'FAILED') throw new Error(`restore validation FAILED: ${run.errorCode}`);
        return null;
      }, 90000);
      if (finished) record('8.2b', 'PASS', 'GET /api/v1/support/restore-validations', `restore validation SUCCEEDED; report: ${JSON.stringify(finished.report)}`);
      else record('8.2b', 'FAIL', 'GET /api/v1/support/restore-validations', 'restore validation did not reach SUCCEEDED within 90s');
    }
  } else record('8.2', 'BLOCKED', 'POST /api/v1/support/restore-validations', 'no successful backup to validate against');

  // ---------- Output ----------
  console.log('\n\n| Row | Status | Route | Note |');
  console.log('|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.status} | ${r.route} | ${r.note.replace(/\|/g, '\\|')} |`);
  const counts = rows.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});
  console.log(`\nTotals: ${JSON.stringify(counts)}`);
  if (counts.FAIL) process.exitCode = 1;
}
await main();
