// LOCAL-ONLY demo seed. Populates an isolated development database with realistic, fictional
// Egyptian nursery data so the real UI can be viewed against the real API and database.
//
// Safety rules (enforced below, never relax them):
// - Requires DEMO_SEED=true and a DATABASE_URL that points at localhost; refuses NODE_ENV=production.
// - Only inserts rows; never deletes or updates non-demo data. Every demo record carries a DEMO- code
//   or a demo.* username so it is recognisable, and every step is idempotent (natural-key checks and
//   deterministic operation IDs), so re-running the command is safe.
// - Writes go through the same application services the API uses (permission checks, audit rows,
//   idempotency records and ledger invariants included). The only direct SQL writes are the ones the
//   services cannot express for a backfill: sessions for the seed's own actors, demo guardian accounts,
//   children with a backdated enrollment history, and known demo passwords.
//
// Usage (PowerShell):  $env:DEMO_SEED='true'; npm run db:seed:demo
// Usage (bash):        DEMO_SEED=true npm run db:seed:demo
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { assertSchemaCurrent, runReminderBatch, type Database } from '@nursery/db';
import { addIsoDays, cairoIsoDate, monthlyDue, monthStart, nextMonth } from '@nursery/domain';
import type { Capability } from '@nursery/contracts';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { SafeError } from './errors.js';
import { hashPassword, randomToken, tokenHash } from './modules/auth/crypto.js';

// ---------------------------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------------------------
function refuse(message: string): never { process.stderr.write(`[DEMO SEED] Refusing to run: ${message}\n`); process.exit(2); }
if (process.env.DEMO_SEED !== 'true') refuse('set DEMO_SEED=true explicitly. This command only targets a local development database.');
if (process.env.NODE_ENV === 'production') refuse('NODE_ENV=production.');
const config = loadConfig();
if (config.production) refuse('production configuration detected.');
const databaseHost = new URL(config.databaseUrl).hostname.replace(/^\[|\]$/g, '');
if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) refuse(`DATABASE_URL host "${databaseHost}" is not local (localhost/127.0.0.1/::1).`);
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(config.appOrigin)) refuse(`APP_ORIGIN "${config.appOrigin}" is not a local development origin.`);

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
const STAFF_PASSWORD = 'Demo-Nursery-2026!';
const PARENT_PASSWORD = 'Demo-Parent-2026!';
const today = cairoIsoDate();
const log = (line: string) => process.stdout.write(`[DEMO SEED] ${line}\n`);
// Deterministic UUIDs (RFC 4122 layout) so operation IDs replay instead of duplicating work.
function demoId(key: string): string {
  const hex = createHash('sha256').update(`nursery-demo-seed/${key}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4'; hex[16] = '89ab'[parseInt(hex[16], 16) % 4];
  const h = hex.join(''); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const pick = (key: string, modulo: number) => parseInt(createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % modulo;
const monthsAgo = (months: number) => { const [y, m, d] = today.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1 - months, 1)); const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); date.setUTCDate(Math.min(d, last)); return date.toISOString().slice(0, 10); };
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const isWorkingDay = (iso: string) => weekday(iso) !== 5 && weekday(iso) !== 6; // Egyptian weekend: Friday, Saturday
const egp = (pounds: number) => String(Math.round(pounds * 100));
const monthName = (iso: string) => new Date(`${iso.slice(0, 7)}-01T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const m0 = monthStart(today), m1 = monthStart(monthsAgo(1)), m2 = monthStart(monthsAgo(2));
const workingDays: string[] = [];
for (let d = addIsoDays(today, -27); d < today; d = addIsoDays(d, 1)) if (isWorkingDay(d)) workingDays.push(d);
const days = workingDays.slice(-15);

// ---------------------------------------------------------------------------------------------
// Fictional dataset
// ---------------------------------------------------------------------------------------------
const BRANCHES = [
  { code: 'DEMO-MAADI', name: 'Maadi Branch (فرع المعادي)' },
  { code: 'DEMO-NASR', name: 'Nasr City Branch (فرع مدينة نصر)' }
];
const AGE_GROUPS = [
  { code: 'DEMO-INFANTS', name: 'Infants (6–18 months)', minMonths: 6, maxMonths: 18 },
  { code: 'DEMO-TODDLERS', name: 'Toddlers (18–36 months)', minMonths: 18, maxMonths: 36 },
  { code: 'DEMO-KG', name: 'KG (3–5 years)', minMonths: 36, maxMonths: 60 }
];
const CLASSROOMS = [
  { code: 'DEMO-M-SUN', name: 'Sunflowers (عباد الشمس)', branch: 'DEMO-MAADI', ageGroup: 'DEMO-KG', capacity: 12, tuition: 3500 },
  { code: 'DEMO-M-BUT', name: 'Butterflies (الفراشات)', branch: 'DEMO-MAADI', ageGroup: 'DEMO-TODDLERS', capacity: 10, tuition: 3200 },
  { code: 'DEMO-M-STAR', name: 'Little Stars (النجوم الصغيرة)', branch: 'DEMO-MAADI', ageGroup: 'DEMO-INFANTS', capacity: 6, tuition: 3800 },
  { code: 'DEMO-N-RAIN', name: 'Rainbows (قوس قزح)', branch: 'DEMO-NASR', ageGroup: 'DEMO-KG', capacity: 12, tuition: 3300 },
  { code: 'DEMO-N-BEE', name: 'Busy Bees (النحل النشيط)', branch: 'DEMO-NASR', ageGroup: 'DEMO-TODDLERS', capacity: 8, tuition: 3000 }
];
const ROLES: { name: string; capabilities: Capability[] }[] = [
  { name: 'Demo · Nursery administrator', capabilities: ['organization.read', 'organization.manage', 'users.assign_roles', 'modules.manage', 'users.manage_staff', 'users.create_parent', 'parents.block', 'children.read', 'children.manage', 'guardians.manage', 'documents.manage', 'health.read', 'health.manage', 'pickup.record', 'pickup.manage', 'incidents.read', 'incidents.manage', 'learning.read', 'learning.publish', 'exams.catalog', 'announcements.manage', 'finance.read', 'billing.manage', 'payments.record', 'treasury.manage', 'expenses.manage', 'expenses.pay', 'expenses.approve', 'treasury.close', 'finance.correct', 'transport.manage', 'transport.read', 'activities.manage', 'activities.read', 'payroll.manage', 'payroll.pay', 'imports.commit'] },
  { name: 'Demo · Branch manager', capabilities: ['organization.read', 'users.create_parent', 'children.read', 'children.manage', 'guardians.manage', 'documents.manage', 'health.read', 'health.manage', 'pickup.record', 'pickup.manage', 'incidents.read', 'incidents.manage', 'learning.read', 'learning.publish', 'announcements.manage', 'finance.read', 'billing.manage', 'payments.record', 'expenses.manage', 'expenses.pay', 'treasury.close', 'transport.manage', 'transport.read', 'activities.manage', 'activities.read'] },
  { name: 'Demo · Teacher', capabilities: ['organization.read', 'children.read', 'health.read', 'pickup.record', 'incidents.read', 'incidents.manage', 'learning.read', 'learning.publish', 'announcements.manage', 'transport.read', 'activities.read'] },
  { name: 'Demo · Accountant', capabilities: ['organization.read', 'children.read', 'finance.read', 'billing.manage', 'payments.record', 'treasury.manage', 'expenses.manage', 'expenses.pay', 'expenses.approve', 'treasury.close', 'finance.correct', 'transport.read', 'activities.read', 'payroll.manage', 'payroll.pay'] }
];
type Employee = { code: string; name: string; salary: number; branch: string; username?: string; role?: string; scope?: 'BRANCH' | 'CLASSROOM'; branches?: string[]; classrooms?: string[]; sensitive?: boolean; former?: boolean };
const EMPLOYEES: Employee[] = [
  { code: 'DEMO-E001', name: 'Mona Abdel Rahman', salary: 15000, branch: 'DEMO-MAADI', username: 'demo.admin', role: 'Demo · Nursery administrator', scope: 'BRANCH', branches: ['DEMO-MAADI', 'DEMO-NASR'], sensitive: true },
  { code: 'DEMO-E002', name: 'Hala Mostafa', salary: 11000, branch: 'DEMO-MAADI', username: 'demo.manager.maadi', role: 'Demo · Branch manager', scope: 'BRANCH', branches: ['DEMO-MAADI'] },
  { code: 'DEMO-E003', name: 'Amr El-Sayed', salary: 11000, branch: 'DEMO-NASR', username: 'demo.manager.nasr', role: 'Demo · Branch manager', scope: 'BRANCH', branches: ['DEMO-NASR'] },
  { code: 'DEMO-E004', name: 'Nour Hassan', salary: 8500, branch: 'DEMO-MAADI', username: 'demo.teacher.nour', role: 'Demo · Teacher', scope: 'CLASSROOM', branches: ['DEMO-MAADI'], classrooms: ['DEMO-M-SUN'] },
  { code: 'DEMO-E005', name: 'Salma Ibrahim', salary: 7500, branch: 'DEMO-MAADI', username: 'demo.teacher.salma', role: 'Demo · Teacher', scope: 'CLASSROOM', branches: ['DEMO-MAADI'], classrooms: ['DEMO-M-BUT', 'DEMO-M-STAR'] },
  { code: 'DEMO-E006', name: 'Yasmin Farouk', salary: 8000, branch: 'DEMO-NASR', username: 'demo.teacher.yasmin', role: 'Demo · Teacher', scope: 'CLASSROOM', branches: ['DEMO-NASR'], classrooms: ['DEMO-N-RAIN'] },
  { code: 'DEMO-E007', name: 'Dina Khalil', salary: 7500, branch: 'DEMO-NASR', username: 'demo.teacher.dina', role: 'Demo · Teacher', scope: 'CLASSROOM', branches: ['DEMO-NASR'], classrooms: ['DEMO-N-BEE'] },
  { code: 'DEMO-E008', name: 'Karim Adel', salary: 9500, branch: 'DEMO-MAADI', username: 'demo.accountant', role: 'Demo · Accountant', scope: 'BRANCH', branches: ['DEMO-MAADI', 'DEMO-NASR'], sensitive: true },
  { code: 'DEMO-E009', name: 'Hassan Mahmoud (bus driver)', salary: 5500, branch: 'DEMO-MAADI' },
  { code: 'DEMO-E010', name: 'Fatma Saeed (cook)', salary: 4800, branch: 'DEMO-MAADI' },
  { code: 'DEMO-E011', name: 'Sayed Ali (cleaner)', salary: 3800, branch: 'DEMO-MAADI' },
  { code: 'DEMO-E012', name: 'Nadia Fathy (assistant)', salary: 5000, branch: 'DEMO-NASR' },
  { code: 'DEMO-E013', name: 'Om Kolthoum Gaber (cleaner)', salary: 3800, branch: 'DEMO-NASR' },
  { code: 'DEMO-E014', name: 'Nermeen Lotfy', salary: 7000, branch: 'DEMO-NASR', username: 'demo.teacher.nermeen', role: 'Demo · Teacher', scope: 'CLASSROOM', branches: ['DEMO-NASR'], classrooms: ['DEMO-N-RAIN'], former: true }
];
type Guardian = { username: string; name: string; mobile: string; relationship: string; finance: boolean; locale: 'en' | 'ar-EG' };
type ChildSpec = { code: string; name: string; ageMonths: number; room: string; enrolledDaysAgo: number; contacts?: { name: string; mobile: string; relationship: string }[]; bus?: boolean };
type Family = { key: string; guardians: Guardian[]; children: ChildSpec[]; discount?: number };
const father = (username: string, name: string, mobile: string, locale: 'en' | 'ar-EG' = 'en'): Guardian => ({ username, name, mobile, relationship: 'Father', finance: true, locale });
const mother = (username: string, name: string, mobile: string, locale: 'en' | 'ar-EG' = 'ar-EG'): Guardian => ({ username, name, mobile, relationship: 'Mother', finance: false, locale });
const FAMILIES: Family[] = [
  { key: 'sherbiny', discount: 0.1, guardians: [father('demo.parent.ahmed', 'Ahmed El-Sherbiny', '01001230001'), mother('demo.parent.rania', 'Rania El-Sherbiny', '01001230002')],
    children: [{ code: 'DEMO-C001', name: 'Youssef Ahmed El-Sherbiny', ageMonths: 54, room: 'DEMO-M-SUN', enrolledDaysAgo: 380, bus: true, contacts: [{ name: 'Fatma Abdelhamid', mobile: '01223330001', relationship: 'Grandmother' }] },
      { code: 'DEMO-C002', name: 'Laila Ahmed El-Sherbiny', ageMonths: 26, room: 'DEMO-M-BUT', enrolledDaysAgo: 230, bus: true }] },
  { key: 'mahmoud', guardians: [father('demo.parent.mohamed', 'Mohamed Mahmoud', '01001230003'), mother('demo.parent.heba', 'Heba Mahmoud', '01001230004')],
    children: [{ code: 'DEMO-C003', name: 'Omar Mohamed Mahmoud', ageMonths: 50, room: 'DEMO-M-SUN', enrolledDaysAgo: 370, contacts: [{ name: 'Sayed Mahmoud', mobile: '01223330002', relationship: 'Uncle' }] }] },
  { key: 'tantawy', guardians: [father('demo.parent.khaled', 'Khaled Tantawy', '01001230005'), mother('demo.parent.nesma', 'Nesma Tantawy', '01001230006', 'en')],
    children: [{ code: 'DEMO-C004', name: 'Malak Khaled Tantawy', ageMonths: 47, room: 'DEMO-M-SUN', enrolledDaysAgo: 300, bus: true }] },
  { key: 'fawzy', guardians: [father('demo.parent.tarek', 'Tarek Fawzy', '01001230007', 'ar-EG')],
    children: [{ code: 'DEMO-C005', name: 'Hana Tarek Fawzy', ageMonths: 44, room: 'DEMO-M-SUN', enrolledDaysAgo: 45, contacts: [{ name: 'Mervat Fawzy', mobile: '01223330003', relationship: 'Aunt' }] }] },
  { key: 'gamal', guardians: [father('demo.parent.sherif', 'Sherif Gamal', '01001230008'), mother('demo.parent.mai', 'Mai Gamal', '01001230009')],
    children: [{ code: 'DEMO-C006', name: 'Adam Sherif Gamal', ageMonths: 52, room: 'DEMO-M-SUN', enrolledDaysAgo: 360 }] },
  { key: 'abdelaziz', discount: 0.1, guardians: [father('demo.parent.wael', 'Wael Abdelaziz', '01001230010'), mother('demo.parent.dalia', 'Dalia Abdelaziz', '01001230011')],
    children: [{ code: 'DEMO-C007', name: 'Farida Wael Abdelaziz', ageMonths: 41, room: 'DEMO-M-SUN', enrolledDaysAgo: 200, bus: true }, { code: 'DEMO-C008', name: 'Ali Wael Abdelaziz', ageMonths: 22, room: 'DEMO-M-BUT', enrolledDaysAgo: 200, bus: true }] },
  { key: 'selim', guardians: [father('demo.parent.hossam', 'Hossam Selim', '01001230012')],
    children: [{ code: 'DEMO-C009', name: 'Zeina Hossam Selim', ageMonths: 30, room: 'DEMO-M-BUT', enrolledDaysAgo: 250 }] },
  { key: 'naguib', guardians: [father('demo.parent.mostafa', 'Mostafa Naguib', '01001230013'), mother('demo.parent.marwa', 'Marwa Naguib', '01001230014')],
    children: [{ code: 'DEMO-C010', name: 'Seif Mostafa Naguib', ageMonths: 27, room: 'DEMO-M-BUT', enrolledDaysAgo: 150 }] },
  { key: 'kamel', guardians: [father('demo.parent.ayman', 'Ayman Kamel', '01001230015')],
    children: [{ code: 'DEMO-C011', name: 'Jana Ayman Kamel', ageMonths: 33, room: 'DEMO-M-BUT', enrolledDaysAgo: 30 }] },
  { key: 'radwan', guardians: [father('demo.parent.hesham', 'Hesham Radwan', '01001230016'), mother('demo.parent.noha', 'Noha Radwan', '01001230017')],
    children: [{ code: 'DEMO-C012', name: 'Mariam Hesham Radwan', ageMonths: 11, room: 'DEMO-M-STAR', enrolledDaysAgo: 100 }] },
  { key: 'shawky', guardians: [father('demo.parent.ehab', 'Ehab Shawky', '01001230018')],
    children: [{ code: 'DEMO-C013', name: 'Karim Ehab Shawky', ageMonths: 14, room: 'DEMO-M-STAR', enrolledDaysAgo: 120 }] },
  { key: 'ismail', guardians: [father('demo.parent.sameh', 'Sameh Ismail', '01001230019'), mother('demo.parent.ghada', 'Ghada Ismail', '01001230020')],
    children: [{ code: 'DEMO-C014', name: 'Nour Sameh Ismail', ageMonths: 9, room: 'DEMO-M-STAR', enrolledDaysAgo: 20 }] },
  { key: 'farag', discount: 0.1, guardians: [father('demo.parent.islam', 'Islam Farag', '01001230021'), mother('demo.parent.yara', 'Yara Farag', '01001230022')],
    children: [{ code: 'DEMO-C015', name: 'Ahmed Islam Farag', ageMonths: 56, room: 'DEMO-N-RAIN', enrolledDaysAgo: 400, bus: true }, { code: 'DEMO-C016', name: 'Salma Islam Farag', ageMonths: 25, room: 'DEMO-N-BEE', enrolledDaysAgo: 180, bus: true }] },
  { key: 'barakat', guardians: [father('demo.parent.ramy', 'Ramy Barakat', '01001230023')],
    children: [{ code: 'DEMO-C017', name: 'Lina Ramy Barakat', ageMonths: 48, room: 'DEMO-N-RAIN', enrolledDaysAgo: 320 }] },
  { key: 'hegazy', guardians: [father('demo.parent.magdy', 'Magdy Hegazy', '01001230024'), mother('demo.parent.samar', 'Samar Hegazy', '01001230025')],
    children: [{ code: 'DEMO-C018', name: 'Taha Magdy Hegazy', ageMonths: 45, room: 'DEMO-N-RAIN', enrolledDaysAgo: 290, bus: true }] },
  { key: 'elwan', guardians: [father('demo.parent.bassem', 'Bassem Elwan', '01001230026')],
    children: [{ code: 'DEMO-C019', name: 'Habiba Bassem Elwan', ageMonths: 39, room: 'DEMO-N-RAIN', enrolledDaysAgo: 55 }] },
  { key: 'ashraf', guardians: [father('demo.parent.amir', 'Amir Ashraf', '01001230027'), mother('demo.parent.shaimaa', 'Shaimaa Ashraf', '01001230028')],
    children: [{ code: 'DEMO-C020', name: 'Yahia Amir Ashraf', ageMonths: 28, room: 'DEMO-N-BEE', enrolledDaysAgo: 210 }] },
  { key: 'zaki', guardians: [father('demo.parent.fady', 'Fady Zaki', '01001230029')],
    children: [{ code: 'DEMO-C021', name: 'Celine Fady Zaki', ageMonths: 24, room: 'DEMO-N-BEE', enrolledDaysAgo: 160 }] },
  { key: 'mansour', guardians: [father('demo.parent.osama', 'Osama Mansour', '01001230030'), mother('demo.parent.rasha', 'Rasha Mansour', '01001230031')],
    children: [{ code: 'DEMO-C022', name: 'Mazen Osama Mansour', ageMonths: 31, room: 'DEMO-N-BEE', enrolledDaysAgo: 240 }] },
  { key: 'rashad', guardians: [father('demo.parent.nabil', 'Nabil Rashad', '01001230032')],
    children: [{ code: 'DEMO-C023', name: 'Hamza Nabil Rashad', ageMonths: 58, room: 'DEMO-N-RAIN', enrolledDaysAgo: 410 }] }
];
const PAUSED_CHILD = 'DEMO-C022', ARCHIVED_CHILD = 'DEMO-C023', TRANSFERRED_CHILD = 'DEMO-C006', BLOCKED_PARENT = 'demo.parent.fady';
const FEE_CATEGORIES = [
  { code: 'DEMO-TUITION', name: 'Monthly tuition', kind: 'TUITION' }, { code: 'DEMO-REG', name: 'Registration fee', kind: 'ADDITIONAL' },
  { code: 'DEMO-UNIFORM', name: 'Uniform & books', kind: 'ADDITIONAL' }, { code: 'DEMO-BUS', name: 'School bus', kind: 'BUS' }, { code: 'DEMO-TRIP', name: 'Trips & activities', kind: 'TRIP' }
];
const EXPENSE_CATEGORIES = [
  { code: 'DEMO-RENT', name: 'Rent' }, { code: 'DEMO-UTIL', name: 'Utilities (electricity, water, internet)' }, { code: 'DEMO-SUPPLIES', name: 'Classroom supplies' },
  { code: 'DEMO-FOOD', name: 'Meals & groceries' }, { code: 'DEMO-MAINT', name: 'Maintenance & repairs' }, { code: 'DEMO-FUEL', name: 'Bus fuel' }
];
const TREASURY = [
  { code: 'DEMO-MAADI-CASH', branch: 'DEMO-MAADI', name: 'Maadi cash drawer', type: 'CASH', opening: 15000 },
  { code: 'DEMO-MAADI-BANK', branch: 'DEMO-MAADI', name: 'CIB current account – Maadi', type: 'BANK', opening: 400000 },
  { code: 'DEMO-MAADI-WALLET', branch: 'DEMO-MAADI', name: 'Vodafone Cash – Maadi', type: 'WALLET', opening: 2000 },
  { code: 'DEMO-NASR-CASH', branch: 'DEMO-NASR', name: 'Nasr City cash drawer', type: 'CASH', opening: 10000 },
  { code: 'DEMO-NASR-BANK', branch: 'DEMO-NASR', name: 'Banque Misr current account – Nasr City', type: 'BANK', opening: 250000 },
  { code: 'DEMO-NASR-WALLET', branch: 'DEMO-NASR', name: 'InstaPay wallet – Nasr City', type: 'WALLET', opening: 1500 }
];
const ABSENCE_REASONS = ['Fever', 'Doctor appointment', 'Family travel', null, 'Cold and cough', null];

// ---------------------------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------------------------
type App = ReturnType<typeof buildApp>;
const app: App = buildApp(config);
const db: Database = app.database;
const q = <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => db.pool.query<T>(sql, values).then((r) => r.rows);
const one = async <T extends Record<string, unknown>>(sql: string, values: unknown[] = []) => (await q<T>(sql, values))[0];
const issuedTokens: string[] = [];
const created = new Map<string, number>();
const count = (what: string) => created.set(what, (created.get(what) ?? 0) + 1);

// The seed's actors authenticate exactly like browser sessions; the rows are revoked at the end.
async function sessionFor(username: string): Promise<string> {
  const account = await one<{ id: string; version: number; must_change_password: boolean; status: string }>('select id,version,must_change_password,status from accounts where username_normalized=$1', [username]);
  if (!account) throw new Error(`Account ${username} does not exist`);
  if (account.must_change_password || account.status !== 'ACTIVE') throw new Error(`Account ${username} cannot open a session (status ${account.status}, must change password: ${account.must_change_password})`);
  const token = randomToken(); const expiry = new Date(Date.now() + 2 * 60 * 60_000);
  await db.pool.query('insert into sessions(id,account_id,token_hash,account_version,expires_at,idle_expires_at) values($1,$2,$3,$4,$5,$5)', [randomUUID(), account.id, tokenHash(token), account.version, expiry]);
  issuedTokens.push(token); return token;
}
async function setKnownPassword(accountId: string, hash: string) {
  // Same effect as the superadmin seed: a permanent, known demo credential instead of a one-time temporary one.
  await db.pool.query('update accounts set password_hash=$2,must_change_password=false,temporary_expires_at=null,temporary_used=false where id=$1 and must_change_password', [accountId, hash]);
}
function describe(error: unknown): string {
  if (error instanceof SafeError) return `${error.code} (${error.messageKey}${error.publicMessage ? `: ${error.publicMessage}` : ''})`;
  return error instanceof Error ? `${error.message}${(error as { code?: string }).code ? ` [pg ${(error as { code?: string }).code}]` : ''}` : String(error);
}
let currentStep = 'startup';
async function step<T>(name: string, work: () => Promise<T>): Promise<T> {
  currentStep = name; const started = Date.now();
  const result = await work(); log(`${name} (${Date.now() - started} ms)`); return result;
}

try {
  await assertSchemaCurrent(db.pool, config.installationId);
  const system = await one<{ id: string; username_normalized: string; must_change_password: boolean }>("select id,username_normalized,must_change_password from accounts where kind='SYSTEM'");
  if (!system) refuse('no Superadmin account exists yet. Run `npm run db:seed:superadmin` (or `npm run auth:bootstrap`) first.');
  if (system.must_change_password) refuse('the Superadmin account still has a temporary password. Log in once and set a permanent password, then re-run.');
  const sys = await sessionFor(system.username_normalized);
  const [staffHash, parentHash] = await Promise.all([hashPassword(STAFF_PASSWORD), hashPassword(PARENT_PASSWORD)]);

  // ---- Licensing -------------------------------------------------------------------------------
  const neededEmployees = EMPLOYEES.filter((e) => e.username).length, neededParents = FAMILIES.reduce((n, f) => n + f.guardians.length, 0);
  await step('license limits', async () => {
    const context = await app.licensing.context(sys);
    if (!context.limits) {
      await app.licensing.saveLimits(sys, { expectedVersion: null, value: { parentCapacity: 80, employeeCapacity: 30, parentUnitPricePiastres: 3000, employeeUnitPricePiastres: 6000, subscriptionPeriod: 'YEARLY', startsOn: m2, validUntil: addIsoDays(m2, 364), graceDays: 14, agreedTotalOverridePiastres: null, agreedTotalOverrideReason: null, supportContact: 'Demo support · 0100 000 0000' } });
      count('license limits');
    } else if (context.limits.parentCapacity - context.parentReserved < neededParents - (await one<{ n: number }>("select count(*)::int as n from accounts where kind='GUARDIAN' and username_normalized like 'demo.%'"))!.n
      || context.limits.employeeCapacity - context.employeeReserved < neededEmployees - (await one<{ n: number }>("select count(*)::int as n from accounts where kind='STAFF' and username_normalized like 'demo.%'"))!.n) {
      refuse(`existing license limits leave too few free seats for the demo (needs ${neededParents} parent and ${neededEmployees} employee seats). The seed never modifies existing license limits; raise them in Support → Licenses first.`);
    }
    if (context.status === 'SUSPENDED') refuse('the existing license is suspended; the seed never modifies existing license limits.');
    if (!(await one('select 1 from license_renewal_payments where note=$1', ['Demo seed: annual renewal']))) {
      await app.licensing.recordRenewalPayment(sys, { periodStart: m2, periodEnd: addIsoDays(m2, 364), amountPiastres: 80 * 3000 + 30 * 6000, method: 'Bank transfer', note: 'Demo seed: annual renewal' }); count('license renewal payment');
    }
  });

  // ---- Organization ----------------------------------------------------------------------------
  const branchIds = new Map<string, string>(), ageGroupIds = new Map<string, string>(), classroomIds = new Map<string, string>(), roleIds = new Map<string, string>();
  await step('organization catalogs', async () => {
    for (const b of BRANCHES) {
      const existing = await one<{ id: string }>('select id from branches where code=$1', [b.code]);
      branchIds.set(b.code, existing?.id ?? (await app.organization.save(sys, 'branches', b)).id); if (!existing) count('branches');
    }
    for (const g of AGE_GROUPS) {
      const existing = await one<{ id: string }>('select id from age_groups where code=$1', [g.code]);
      ageGroupIds.set(g.code, existing?.id ?? (await app.organization.save(sys, 'age-groups', g)).id); if (!existing) count('age groups');
    }
    for (const c of CLASSROOMS) {
      const existing = await one<{ id: string }>('select id from classrooms where code=$1 and branch_id=$2', [c.code, branchIds.get(c.branch)]);
      classroomIds.set(c.code, existing?.id ?? (await app.organization.save(sys, 'classrooms', { code: c.code, name: c.name, branchId: branchIds.get(c.branch), ageGroupId: ageGroupIds.get(c.ageGroup), capacity: c.capacity })).id); if (!existing) count('classrooms');
    }
    for (const r of ROLES) {
      const existing = await one<{ id: string; version: number; capabilities: string[] }>('select id,version,array(select capability_key from role_capabilities where role_id=r.id order by capability_key) as capabilities from roles r where name=$1', [r.name]);
      roleIds.set(r.name, existing?.id ?? (await app.organization.save(sys, 'roles', r)).id); if (!existing) count('roles');
      // Demo roles are owned by the seed: keep their capability set in step with this file.
      if (existing && JSON.stringify([...r.capabilities].sort()) !== JSON.stringify(existing.capabilities)) { await app.organization.save(sys, 'roles', { expectedVersion: existing.version, value: r }, existing.id); count('role updates'); }
    }
  });

  // ---- Finance catalogs and treasury ---------------------------------------------------------
  const feeIds = new Map<string, string>(), expenseCategoryIds = new Map<string, string>(), accountIds = new Map<string, string>();
  await step('fee/expense categories and treasury accounts', async () => {
    for (const f of FEE_CATEGORIES) {
      const existing = await one<{ id: string }>('select id from fee_categories where code=$1', [f.code]);
      feeIds.set(f.code, existing?.id ?? (await app.ledger.category(sys, { operationId: demoId(`fee/${f.code}`), ...f })).id); if (!existing) count('fee categories');
    }
    for (const e of EXPENSE_CATEGORIES) {
      const existing = await one<{ id: string }>('select id from expense_categories where code=$1', [e.code]);
      expenseCategoryIds.set(e.code, existing?.id ?? (await app.spending.category(sys, { operationId: demoId(`expense-category/${e.code}`), ...e })).id); if (!existing) count('expense categories');
    }
    for (const t of TREASURY) {
      const existing = await one<{ id: string }>('select id from treasury_accounts where code=$1', [t.code]);
      accountIds.set(t.code, existing?.id ?? (await app.treasury.createAccount(sys, { operationId: demoId(`treasury/${t.code}`), branchId: branchIds.get(t.branch), code: t.code, name: t.name, type: t.type, openingAmount: egp(t.opening), openedOn: addIsoDays(m2, -10), reason: 'Opening balance at go-live (demo)' })).id); if (!existing) count('treasury accounts');
    }
  });
  const bankOf = (branch: string) => accountIds.get(branch === 'DEMO-MAADI' ? 'DEMO-MAADI-BANK' : 'DEMO-NASR-BANK')!;
  const cashOf = (branch: string) => accountIds.get(branch === 'DEMO-MAADI' ? 'DEMO-MAADI-CASH' : 'DEMO-NASR-CASH')!;
  const walletOf = (branch: string) => accountIds.get(branch === 'DEMO-MAADI' ? 'DEMO-MAADI-WALLET' : 'DEMO-NASR-WALLET')!;

  // ---- Employees, staff logins, role assignments ------------------------------------------------
  const employeeIds = new Map<string, string>(), staffIds = new Map<string, string>();
  await step('employees and staff accounts', async () => {
    for (const e of EMPLOYEES) {
      let employee = await one<{ id: string; account_id: string | null }>('select id,account_id from employee_profile_states where employee_code=$1', [e.code]);
      if (!employee) {
        const result = await app.payroll.createProfile(sys, { operationId: demoId(`employee/${e.code}`), employeeCode: e.code, fullName: e.name, basicSalary: egp(e.salary), effectiveMonth: m2.slice(0, 7), payingBranchId: branchIds.get(e.branch), payingAccountId: bankOf(e.branch), loginUsername: e.username ?? null });
        employee = { id: result.id, account_id: result.accountId }; count('employees');
      }
      employeeIds.set(e.code, employee.id);
      if (!e.username) continue;
      const accountId = employee.account_id!; staffIds.set(e.username, accountId);
      await setKnownPassword(accountId, staffHash);
      const account = await one<{ assignment_version: number; roles: number; sensitive: boolean; status: string }>('select assignment_version,(select count(*)::int from account_roles where account_id=a.id) as roles,coalesce((select sensitive_financial_edit from sensitive_grants where account_id=a.id),false) as sensitive,status from accounts a where id=$1', [accountId]);
      if (!account!.roles) {
        await app.organization.assign(sys, accountId, { expectedVersion: account!.assignment_version, roleIds: [roleIds.get(e.role!)!], branchIds: e.branches!.map((b) => branchIds.get(b)!), classroomIds: (e.classrooms ?? []).map((c) => classroomIds.get(c)!), scopeMode: e.scope! }); count('staff assignments');
        if (e.sensitive) await app.organization.delegateOrGrant(sys, accountId, 'grant', { expectedVersion: account!.assignment_version + 1, sensitiveFinancialEdit: true });
      }
      // The administrator can only see/assign staff for roles delegated to her (Superadmin delegates them).
      if (e.username === 'demo.admin' && !(await one('select 1 from delegated_assignable_roles where account_id=$1', [accountId]))) {
        const version = (await one<{ assignment_version: number }>('select assignment_version from accounts where id=$1', [accountId]))!.assignment_version;
        await app.organization.delegateOrGrant(sys, accountId, 'delegation', { expectedVersion: version, roleIds: ROLES.map((r) => roleIds.get(r.name)!) }); count('role delegations');
      }
      if (e.former && account!.status === 'ACTIVE') {
        await app.licensing.deactivateAccount(sys, accountId, { reason: 'Left the nursery at the end of last term (demo)' });
        await app.payroll.profileStatus(sys, employee.id, { operationId: demoId(`employee-status/${e.code}`), active: false, reason: 'Resigned; final settlement paid (demo)' }); count('deactivated staff');
      }
    }
  });
  const staffToken = new Map<string, string>();
  for (const username of ['demo.admin', 'demo.manager.maadi', 'demo.manager.nasr', 'demo.teacher.nour', 'demo.teacher.salma', 'demo.teacher.yasmin', 'demo.teacher.dina', 'demo.accountant']) staffToken.set(username, await sessionFor(username));
  const admin = staffToken.get('demo.admin')!, accountant = staffToken.get('demo.accountant')!;
  const managerOf = (branch: string) => staffToken.get(branch === 'DEMO-MAADI' ? 'demo.manager.maadi' : 'demo.manager.nasr')!;
  const teacherOf = (room: string) => staffToken.get({ 'DEMO-M-SUN': 'demo.teacher.nour', 'DEMO-M-BUT': 'demo.teacher.salma', 'DEMO-M-STAR': 'demo.teacher.salma', 'DEMO-N-RAIN': 'demo.teacher.yasmin', 'DEMO-N-BEE': 'demo.teacher.dina' }[room]!)!;
  const roomOf = (code: string) => CLASSROOMS.find((c) => c.code === code)!;

  // ---- Families: guardians, children, links (direct schema writes with a backdated enrollment) ---
  type ChildRow = { id: string; code: string; name: string; birthDate: string; enrolledOn: string; room: string; branch: string; family: Family; spec: ChildSpec };
  const children: ChildRow[] = []; const guardianIds = new Map<string, string>();
  await step('families (guardian accounts, children, links)', async () => {
    const limits = (await one<{ parent_capacity: number }>('select parent_capacity from license_limits where singleton'))!;
    for (const family of FAMILIES) {
      await db.transaction(async (tx) => {
        // Same lock order as ChildService.withPolicy for guardian-scope changes.
        await tx.query('select pg_advisory_xact_lock_shared(7190501)'); await tx.query('select pg_advisory_xact_lock_shared(7190401)'); await tx.query('select pg_advisory_xact_lock(7190601)');
        for (const g of family.guardians) {
          let account = (await tx.query<{ id: string }>('select id from accounts where username_normalized=$1', [g.username])).rows[0];
          if (!account) {
            const reserved = (await tx.query<{ n: number }>("select count(*)::int as n from seat_reservations where kind='PARENT' and released_at is null")).rows[0].n;
            if (reserved >= limits.parent_capacity) throw new Error('Parent seat capacity exhausted');
            account = { id: randomUUID() };
            await tx.query("insert into accounts(id,kind,username_normalized,password_hash,must_change_password,locale) values($1,'GUARDIAN',$2,$3,false,$4)", [account.id, g.username, parentHash, g.locale]);
            await tx.query("insert into seat_reservations(id,kind,account_id) values($1,'PARENT',$2)", [randomUUID(), account.id]);
            await tx.query("insert into licensing_audit_events(id,actor_id,event,target_id,before_data,after_data) values($1,$2,'licensing.guardian_provisioned',$3,null,$4)", [randomUUID(), staffIds.get('demo.admin'), account.id, JSON.stringify({ username: g.username, demo: true })]);
            await tx.query('insert into guardian_profiles(account_id,full_name,mobile) values($1,$2,$3)', [account.id, g.name, g.mobile]);
            count('guardian accounts');
          }
          guardianIds.set(g.username, account.id);
        }
        for (const spec of family.children) {
          const room = roomOf(spec.room); const branchId = branchIds.get(room.branch)!, classroomId = classroomIds.get(spec.room)!;
          const birthDate = monthsAgo(spec.ageMonths), enrolledOn = addIsoDays(today, -spec.enrolledDaysAgo);
          let child = (await tx.query<{ id: string }>('select id from children where code=$1', [spec.code])).rows[0];
          if (!child) {
            child = { id: randomUUID() }; const actor = staffIds.get('demo.admin')!;
            await tx.query('insert into children(id,code,full_name,birth_date,branch_id,classroom_id) values($1,$2,$3,$4,$5,$6)', [child.id, spec.code, spec.name, birthDate, branchId, classroomId]);
            for (const c of spec.contacts ?? []) await tx.query('insert into child_contacts(id,child_id,full_name,mobile,relationship) values($1,$2,$3,$4,$5)', [randomUUID(), child.id, c.name, c.mobile, c.relationship]);
            for (const g of family.guardians) await tx.query('insert into guardian_child_links(guardian_id,child_id,relationship,can_read,can_finance,can_pickup,can_notify) values($1,$2,$3,true,$4,true,true)', [guardianIds.get(g.username), child.id, g.relationship, g.finance]);
            await tx.query("insert into child_status_history(id,child_id,actor_id,branch_id,previous_status,new_status,effective_on,reason,public_message,child_name_snapshot) values($1,$2,$3,$4,null,'ACTIVE',$5,'Onboarding',null,$6)", [randomUUID(), child.id, actor, branchId, enrolledOn, spec.name]);
            await tx.query("insert into child_classroom_history(id,child_id,actor_id,branch_id,previous_classroom_id,classroom_id,effective_on,reason,child_name_snapshot) values($1,$2,$3,$4,null,$5,$6,'Onboarding',$7)", [randomUUID(), child.id, actor, branchId, classroomId, enrolledOn, spec.name]);
            await tx.query("insert into child_audit_events(id,child_id,actor_id,branch_id,event,before_data,after_data) values($1,$2,$3,$4,'child.onboarded',null,$5)", [randomUUID(), child.id, actor, branchId, JSON.stringify({ code: spec.code, fullName: spec.name, birthDate, enrolledOn, demo: true })]);
            count('children');
          }
          children.push({ id: child.id, code: spec.code, name: spec.name, birthDate, enrolledOn, room: spec.room, branch: room.branch, family, spec });
        }
      });
    }
  });
  const childByCode = (code: string) => children.find((c) => c.code === code)!;
  const payerOf = (c: ChildRow) => c.family.guardians[0];
  // Re-runs must follow the database, not the spec: a child paused, archived or transferred by an earlier
  // run belongs to a different roster now. Learning and cash steps therefore use the current placement.
  const current = new Map<string, { status: string; branch: string; room: string | null }>();
  const refreshCurrent = async () => {
    for (const row of await q<{ id: string; status: string; branch: string; room: string | null }>('select ch.id,ch.status,b.code as branch,c.code as room from children ch join branches b on b.id=ch.branch_id left join classrooms c on c.id=ch.classroom_id where ch.id=any($1::uuid[])', [children.map((c) => c.id)])) current.set(row.id, row);
  };
  await refreshCurrent();
  const rosterOf = (room: string, date: string) => children.filter((c) => { const now = current.get(c.id)!; return now.status === 'ACTIVE' && now.room === room && c.enrolledOn <= date; });
  const branchNow = (c: ChildRow) => current.get(c.id)!.branch;

  // ---- Health, pickup, incidents, documents ---------------------------------------------------
  await step('health entries, pickup authorizations, restrictions, incidents, documents', async () => {
    type HealthEntry = { kind: 'NOTE' | 'ALLERGY' | 'ALERT' | 'EMERGENCY_CONTACT'; title: string; body: string; mobile: string | null; severity: 'INFO' | 'CRITICAL' };
    const health: [string, HealthEntry][] = [
      ['DEMO-C001', { kind: 'ALLERGY', title: 'Peanut allergy', body: 'Severe reaction to peanuts and peanut butter. EpiPen kept in the office fridge; call the parents immediately.', mobile: null, severity: 'CRITICAL' }],
      ['DEMO-C001', { kind: 'EMERGENCY_CONTACT', title: 'Grandmother – Fatma Abdelhamid', body: 'Lives nearby in Maadi; call if both parents are unreachable.', mobile: '01223330001', severity: 'INFO' }],
      ['DEMO-C010', { kind: 'ALERT', title: 'Asthma', body: 'Uses an inhaler when short of breath. Avoid long outdoor play in dusty weather.', mobile: null, severity: 'CRITICAL' }],
      ['DEMO-C004', { kind: 'NOTE', title: 'Lactose intolerance', body: 'Milk-free snacks only; the mother sends lactose-free milk.', mobile: null, severity: 'INFO' }],
      ['DEMO-C015', { kind: 'NOTE', title: 'Wears glasses', body: 'Please make sure the glasses are in the bag before pickup.', mobile: null, severity: 'INFO' }],
      ['DEMO-C012', { kind: 'EMERGENCY_CONTACT', title: 'Aunt – Mona Radwan', body: 'Second emergency contact.', mobile: '01223330004', severity: 'INFO' }],
      ['DEMO-C019', { kind: 'ALLERGY', title: 'Egg allergy', body: 'Mild rash after eating eggs. No eggs in snacks.', mobile: null, severity: 'INFO' }]
    ];
    for (const [code, entry] of health) {
      const child = childByCode(code);
      if (await one('select 1 from health_entries where child_id=$1 and title=$2', [child.id, entry.title])) continue;
      await app.safety.createHealthEntry(managerOf(branchNow(child)), child.id, entry); count('health entries');
    }
    const authorizations: [string, { fullName: string; mobile: string; relationship: string; validFrom: string; validUntil: string | null; review?: 'APPROVED' | 'REJECTED' }][] = [
      ['DEMO-C001', { fullName: 'Mervat Saleh', mobile: '01112220001', relationship: 'Nanny', validFrom: addIsoDays(today, -60), validUntil: null, review: 'APPROVED' }],
      ['DEMO-C003', { fullName: 'Sayed Mahmoud', mobile: '01223330002', relationship: 'Uncle', validFrom: addIsoDays(today, -30), validUntil: addIsoDays(today, 60) }],
      ['DEMO-C015', { fullName: 'Hoda Farag', mobile: '01112220003', relationship: 'Grandmother', validFrom: addIsoDays(today, -90), validUntil: null, review: 'APPROVED' }],
      ['DEMO-C017', { fullName: 'Ashraf Barakat', mobile: '01112220004', relationship: 'Uncle', validFrom: addIsoDays(today, -200), validUntil: addIsoDays(today, -5) }],
      ['DEMO-C020', { fullName: 'Driver – Mahmoud Ezzat', mobile: '01112220005', relationship: 'Family driver', validFrom: addIsoDays(today, -10), validUntil: null, review: 'REJECTED' }]
    ];
    for (const [code, a] of authorizations) {
      const child = childByCode(code);
      if (await one('select 1 from pickup_authorizations where child_id=$1 and full_name=$2', [child.id, a.fullName])) continue;
      const { review, ...input } = a; const result = await app.safety.createAuthorization(managerOf(branchNow(child)), child.id, input); count('pickup authorizations');
      if (review) await app.safety.reviewAuthorization(managerOf(branchNow(child)), result.id, { expectedVersion: result.version, decision: review, note: review === 'APPROVED' ? 'Identity verified against the national ID card.' : 'Family did not confirm this person by phone.' });
    }
    const restrictions: [string, { kind: 'PROHIBITED_COLLECTOR' | 'REVIEW_REQUIRED'; fullName: string | null; mobile: string | null; summary: string; privateNote: string | null }][] = [
      ['DEMO-C021', { kind: 'PROHIBITED_COLLECTOR', fullName: 'Sami Zaki', mobile: '01112220009', summary: 'Court order: this person must not collect the child.', privateNote: 'Custody dispute. Copy of the court order in the office file. Call the mother if he appears.' }],
      ['DEMO-C020', { kind: 'REVIEW_REQUIRED', fullName: null, mobile: null, summary: 'Every authorized person must be confirmed by the branch manager.', privateNote: 'Parents asked for extra confirmation after a mix-up in June.' }]
    ];
    for (const [code, r] of restrictions) {
      const child = childByCode(code);
      if (await one('select 1 from pickup_restrictions where child_id=$1 and summary=$2', [child.id, r.summary])) continue;
      await app.safety.createRestriction(managerOf(branchNow(child)), child.id, r); count('pickup restrictions');
    }
    const incidents: [string, { occurredOn: string; occurredTime: string; description: string; actionTaken: string; contactMethod: 'CALL' | 'WHATSAPP' | 'IN_PERSON' | 'IN_APP' | null; followUp: string | null; close?: boolean }][] = [
      ['DEMO-C003', { occurredOn: days[days.length - 3] ?? today, occurredTime: '10:40', description: 'Slipped on the wet floor near the sink and bruised his left knee.', actionTaken: 'Cleaned the scrape, applied a cold pack and comforted him. No swelling.', contactMethod: 'CALL', followUp: 'Mother informed by phone; asked to keep an eye on the bruise.', close: true }],
      ['DEMO-C009', { occurredOn: days[days.length - 6] ?? today, occurredTime: '12:15', description: 'Bitten on the forearm by another child during free play.', actionTaken: 'Washed the area, applied ice; both children separated and calmed.', contactMethod: 'IN_PERSON', followUp: 'Father saw the mark at pickup; teacher will watch the two children closely this week.' }],
      ['DEMO-C018', { occurredOn: days[days.length - 2] ?? today, occurredTime: '09:30', description: 'Temperature of 38.2°C after arrival.', actionTaken: 'Moved to the quiet room, gave water, monitored every 15 minutes.', contactMethod: 'WHATSAPP', followUp: null }],
      ['DEMO-C016', { occurredOn: days[days.length - 9] ?? today, occurredTime: '14:05', description: 'Fell from the small slide in the garden; small cut on the chin.', actionTaken: 'First aid applied; no stitches needed.', contactMethod: null, followUp: null }]
    ];
    for (const [code, i] of incidents) {
      const child = childByCode(code);
      if (await one('select 1 from incidents where child_id=$1 and occurred_on=$2 and description=$3', [child.id, i.occurredOn, i.description])) continue;
      const { close, ...input } = i;
      const incident = await app.safety.reportIncident(teacherOf(current.get(child.id)!.room!), child.id, { ...input, guardianInformed: input.contactMethod !== null }); count('incidents');
      if (close) await app.safety.updateIncident(managerOf(branchNow(child)), incident.id, { expectedVersion: incident.version, actionTaken: incident.actionTaken, guardianInformed: true, contactMethod: incident.contactMethod, followUp: `${incident.followUp ?? ''} Bruise healed; closed by the branch manager.`.trim(), status: 'CLOSED' });
    }
    const documents: [string, string, string | null][] = [
      ['DEMO-C001', 'Birth certificate', null], ['DEMO-C001', 'Vaccination card', addIsoDays(today, 20)], ['DEMO-C005', 'Registration form', null],
      ['DEMO-C015', 'Passport copy', addIsoDays(today, -12)], ['DEMO-C011', 'Medical clearance', addIsoDays(today, 45)]
    ];
    for (const [code, name, expiresOn] of documents) {
      const child = childByCode(code);
      if (await one('select 1 from child_documents where child_id=$1 and name=$2 and not retired', [child.id, name])) continue;
      const pdf = await PDFDocument.create(); const page = pdf.addPage([420, 300]); const font = await pdf.embedFont(StandardFonts.Helvetica);
      page.drawText(`DEMO DOCUMENT - ${name}`, { x: 30, y: 240, size: 18, font }); page.drawText(`Child: ${child.name} (${child.code})`, { x: 30, y: 200, size: 12, font });
      page.drawText('Fictional data generated by the local demo seed.', { x: 30, y: 170, size: 10, font });
      await app.childDocuments.upload(admin, child.id, { name, expiresOn, mimeType: 'application/pdf', contentBase64: Buffer.from(await pdf.save()).toString('base64') }); count('child documents');
    }
  });

  // ---- Learning: attendance, exams, homework -------------------------------------------------
  const statusId = async (kind: string, outcome: string) => (await one<{ id: string }>('select s.id from checkpoint_statuses s join checkpoint_definitions d on d.id=s.definition_id where d.kind=$1 and s.outcome=$2', [kind, outcome]))!.id;
  const PRESENT = await statusId('ATTENDANCE', 'PRESENT'), ABSENT = await statusId('ATTENDANCE', 'ABSENT');
  const HW = { COMPLETED: await statusId('HOMEWORK', 'COMPLETED'), NOT_COMPLETED: await statusId('HOMEWORK', 'NOT_COMPLETED'), EXCUSED: await statusId('HOMEWORK', 'EXCUSED') };
  await step(`attendance for ${days.length} working days`, async () => {
    for (const room of CLASSROOMS) {
      for (const date of days) {
        const roster = rosterOf(room.code, date);
        if (!roster.length) continue;
        const entries = roster.map((c) => {
          const absent = pick(`${c.code}/${date}`, 100) < 8; const reason = absent ? ABSENCE_REASONS[pick(`reason/${c.code}/${date}`, ABSENCE_REASONS.length)] : null;
          return { childId: c.id, statusId: absent ? ABSENT : PRESENT, absenceReason: reason, expectedVersion: 0 };
        });
        const operationId = demoId(`attendance/${room.code}/${date}`);
        if (await one('select 1 from learning_operations where operation_id=$1', [operationId])) continue;
        await app.attendance.publishClassroom(teacherOf(room.code), { classroomId: classroomIds.get(room.code), date, operationId, entries }); count('attendance days (classroom)');
      }
    }
  });
  await step('exams and results', async () => {
    const subjects = new Map<string, string>(), types = new Map<string, string>();
    for (const [table, names, map] of [['subjects', ['Arabic', 'English', 'Mathematics', 'Discovery & science'], subjects], ['exam_types', ['Weekly quiz', 'Monthly assessment'], types]] as const) {
      for (const name of names) {
        const existing = await one<{ id: string }>(`select id from ${table} where name=$1`, [name]);
        map.set(name, existing?.id ?? (await app.exams.saveCatalog(admin, table, { name, enabled: true })).id); if (!existing) count('exam catalog items');
      }
    }
    const plan: { name: string; subject: string; type: string; dayIndex: number; format: 'NUMERIC' | 'LABEL'; max?: number; labels?: string[] }[] = [
      { name: 'Arabic letters أ–خ', subject: 'Arabic', type: 'Weekly quiz', dayIndex: 2, format: 'NUMERIC', max: 10 },
      { name: 'Counting 1–10', subject: 'Mathematics', type: 'Weekly quiz', dayIndex: 7, format: 'NUMERIC', max: 20 },
      { name: 'English phonics – first sounds', subject: 'English', type: 'Monthly assessment', dayIndex: 12, format: 'LABEL', labels: ['Excellent', 'Very good', 'Good', 'Needs practice'] }
    ];
    for (const room of CLASSROOMS.filter((c) => c.ageGroup === 'DEMO-KG')) {
      for (const exam of plan) {
        const date = days[exam.dayIndex]; if (!date) continue;
        const roster = rosterOf(room.code, date); if (!roster.length) continue;
        const existing = await one<{ id: string }>('select id from exams where classroom_id=$1 and assessed_on=$2 and name=$3', [classroomIds.get(room.code), date, exam.name]);
        const examId = existing?.id ?? (await app.exams.create(teacherOf(room.code), { name: exam.name, subjectId: subjects.get(exam.subject), typeId: types.get(exam.type), classroomId: classroomIds.get(room.code), assessedOn: date, gradeFormat: exam.format, maximumMarks: exam.max ?? null, decimalAllowed: false, labelOptions: exam.labels ?? null, operationId: demoId(`exam/${room.code}/${exam.name}`) })).id;
        if (!existing) count('exams');
        const resultsOperation = demoId(`exam-results/${room.code}/${exam.name}`);
        if (await one('select 1 from learning_operations where operation_id=$1', [resultsOperation])) continue;
        const entries = roster.map((c) => {
          const absent = pick(`${c.code}/${date}`, 100) < 8;
          if (absent) return { childId: c.id, outcome: 'CHILD_ABSENT' as const, score: null, label: null, comment: null, expectedVersion: 0 };
          const quality = pick(`exam/${c.code}/${exam.name}`, 100);
          return exam.format === 'NUMERIC'
            ? { childId: c.id, outcome: 'RESULT' as const, score: Math.max(2, Math.round(exam.max! * (0.55 + quality / 220))), label: null, comment: quality > 85 ? 'Excellent focus today.' : quality < 20 ? 'Needs more practice at home.' : null, expectedVersion: 0 }
            : { childId: c.id, outcome: 'RESULT' as const, score: null, label: exam.labels![Math.min(3, Math.floor(quality / 25))], comment: null, expectedVersion: 0 };
        });
        await app.exams.publishResults(teacherOf(room.code), { examId, operationId: resultsOperation, entries }); count('exam result publications');
      }
    }
  });
  await step('homework and outcomes', async () => {
    const plan = [
      { title: 'Trace the letter أ', instructions: 'Trace the letter أ three times on the worksheet and colour the apple (تفاحة).', assigned: days[1], due: days[3] },
      { title: 'Count the animals', instructions: 'Count the animals on each card and circle the correct number (1–10).', assigned: days[6], due: days[8] },
      { title: 'My family drawing', instructions: 'Draw your family and tell us their names in class on the due day.', assigned: days[11], due: days[13] },
      { title: 'Shapes hunt at home', instructions: 'Find three round things and two square things at home; bring a photo or a drawing.', assigned: days[days.length - 1], due: addIsoDays(today, 3) }
    ];
    for (const room of CLASSROOMS.filter((c) => c.ageGroup === 'DEMO-KG')) {
      for (const hw of plan) {
        if (!hw.assigned || !hw.due) continue;
        const roster = rosterOf(room.code, hw.assigned); if (!roster.length) continue;
        const existing = await one<{ id: string }>('select a.id from homework_assignments a join homework_versions v on v.assignment_id=a.id and v.revision=1 where a.classroom_id=$1 and a.assigned_on=$2 and v.title=$3', [classroomIds.get(room.code), hw.assigned, hw.title]);
        const assignmentId = existing?.id ?? (await app.homework.publish(teacherOf(room.code), { classroomId: classroomIds.get(room.code), title: hw.title, instructions: hw.instructions, assignedOn: hw.assigned, dueOn: hw.due, childIds: roster.map((c) => c.id), operationId: demoId(`homework/${room.code}/${hw.title}`) })).id;
        if (!existing) count('homework assignments');
        if (hw.due > today) continue;
        const operationId = demoId(`homework-outcomes/${room.code}/${hw.title}`);
        if (await one('select 1 from learning_operations where operation_id=$1', [operationId])) continue;
        const entries = roster.map((c) => { const r = pick(`hw/${c.code}/${hw.title}`, 100); return { childId: c.id, statusId: r < 70 ? HW.COMPLETED : r < 90 ? HW.NOT_COMPLETED : HW.EXCUSED, note: r < 70 && r % 7 === 0 ? 'Beautiful work!' : null, expectedVersion: 0 }; });
        await app.homework.publishOutcomes(teacherOf(room.code), { assignmentId, date: hw.due, operationId, entries }); count('homework outcome publications');
      }
    }
  });

  // ---- Lifecycle changes after the learning history exists -----------------------------------
  await step('child lifecycle (pause, archive)', async () => {
    for (const [code, status, reason, publicMessage] of [[PAUSED_CHILD, 'PAUSED', 'Family travelling abroad for a month', 'Mazen is on a family trip until next month; his place is kept.'], [ARCHIVED_CHILD, 'ARCHIVED', 'Moved to primary school', null]] as const) {
      const child = await one<{ version: number; status: string }>('select version,status from children where id=$1', [childByCode(code).id]);
      if (child!.status === status) continue;
      await app.children.lifecycle(admin, childByCode(code).id, { expectedVersion: child!.version, status, reason, publicMessage }); count('lifecycle changes');
    }
    await refreshCurrent();
  });

  // ---- Finance: tuition history, agreements, extra fees, collections ---------------------------
  const tuitionOf = (c: ChildRow) => roomOf(c.room).tuition;
  const installmentOf = async (childId: string, sourceReference: string) => (await one<{ id: string; remaining: string }>('select i.id,i.remaining::text from installment_balances i join obligations o on o.id=i.obligation_id where o.child_id=$1 and o.source_reference=$2 order by i.position limit 1', [childId, sourceReference]))!;
  const receiptFor = async (key: string, collectedOn: string, child: ChildRow, allocations: { installmentId: string; amount: string }[], method: 'CASH' | 'BANK' | 'WALLET') => {
    const operationId = demoId(`receipt/${key}`); if (await one('select 1 from financial_operations where operation_id=$1', [operationId])) return;
    const branch = branchNow(child); const amount = allocations.reduce((s, a) => s + BigInt(a.amount), 0n).toString(); const account = method === 'CASH' ? cashOf(branch) : method === 'BANK' ? bankOf(branch) : walletOf(branch);
    const externalReference = method === 'CASH' ? '' : method === 'BANK' ? `InstaPay ${pick(key, 9_000_000) + 1_000_000}` : `VF-Cash ${pick(key, 900_000) + 100_000}`;
    await app.payments.collect(accountant, { operationId, collectedOn, payerName: payerOf(child).name, externalReference, groups: [{ branchId: branchIds.get(branch), accountId: account, method, amount, allocations }] }); count('receipts');
  };
  const methodFor = (key: string): 'CASH' | 'BANK' | 'WALLET' => (['CASH', 'CASH', 'BANK', 'BANK', 'WALLET'] as const)[pick(`method/${key}`, 5)];
  await step('tuition obligations for the two previous months', async () => {
    for (const child of children) {
      for (const month of [m2, m1]) {
        if (child.enrolledOn > monthlyDue(month, 31)) continue;
        const sourceReference = `demo/tuition/${month.slice(0, 7)}/${child.code}`;
        if (!(await one('select 1 from obligations where child_id=$1 and source_reference=$2', [child.id, sourceReference]))) {
          await app.ledger.createObligation(accountant, { operationId: demoId(`obligation/${sourceReference}`), childId: child.id, categoryId: feeIds.get('DEMO-TUITION'), amount: egp(tuitionOf(child)), description: `Tuition ${monthName(month)}`, sourceReference, issuedOn: month, serviceFrom: month, serviceUntil: monthlyDue(month, 31), installments: [{ dueOn: monthlyDue(month, 5), amount: egp(tuitionOf(child)) }] }); count('tuition obligations (history)');
        }
        const due = await installmentOf(child.id, sourceReference); const roll = pick(`pay/${sourceReference}`, 100);
        if (month === m2 || roll < 65) await receiptFor(sourceReference, addIsoDays(month, 2 + pick(`day/${sourceReference}`, 9)), child, [{ installmentId: due.id, amount: egp(tuitionOf(child)) }], methodFor(sourceReference));
        else if (roll < 85) await receiptFor(`${sourceReference}/partial`, addIsoDays(month, 6 + pick(`day/${sourceReference}`, 12)), child, [{ installmentId: due.id, amount: egp(Math.round(tuitionOf(child) / 2)) }], methodFor(sourceReference));
      }
    }
  });
  await step('registration and uniform fees', async () => {
    for (const child of children) {
      if (child.enrolledOn >= addIsoDays(m2, -10)) {
        const sourceReference = `demo/registration/${child.code}`;
        if (!(await one('select 1 from obligations where child_id=$1 and source_reference=$2', [child.id, sourceReference]))) {
          await app.ledger.createObligation(accountant, { operationId: demoId(`obligation/${sourceReference}`), childId: child.id, categoryId: feeIds.get('DEMO-REG'), amount: egp(1500), description: 'Registration fee', sourceReference, issuedOn: child.enrolledOn, serviceFrom: null, serviceUntil: null, installments: [{ dueOn: child.enrolledOn, amount: egp(1500) }] }); count('registration fees');
        }
        await receiptFor(sourceReference, child.enrolledOn, child, [{ installmentId: (await installmentOf(child.id, sourceReference)).id, amount: egp(1500) }], 'CASH');
      }
      if (roomOf(child.room).ageGroup === 'DEMO-KG' && child.enrolledOn <= m2) {
        const sourceReference = `demo/uniform/${child.code}`;
        if (!(await one('select 1 from obligations where child_id=$1 and source_reference=$2', [child.id, sourceReference]))) {
          await app.ledger.createObligation(accountant, { operationId: demoId(`obligation/${sourceReference}`), childId: child.id, categoryId: feeIds.get('DEMO-UNIFORM'), amount: egp(850), description: 'Uniform & books – new year', sourceReference, issuedOn: m2, serviceFrom: null, serviceUntil: null, installments: [{ dueOn: addIsoDays(m2, 14), amount: egp(500) }, { dueOn: addIsoDays(m1, 14), amount: egp(350) }] }); count('uniform fees');
        }
        const installments = await q<{ id: string; position: number }>('select i.id,i.position from installments i join obligations o on o.id=i.obligation_id where o.child_id=$1 and o.source_reference=$2 order by i.position', [child.id, sourceReference]);
        const roll = pick(`uniform/${child.code}`, 100);
        if (roll < 80) await receiptFor(`${sourceReference}/1`, addIsoDays(m2, 10), child, [{ installmentId: installments[0].id, amount: egp(500) }], 'CASH');
        if (roll < 45) await receiptFor(`${sourceReference}/2`, addIsoDays(m1, 12), child, [{ installmentId: installments[1].id, amount: egp(350) }], 'CASH');
      }
    }
  });
  await step('monthly billing agreements from the current month', async () => {
    for (const family of FAMILIES) {
      const members = family.children.map((s) => childByCode(s.code)).filter((c) => current.get(c.id)!.status !== 'ARCHIVED');
      if (!members.length) continue;
      const normal = members.reduce((s, c) => s + tuitionOf(c), 0), agreed = Math.round(normal * (1 - (family.discount ?? 0)));
      const terms = { mode: 'MONTHLY' as const, categoryId: feeIds.get('DEMO-TUITION')!, description: `Monthly tuition – ${family.guardians[0].name.split(' ').slice(-1)[0]} family`, childIds: members.map((c) => c.id).sort(), normalAmount: egp(normal), agreedAmount: egp(agreed), startsOn: m0, endsOn: null, firstAgreedAmount: null, firstPeriod: m0, dueDay: 5, installments: [], serviceFrom: null, serviceUntil: null };
      const existing = await one<{ id: string; version: number; status: string }>("select id,version,status from billing_agreements where terms->>'description'=$1", [terms.description]);
      let agreement = existing ?? null;
      if (!agreement) { const draft = await app.billing.draft(accountant, { operationId: demoId(`agreement/${family.key}`), terms }); agreement = { id: draft.id, version: draft.version, status: 'DRAFT' }; count('billing agreements'); }
      if (agreement.status === 'DRAFT') { await app.billing.approve(accountant, agreement.id, { operationId: demoId(`agreement-approve/${family.key}`), expectedVersion: agreement.version }); agreement.version++; }
      if (members.some((c) => c.code === PAUSED_CHILD) && !(await one('select 1 from billing_pauses where agreement_id=$1', [agreement.id]))) {
        await app.billing.pause(accountant, agreement.id, { operationId: demoId(`agreement-pause/${family.key}`), expectedVersion: agreement.version, from: nextMonth(m0), until: nextMonth(m0), reason: 'Child paused while the family is abroad' }); count('billing pauses');
      }
    }
    // Current-month installments are issued today; some families have already paid this month.
    for (const child of children) {
      if (current.get(child.id)!.status === 'ARCHIVED') continue;
      const due = await one<{ id: string; remaining: string }>(`select i.id,i.remaining::text from installment_balances i join obligations o on o.id=i.obligation_id join recurrence_occurrences r on r.obligation_id=o.id where o.child_id=$1 and r.service_period_start=$2`, [child.id, m0]);
      if (!due || BigInt(due.remaining) <= 0n) continue;
      if (pick(`pay-current/${child.code}`, 100) < 30) await receiptFor(`tuition-current/${child.code}`, today, child, [{ installmentId: due.id, amount: due.remaining }], methodFor(`current/${child.code}`));
    }
  });
  await step('credit receipt and credit application', async () => {
    const child = childByCode('DEMO-C015'); const operationId = demoId('credit/farag');
    let credit = await one<{ id: string; remaining: string; created_on: string }>('select c.id,b.remaining::text,c.created_on::text from credits c join credit_balances b on b.id=c.id where c.child_id=$1 and c.reason=$2', [child.id, 'Advance payment towards next tuition (demo)']);
    if (!credit) {
      const result = await app.payments.receiveCredit(accountant, { operationId, childId: child.id, accountId: bankOf(branchNow(child)), method: 'BANK', amount: egp(1000), collectedOn: addIsoDays(m1, 19), payerName: payerOf(child).name, externalReference: 'InstaPay 5521907', reason: 'Advance payment towards next tuition (demo)', confirmedCredit: true }); count('credit receipts');
      credit = { id: result.creditId, remaining: egp(1000), created_on: addIsoDays(m1, 19) };
    }
    const due = await one<{ id: string; remaining: string }>('select i.id,i.remaining::text from installment_balances i join obligations o on o.id=i.obligation_id join recurrence_occurrences r on r.obligation_id=o.id where o.child_id=$1 and r.service_period_start=$2', [child.id, m0]);
    if (due && BigInt(credit.remaining) > 0n && BigInt(due.remaining) > 0n && !(await one('select 1 from financial_operations where operation_id=$1', [demoId('credit-apply/farag')]))) {
      const amount = (BigInt(credit.remaining) < BigInt(due.remaining) ? BigInt(credit.remaining) : BigInt(due.remaining)).toString();
      await app.payments.applyCredit(accountant, { operationId: demoId('credit-apply/farag'), creditId: credit.id, appliedOn: today, allocations: [{ installmentId: due.id, amount }] }); count('credit applications');
    }
  });

  // ---- Transport and activities ---------------------------------------------------------------
  await step('bus subscriptions and activities', async () => {
    const periodStart = m0, periodEnd = monthlyDue(nextMonth(nextMonth(nextMonth(nextMonth(m0)))), 31);
    for (const child of children.filter((c) => c.spec.bus && current.get(c.id)!.status === 'ACTIVE')) {
      let subscription = await one<{ id: string; version: number; administrative_permission: boolean; installment_id: string }>('select id,version,administrative_permission,installment_id from bus_subscriptions where child_id=$1 and period_start=$2 and period_end=$3', [child.id, periodStart, periodEnd]);
      if (!subscription) {
        const result = await app.transport.subscribe(managerOf(branchNow(child)), { operationId: demoId(`bus/${child.code}`), childId: child.id, categoryId: feeIds.get('DEMO-BUS'), periodStart, periodEnd, amount: egp(3500), dueOn: monthlyDue(m0, 25), administrativePermission: true }); count('bus subscriptions');
        subscription = { id: result.id, version: 1, administrative_permission: true, installment_id: result.installmentId };
      }
      if (pick(`bus-pay/${child.code}`, 100) < 55) await receiptFor(`bus/${child.code}`, today, child, [{ installmentId: subscription.installment_id, amount: (await one<{ remaining: string }>('select remaining::text from installment_balances where id=$1', [subscription.installment_id]))!.remaining }], 'BANK');
      if (child.code === 'DEMO-C018' && subscription.administrative_permission) {
        await app.transport.permission(managerOf(branchNow(child)), subscription.id, { operationId: demoId(`bus-permission/${child.code}`), expectedVersion: subscription.version, enabled: false, reason: 'Family moved; the bus route no longer covers their street' }); count('bus permission changes');
      }
    }
    const activities = [
      { key: 'zoo', branch: 'DEMO-MAADI', title: 'Trip to Giza Zoo', details: 'A morning at the zoo with a picnic lunch. Bus leaves at 8:30 and returns by 14:00. Please send a hat and a water bottle.', eventDate: addIsoDays(today, 19), dueOn: addIsoDays(today, 12), fee: 250, rooms: ['DEMO-M-SUN', 'DEMO-M-BUT'] },
      { key: 'funday', branch: 'DEMO-NASR', title: 'Fun day at the nursery', details: 'Bouncy castle, face painting and games in the garden. Free for all children.', eventDate: addIsoDays(today, 9), dueOn: addIsoDays(today, 9), fee: 0, rooms: ['DEMO-N-RAIN', 'DEMO-N-BEE'] },
      { key: 'planetarium', branch: 'DEMO-NASR', title: 'Visit to the Planetarium Science Center', details: 'Kids show about the planets followed by a hands-on workshop.', eventDate: addIsoDays(today, 33), dueOn: addIsoDays(today, 26), fee: 180, rooms: ['DEMO-N-RAIN'] }
    ];
    for (const a of activities) {
      // An existing activity keeps its invited list; only a new one is built from the current rosters.
      let participants = children.filter((c) => a.rooms.includes(current.get(c.id)!.room ?? '') && current.get(c.id)!.status === 'ACTIVE');
      let activityId = (await one<{ id: string }>('select id from activities where branch_id=$1 and title=$2 and event_date=$3', [branchIds.get(a.branch), a.title, a.eventDate]))?.id;
      if (!activityId) { activityId = (await app.transport.createActivity(managerOf(a.branch), { operationId: demoId(`activity/${a.key}`), branchId: branchIds.get(a.branch), categoryId: feeIds.get('DEMO-TRIP'), title: a.title, details: a.details, eventDate: a.eventDate, fee: egp(a.fee), dueOn: a.dueOn, childIds: participants.map((c) => c.id) })).id; count('activities'); }
      else { const invited = new Set((await q<{ child_id: string }>('select child_id from activity_children where activity_id=$1', [activityId])).map((r) => r.child_id)); participants = children.filter((c) => invited.has(c.id) && current.get(c.id)!.status === 'ACTIVE'); }
      for (const child of participants) {
        const roll = pick(`consent/${a.key}/${child.code}`, 100); if (roll >= 60) continue;
        const operationId = demoId(`consent/${a.key}/${child.code}`); if (await one('select 1 from financial_operations where operation_id=$1', [operationId])) continue;
        await app.transport.consent(managerOf(a.branch), activityId, child.id, { operationId, consented: roll < 50, reason: roll < 50 ? 'Consent form signed at the front desk' : 'Parent declined: child gets car sick' }); count('activity consents');
        if (a.fee > 0 && roll < 40) { const item = await one<{ installment_id: string; remaining: string }>('select ac.installment_id,b.remaining::text from activity_children ac join installment_balances b on b.id=ac.installment_id where ac.activity_id=$1 and ac.child_id=$2', [activityId, child.id]); if (item && BigInt(item.remaining) > 0n) await receiptFor(`activity/${a.key}/${child.code}`, today, child, [{ installmentId: item.installment_id, amount: item.remaining }], 'CASH'); }
      }
    }
  });

  // ---- Spending, transfers, payroll, cash closings ------------------------------------------
  await step('expenses, approvals, payments and transfers', async () => {
    type Exp = { key: string; branch: string; classroom?: string; category: string; amount: number; dueOn: string; note: string; pay?: { on: string; method: 'CASH' | 'BANK' | 'WALLET' }; approve?: boolean; cancel?: boolean };
    const expenses: Exp[] = [];
    for (const [branch, rent, utilities] of [['DEMO-MAADI', 45000, 3200], ['DEMO-NASR', 25000, 2100]] as const) {
      for (const month of [m2, m1, m0]) {
        const short = month.slice(0, 7);
        expenses.push({ key: `rent/${branch}/${short}`, branch, category: 'DEMO-RENT', amount: rent, dueOn: month, note: `Rent ${monthName(month)}`, pay: { on: addIsoDays(month, 1), method: 'BANK' } });
        expenses.push({ key: `util/${branch}/${short}`, branch, category: 'DEMO-UTIL', amount: utilities, dueOn: addIsoDays(month, 9), note: `Electricity, water and internet – ${monthName(month)}`, pay: month === m0 && addIsoDays(month, 11) > today ? undefined : { on: addIsoDays(month, 11), method: 'CASH' } });
        expenses.push({ key: `food1/${branch}/${short}`, branch, category: 'DEMO-FOOD', amount: branch === 'DEMO-MAADI' ? 1800 : 1200, dueOn: addIsoDays(month, 3), note: 'Weekly groceries – Metro market', pay: { on: addIsoDays(month, 3), method: 'CASH' } });
        if (month !== m0 || addIsoDays(month, 17) <= today) expenses.push({ key: `food2/${branch}/${short}`, branch, category: 'DEMO-FOOD', amount: branch === 'DEMO-MAADI' ? 1650 : 1100, dueOn: addIsoDays(month, 17), note: 'Weekly groceries – Metro market', pay: { on: addIsoDays(month, 17), method: 'CASH' } });
      }
    }
    expenses.push({ key: 'supplies/sun', branch: 'DEMO-MAADI', classroom: 'DEMO-M-SUN', category: 'DEMO-SUPPLIES', amount: 650, dueOn: addIsoDays(m1, 8), note: 'Crayons, paper and glue for Sunflowers', pay: { on: addIsoDays(m1, 8), method: 'CASH' } });
    expenses.push({ key: 'supplies/bee', branch: 'DEMO-NASR', classroom: 'DEMO-N-BEE', category: 'DEMO-SUPPLIES', amount: 420, dueOn: addIsoDays(today, 4), note: 'Sensory play materials for Busy Bees' });
    expenses.push({ key: 'fuel/m1', branch: 'DEMO-MAADI', category: 'DEMO-FUEL', amount: 1200, dueOn: addIsoDays(m1, 14), note: 'Diesel for the school bus', pay: { on: addIsoDays(m1, 14), method: 'CASH' } });
    expenses.push({ key: 'fuel/m0', branch: 'DEMO-MAADI', category: 'DEMO-FUEL', amount: 1250, dueOn: addIsoDays(today, -2), note: 'Diesel for the school bus', pay: { on: addIsoDays(today, -2), method: 'WALLET' } });
    expenses.push({ key: 'maint/ac', branch: 'DEMO-MAADI', category: 'DEMO-MAINT', amount: 2750, dueOn: addIsoDays(today, 6), note: 'Air-conditioner repair – Butterflies room', approve: true });
    expenses.push({ key: 'maint/dup', branch: 'DEMO-NASR', category: 'DEMO-MAINT', amount: 900, dueOn: addIsoDays(today, -3), note: 'Plumber invoice (duplicate of last week)', cancel: true });
    for (const e of expenses) {
      if (e.pay && e.pay.on > today) e.pay = undefined;
      const operationId = demoId(`expense/${e.key}`);
      let expenseId = (await one<{ resources: unknown; result: { id: string } }>('select result from financial_operations where operation_id=$1', [operationId]))?.result.id;
      if (!expenseId) { expenseId = (await app.spending.create(accountant, { operationId, branchId: branchIds.get(e.branch), classroomId: e.classroom ? classroomIds.get(e.classroom) : null, categoryId: expenseCategoryIds.get(e.category), amount: egp(e.amount), dueOn: e.dueOn, note: e.note })).id; count('expenses'); }
      const state = (await one<{ state: string }>('select state from expense_states where id=$1', [expenseId]))!.state;
      if (e.approve && state === 'PENDING') await app.spending.act(accountant, expenseId, 'APPROVED', { operationId: demoId(`expense-approve/${e.key}`), reason: 'Quote reviewed and approved by the administrator' });
      if (e.cancel && state === 'PENDING') await app.spending.act(accountant, expenseId, 'CANCELLED', { operationId: demoId(`expense-cancel/${e.key}`), reason: 'Duplicate invoice; already paid last week' });
      if (e.pay && state === 'PENDING') { await app.spending.pay(accountant, expenseId, { operationId: demoId(`expense-pay/${e.key}`), accountId: e.pay.method === 'CASH' ? cashOf(e.branch) : e.pay.method === 'BANK' ? bankOf(e.branch) : walletOf(e.branch), method: e.pay.method, paidOn: e.pay.on, externalReference: e.pay.method === 'BANK' ? `TRF-${pick(e.key, 900000) + 100000}` : '', reason: 'Paid in full' }); count('expense payments'); }
    }
    for (const [branch, amount] of [['DEMO-MAADI', 8000], ['DEMO-NASR', 5000]] as const) {
      const operationId = demoId(`transfer/${branch}`); if (await one('select 1 from financial_operations where operation_id=$1', [operationId])) continue;
      await app.spending.transfer(accountant, { operationId, sourceAccountId: cashOf(branch), destinationAccountId: bankOf(branch), amount: egp(amount), effectiveOn: addIsoDays(m1, 19), reason: 'Cash deposited at the bank branch', externalReference: `DEP-${pick(branch, 90000) + 10000}` }); count('account transfers');
    }
  });
  await step('payroll periods, settlements, advances and adjustments', async () => {
    for (const e of EMPLOYEES) {
      const employeeId = employeeIds.get(e.code)!;
      for (const month of e.former ? [] : [m2, m1, m0]) {
        const short = month.slice(0, 7);
        let period = await one<{ id: string; remaining: string; settlement_id: string | null }>('select id,remaining::text,settlement_id from payroll_period_balances where employee_id=$1 and month=$2', [employeeId, month]);
        if (!period) { const result = await app.payroll.prepare(accountant, { operationId: demoId(`payroll/${e.code}/${short}`), employeeId, month: short }); period = { id: result.id, remaining: egp(e.salary), settlement_id: null }; count('payroll periods'); }
        if (month === m0 && !period.settlement_id) {
          if (e.code === 'DEMO-E009' && !(await one('select 1 from payroll_advances where period_id=$1', [period.id]))) { const paidOn = addIsoDays(today, -5) < m0 ? m0 : addIsoDays(today, -5); await app.payroll.advance(accountant, period.id, { operationId: demoId(`payroll-advance/${e.code}/${short}`), amount: egp(1500), paidOn, reason: 'Advance requested for school supplies for his children', externalReference: '' }); count('payroll advances'); }
          if (e.code === 'DEMO-E004' && !(await one('select 1 from payroll_adjustments where period_id=$1', [period.id]))) { await app.payroll.adjust(accountant, period.id, { operationId: demoId(`payroll-adjust/${e.code}/${short}`), kind: 'ADDITION', amount: egp(500), reason: 'Overtime: two Saturday open days' }); count('payroll adjustments'); }
          if (e.code === 'DEMO-E011' && !(await one('select 1 from payroll_adjustments where period_id=$1', [period.id]))) { await app.payroll.adjust(accountant, period.id, { operationId: demoId(`payroll-adjust/${e.code}/${short}`), kind: 'DEDUCTION', amount: egp(200), reason: 'Two unexcused late arrivals' }); count('payroll adjustments'); }
          continue;
        }
        if (!period.settlement_id) {
          const remaining = (await one<{ remaining: string }>('select remaining::text from payroll_period_balances where id=$1', [period.id]))!.remaining;
          await app.payroll.settle(accountant, period.id, { operationId: demoId(`payroll-settle/${e.code}/${short}`), amount: remaining, settledOn: monthlyDue(month, 27), reason: `Salary ${monthName(month)}`, externalReference: `PAY-${short}-${e.code.slice(-3)}` }); count('payroll settlements');
        }
      }
    }
  });
  await step('cash drawer closings', async () => {
    for (const branch of ['DEMO-MAADI', 'DEMO-NASR']) {
      for (const [on, shortBy] of [[addIsoDays(m1, 14), 0], [addIsoDays(m1, 27), branch === 'DEMO-MAADI' ? 50 : 0]] as const) {
        if (await one('select 1 from daily_closings where account_id=$1 and business_date=$2', [cashOf(branch), on])) continue;
        const expected = (await one<{ amount: string }>('select treasury_balance_on($1,$2)::text as amount', [cashOf(branch), on]))!.amount;
        await app.closing.count(accountant, { operationId: demoId(`closing/${branch}/${on}`), accountId: cashOf(branch), on, countedAmount: (BigInt(expected) - BigInt(egp(shortBy))).toString(), expectedRevision: 0, reason: shortBy ? 'End-of-day count; 50 EGP short, under investigation' : 'End-of-day count matches the drawer' }); count('cash closings');
      }
    }
  });
  await step('overdue fee reminders', async () => { const result = await runReminderBatch(db); if (result.notices) created.set('overdue reminders', result.notices); });
  await step('child branch transfer (effective today)', async () => {
    const child = childByCode(TRANSFERRED_CHILD); const row = (await one<{ version: number; branch_id: string }>('select version,branch_id from children where id=$1', [child.id]))!;
    if (row.branch_id !== branchIds.get('DEMO-MAADI')) return;
    await app.childTransfers.transfer(admin, { operationId: demoId(`transfer/${child.code}`), childId: child.id, sourceBranchId: branchIds.get('DEMO-MAADI'), destinationBranchId: branchIds.get('DEMO-NASR'), destinationClassroomId: classroomIds.get('DEMO-N-RAIN'), effectiveOn: today, expectedVersion: row.version, reason: 'Family moved to Nasr City; outstanding balance follows the child' }); count('child branch transfers');
    await refreshCurrent();
  });

  // ---- Communication ------------------------------------------------------------------------------
  const announcementIds = new Map<string, string>();
  await step('announcements and holidays', async () => {
    const items: { key: string; token: string; title: string; body: string; target: Record<string, unknown>; ack: boolean; holiday?: { from: string; until: string } }[] = [
      { key: 'welcome', token: sys, title: 'Welcome back to a new year! 🌻', body: 'Dear parents, we are delighted to welcome your children back. Doors open at 7:30 and the day ends at 15:00. Please label all bags, bottles and jackets with your child’s name. Kindly acknowledge this notice.', target: { kind: 'NURSERY' }, ack: true },
      { key: 'holiday', token: sys, title: 'Nursery closed – Armed Forces Day', body: `The nursery will be closed on ${addIsoDays(today, 17).split('-').reverse().join('/')} for the national holiday. We reopen the next working day.`, target: { kind: 'NURSERY' }, ack: false, holiday: { from: addIsoDays(today, 17), until: addIsoDays(today, 17) } },
      { key: 'parking', token: managerOf('DEMO-MAADI'), title: 'Parking during pickup', body: 'Please do not double-park on Street 9 during pickup. Use the side street and walk in; it keeps the entrance safe for the children.', target: { kind: 'BRANCH', id: branchIds.get('DEMO-MAADI') }, ack: false },
      { key: 'water', token: managerOf('DEMO-NASR'), title: 'Water outage on Thursday', body: 'The district announced a water cut on Thursday morning. We have tanks, but please send an extra water bottle.', target: { kind: 'BRANCH', id: branchIds.get('DEMO-NASR') }, ack: true },
      { key: 'showtell', token: teacherOf('DEMO-M-SUN'), title: 'Show and tell – Thursday', body: 'Sunflowers: bring one favourite toy on Thursday to show the class and tell us why you love it.', target: { kind: 'CLASSROOM', id: classroomIds.get('DEMO-M-SUN') }, ack: false },
      { key: 'fees', token: managerOf('DEMO-NASR'), title: 'Fee reminder', body: 'A friendly reminder that this month’s tuition is due. You can pay by cash at the front desk or by InstaPay; a receipt will appear in the app.', target: { kind: 'PARENTS', ids: [guardianIds.get('demo.parent.ramy'), guardianIds.get('demo.parent.bassem')] }, ack: false }
    ];
    for (const a of items) {
      const existing = await one<{ id: string }>('select id from announcements where title=$1', [a.title]);
      announcementIds.set(a.key, existing?.id ?? (await app.communication.publish(a.token, { operationId: demoId(`announcement/${a.key}`), title: a.title, body: a.body, target: a.target, acknowledgmentRequired: a.ack, holiday: a.holiday ?? null })).id); if (!existing) count('announcements');
    }
  });
  await step('parent activity (planned absences, pickup requests, reads, acknowledgments)', async () => {
    const parents: [string, string, () => Promise<void>][] = [
      ['demo.parent.ahmed', 'DEMO-C001', async () => {
        const token = await sessionFor('demo.parent.ahmed'); const child = childByCode('DEMO-C001');
        if (!(await one('select 1 from attendance_planned_absences where guardian_id=$1 and child_id=$2 and business_date=$3', [guardianIds.get('demo.parent.ahmed'), child.id, addIsoDays(today, 1)]))) { await app.attendance.plannedAbsence(token, { childId: child.id, from: addIsoDays(today, 1), until: addIsoDays(today, 3), reason: 'Travelling to Alexandria for a family wedding' }); count('planned absences'); }
        const notifications = await app.communication.notifications(token, {});
        for (const n of notifications.items.slice(0, 3)) if (!n.read) await app.communication.setRead(token, n.id, true);
        if (announcementIds.get('welcome')) await app.communication.acknowledge(token, announcementIds.get('welcome')!);
      }],
      ['demo.parent.islam', 'DEMO-C015', async () => {
        const token = await sessionFor('demo.parent.islam'); const child = childByCode('DEMO-C016');
        if (!(await one('select 1 from pickup_authorizations where child_id=$1 and full_name=$2', [child.id, 'Mostafa Farag']))) { await app.safety.createAuthorization(token, child.id, { fullName: 'Mostafa Farag', mobile: '01112220010', relationship: 'Uncle', validFrom: today, validUntil: addIsoDays(today, 14) }); count('pickup authorizations'); }
        await app.communication.notifications(token, {});
      }],
      ['demo.parent.khaled', 'DEMO-C004', async () => {
        const token = await sessionFor('demo.parent.khaled'); await app.communication.notifications(token, {});
        if (announcementIds.get('welcome')) await app.communication.acknowledge(token, announcementIds.get('welcome')!);
      }]
    ];
    for (const [, , work] of parents) await work();
  });
  await step('pickup records for today', async () => {
    const records: [string, string][] = [['DEMO-C001', 'demo.parent.rania'], ['DEMO-C003', 'demo.parent.mohamed'], ['DEMO-C017', 'demo.parent.ramy']];
    for (const [code, guardian] of records) {
      const child = childByCode(code); if (await one('select 1 from pickup_records where child_id=$1 and business_date=$2', [child.id, today])) continue;
      const room = (await one<{ room: string }>('select c.code as room from children ch join classrooms c on c.id=ch.classroom_id where ch.id=$1', [child.id]))!.room;
      await app.safety.recordPickup(teacherOf(room), child.id, { collector: { kind: 'GUARDIAN', accountId: guardianIds.get(guardian) }, callConfirmed: true, calledGuardianId: guardianIds.get(guardian), note: null }); count('pickup records');
    }
  });
  await step('report export requests (rendered by the worker)', async () => {
    for (const [token, kind] of [[accountant, 'OUTSTANDING'], [accountant, 'CASH_RESULT'], [managerOf('DEMO-MAADI'), 'ATTENDANCE']] as const) {
      const operationId = demoId(`report/${kind}`); if (await one('select 1 from report_exports where operation_id=$1', [operationId])) continue;
      await app.reports.createExport(token, { kind, from: m2, to: today, format: 'PDF', operationId, locale: 'en' }); count('report exports');
    }
  });
  await step('blocked parent account', async () => {
    const id = guardianIds.get(BLOCKED_PARENT)!; const status = (await one<{ status: string }>('select status from accounts where id=$1', [id]))!.status;
    if (status !== 'ACTIVE') return;
    await app.licensing.blockAccount(sys, id, { reason: 'Repeated attempts to collect the child with an unauthorized person (demo)', publicMessage: 'Your account is temporarily blocked. Please contact the nursery office.', untilDate: addIsoDays(today, 14) }); count('blocked parents');
  });

  // ---- Wrap up ---------------------------------------------------------------------------------
  await db.pool.query('update sessions set revoked_at=now() where token_hash=any($1::text[]) and revoked_at is null', [issuedTokens.map(tokenHash)]);
  const lines = [
    'Nursery demo seed – LOCAL credentials (fictional data; never use outside a local development database)', `Seeded on ${today} against ${databaseHost}`, '',
    `Superadmin: ${system.username_normalized} (password unchanged by this seed)`, '',
    `Staff password: ${STAFF_PASSWORD}`, ...EMPLOYEES.filter((e) => e.username).map((e) => `  ${e.username!.padEnd(24)} ${e.name}${e.former ? ' (deactivated)' : ''} – ${e.role}`), '',
    `Parent password: ${PARENT_PASSWORD}`, ...FAMILIES.flatMap((f) => f.guardians.map((g) => `  ${g.username.padEnd(24)} ${g.name} (${g.relationship}${g.username === BLOCKED_PARENT ? ', blocked' : ''}) – ${f.children.map((c) => c.name.split(' ')[0]).join(', ')}`)), ''
  ];
  await mkdir(resolve('output'), { recursive: true }); await writeFile(resolve('output/demo-seed-credentials.txt'), `${lines.join('\n')}\n`, 'utf8');
  log(''); log(created.size ? 'Created this run:' : 'Nothing new to create; the demo data already exists.');
  for (const [what, n] of [...created.entries()].sort()) log(`  ${String(n).padStart(5)}  ${what}`);
  log(''); log(`Credentials written to output/demo-seed-credentials.txt (git-ignored).`);
  log(`Staff password: ${STAFF_PASSWORD} · Parent password: ${PARENT_PASSWORD} · e.g. demo.admin, demo.teacher.nour, demo.accountant, demo.parent.ahmed`);
} catch (error) {
  process.stderr.write(`[DEMO SEED] Failed during "${currentStep}": ${describe(error)}\n`);
  if (!(error instanceof SafeError) && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  await db.pool.query('update sessions set revoked_at=now() where token_hash=any($1::text[]) and revoked_at is null', [issuedTokens.map(tokenHash)]).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await app.close();
}
