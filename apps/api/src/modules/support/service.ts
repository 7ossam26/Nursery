import { randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { schemaStatus } from '@nursery/db';
import {
  backupRequestSchema, restoreValidationRequestSchema, supportAuditQuerySchema, supportAccountQuerySchema,
  type BackupRunSummary, type ChildDependents, type RestoreValidationSummary, type SupportAccount, type SupportAuditEvent, type SupportQueueState, type SupportStatus
} from '@nursery/contracts';
import type { AppConfig } from '../../config.js';
import { SafeError } from '../../errors.js';
import { verifyPassword } from '../auth/crypto.js';
import type { LicensingService } from '../licensing/service.js';
import { denied, requireCapability, type Policy } from '../organization/policy.js';
import { offsiteDirectory } from './backup.js';

const invalidCredentials = () => new SafeError('INVALID_CREDENTIALS', 'auth.invalidCredentials', false, 401);
type RunRow = { id: string; kind: BackupRunSummary['kind']; status: BackupRunSummary['status']; requested_at: Date; started_at: Date | null; finished_at: Date | null; requested_by: string | null; reason: string | null; release_version: string | null; schema_version: string | null; archive_name: string | null; archive_bytes: string | null; archive_sha256: string | null; manifest: { counts?: { files?: number } } | null; offsite_copied_at: Date | null; archive_deleted_at: Date | null; error_code: string | null };
const iso = (value: Date | null) => (value ? value.toISOString() : null);
const runSummary = (r: RunRow): BackupRunSummary => ({ id: r.id, kind: r.kind, status: r.status, requestedAt: r.requested_at.toISOString(), startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), requestedBy: r.requested_by, reason: r.reason, releaseVersion: r.release_version, schemaVersion: r.schema_version, archiveName: r.archive_name, archiveBytes: r.archive_bytes === null ? null : Number(r.archive_bytes), archiveSha256: r.archive_sha256, fileCount: r.manifest?.counts?.files ?? null, offsiteCopiedAt: iso(r.offsite_copied_at), archiveDeletedAt: iso(r.archive_deleted_at), errorCode: r.error_code });
const RUN_COLUMNS = 'id,kind,status,requested_at,started_at,finished_at,requested_by,reason,release_version,schema_version,archive_name,archive_bytes,archive_sha256,manifest,offsite_copied_at,archive_deleted_at,error_code';

// Every read and action runs inside the licensing policy transaction (session, license and capability re-checked) and
// is written to support_audit_events. Details never carry passwords, tokens, file contents or child data.
export class SupportService {
  constructor(readonly licensing: LicensingService, readonly config: AppConfig) {}
  private get database() { return this.licensing.auth.database; }
  private async audit(tx: Transaction, p: Policy, event: string, targetId: string | null, details: Record<string, unknown>) {
    await tx.query('insert into support_audit_events(id,actor_id,event,target_id,details) values($1,$2,$3,$4,$5)', [randomUUID(), p.account.id, event, targetId, JSON.stringify(details)]);
  }
  private async reauthenticate(tx: Transaction, p: Policy, operatorPassword: string) {
    const row = (await tx.query<{ password_hash: string }>('select password_hash from accounts where id=$1', [p.account.id])).rows[0];
    if (!row || !(await verifyPassword(operatorPassword, row.password_hash))) throw invalidCredentials();
  }
  private async usage(path: string | null) {
    if (!path) return null;
    try { const s = await statfs(path); return { totalBytes: Number(s.blocks) * Number(s.bsize), freeBytes: Number(s.bavail) * Number(s.bsize) }; } catch { return null; }
  }

  async status(token: string): Promise<SupportStatus> {
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      const schema = await schemaStatus(tx);
      const heartbeat = (await tx.query<{ last_seen_at: Date; release_version: string | null }>("select last_seen_at,release_version from worker_heartbeats where name='worker'")).rows[0] ?? null;
      const ageSeconds = heartbeat ? Math.round((Date.now() - heartbeat.last_seen_at.getTime()) / 1000) : null;
      const bossPresent = (await tx.query<{ ok: string | null }>("select to_regclass('pgboss.job')::text as ok")).rows[0].ok !== null;
      const queues: SupportQueueState[] = bossPresent ? (await tx.query<{ name: string; state: string; count: number; oldest: Date | null }>('select name,state,count(*)::int as count,min(created_on) as oldest from pgboss.job group by name,state order by name,state')).rows.map((r) => ({ name: r.name, state: r.state, count: r.count, oldestCreatedAt: iso(r.oldest) })) : [];
      const failedJobs24h = bossPresent ? (await tx.query<{ n: number }>("select count(*)::int as n from pgboss.job where state='failed' and completed_on>now()-interval '24 hours'")).rows[0].n : 0;
      const overdueJobs = bossPresent ? (await tx.query<{ n: number }>("select count(*)::int as n from pgboss.job where state in ('created','retry') and start_after<now()-interval '5 minutes'")).rows[0].n : 0;
      const billing = (await tx.query<{ occurrence: string | null; reminder: Date | null }>('select (select max(o.issued_on)::text from recurrence_occurrences r join obligations o on o.id=r.obligation_id) as occurrence,(select max(created_at) from finance_reminders) as reminder')).rows[0];
      const last = (await tx.query<RunRow>(`select ${RUN_COLUMNS} from backup_runs order by requested_at desc,id desc limit 1`)).rows[0] ?? null;
      const lastSuccess = (await tx.query<{ finished_at: Date }>("select finished_at from backup_runs where status='SUCCEEDED' order by finished_at desc limit 1")).rows[0]?.finished_at ?? null;
      const failedLast7Days = (await tx.query<{ n: number }>("select count(*)::int as n from backup_runs where status in ('FAILED','SKIPPED') and requested_at>now()-interval '7 days'")).rows[0].n;
      const backup = this.config.backup;
      await this.audit(tx, p, 'support.status_viewed', null, {});
      return {
        installation: { id: this.config.installationId, releaseVersion: this.config.releaseVersion ?? 'development', schemaVersion: schema.version, pendingMigrations: schema.pending.length, licenseStatus: p.licenseStatus, supportContact: this.config.supportContact, now: new Date().toISOString() },
        worker: { lastSeenAt: iso(heartbeat?.last_seen_at ?? null), releaseVersion: heartbeat?.release_version ?? null, ageSeconds, healthy: ageSeconds !== null && ageSeconds < 180 },
        queues, failedJobs24h, overdueJobs, billing: { lastOccurrenceAt: billing.occurrence, lastReminderAt: iso(billing.reminder) },
        backups: { configured: Boolean(backup?.backupDir && backup.encryptionKey), offsiteConfigured: Boolean(backup && offsiteDirectory(backup.target)), last: last ? runSummary(last) : null, lastSuccessfulAt: iso(lastSuccess), ageHours: lastSuccess ? Math.round((Date.now() - lastSuccess.getTime()) / 36_000) / 100 : null, failedLast7Days, restoreValidationConfigured: Boolean(backup?.restoreValidationDatabaseUrl && backup.restoreValidationFilesDir) },
        storage: { privateFiles: await this.usage(this.config.privateFilesDir), backups: await this.usage(backup?.backupDir ?? null) }
      };
    });
  }
  async audit_(token: string, raw: unknown): Promise<SupportAuditEvent[]> {
    const q = supportAuditQuerySchema.parse(raw);
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      const like = q.query ? `%${q.query.replace(/[%_\\]/g, '\\$&')}%` : null;
      const rows = (await tx.query<{ source: SupportAuditEvent['source']; event: string; actor_id: string | null; target_id: string | null; created_at: Date; details: Record<string, unknown> | null; username: string | null }>(`
        with events as (
          select 'auth'::text as source,event,actor_id,target_id,created_at,null::jsonb as details from auth_audit_events
          union all select 'licensing',event,actor_id,target_id,created_at,null from licensing_audit_events
          union all select 'support',event,actor_id,target_id,created_at,details from support_audit_events
          union all select 'finance',action,actor_id,null,created_at,null from financial_operations
          union all select 'children',event,actor_id,child_id,created_at,null from child_audit_events)
        select e.*,a.username_normalized as username from events e left join accounts a on a.id=e.actor_id
        where ($1::text is null or e.event ilike $1 or a.username_normalized ilike $1 or e.actor_id::text=$2 or e.target_id::text=$2)
          and ($3::date is null or e.created_at>=$3::date) and ($4::date is null or e.created_at<($4::date+1))
        order by e.created_at desc limit $5`, [like, q.query ?? null, q.from ?? null, q.to ?? null, q.limit])).rows;
      await this.audit(tx, p, 'support.audit_searched', null, { filtered: Boolean(q.query || q.from || q.to) });
      return rows.map((r) => ({ source: r.source, event: r.event, actorId: r.actor_id, actorUsername: r.username, targetId: r.target_id, createdAt: r.created_at.toISOString(), details: r.details }));
    });
  }
  async accounts(token: string, raw: unknown): Promise<SupportAccount[]> {
    const q = supportAccountQuerySchema.parse(raw);
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      const rows = (await tx.query<{ id: string; username_normalized: string; kind: SupportAccount['kind']; status: string; status_until: string | null; must_change_password: boolean; reservation: boolean; last_login: Date | null; version: number }>(`
        select a.id,a.username_normalized,a.kind,a.status,a.status_until::text,a.must_change_password,a.version,
          exists(select 1 from seat_reservations r where r.account_id=a.id and r.released_at is null) as reservation,
          (select max(created_at) from auth_audit_events e where e.event='auth.login' and e.target_id=a.id) as last_login
        from accounts a where a.username_normalized ilike $1 or a.id::text=$2 order by a.username_normalized limit 20`, [`%${q.query.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`, q.query])).rows;
      await this.audit(tx, p, 'support.account_searched', null, { matches: rows.length });
      return rows.map((r) => ({ id: r.id, username: r.username_normalized, kind: r.kind, status: r.status, statusUntil: r.status_until, mustChangePassword: r.must_change_password, reservationActive: r.reservation, lastLoginAt: iso(r.last_login), version: r.version }));
    });
  }
  async backups(token: string): Promise<BackupRunSummary[]> {
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      return (await tx.query<RunRow>(`select ${RUN_COLUMNS} from backup_runs order by requested_at desc,id desc limit 50`)).rows.map(runSummary);
    });
  }
  // The worker executes the run under the shared advisory lock; the request itself only records intent and audit.
  async requestBackup(token: string, raw: unknown): Promise<BackupRunSummary> {
    const input = backupRequestSchema.parse(raw);
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      if (!this.config.backup?.backupDir || !this.config.backup.encryptionKey) throw new SafeError('VALIDATION_ERROR', 'support.backupNotConfigured', false, 409);
      const pending = (await tx.query("select 1 from backup_runs where status in ('REQUESTED','RUNNING') and kind='MANUAL'")).rowCount;
      if (pending) throw new SafeError('VALIDATION_ERROR', 'support.backupPending', false, 409);
      const id = randomUUID();
      await tx.query("insert into backup_runs(id,kind,status,requested_by,reason,installation_id,release_version) values($1,'MANUAL','REQUESTED',$2,$3,$4,$5)", [id, p.account.id, input.reason, this.config.installationId, this.config.releaseVersion ?? 'development']);
      await this.audit(tx, p, 'support.backup_requested', id, { reason: input.reason });
      return runSummary((await tx.query<RunRow>(`select ${RUN_COLUMNS} from backup_runs where id=$1`, [id])).rows[0]);
    });
  }
  async restoreValidations(token: string): Promise<RestoreValidationSummary[]> {
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.restore');
      return (await tx.query<{ id: string; backup_run_id: string; archive_name: string | null; status: RestoreValidationSummary['status']; requested_at: Date; finished_at: Date | null; requested_by: string; target_label: string | null; error_code: string | null; report: Record<string, unknown> | null }>('select v.id,v.backup_run_id,b.archive_name,v.status,v.requested_at,v.finished_at,v.requested_by,v.target_label,v.error_code,v.report from restore_validations v join backup_runs b on b.id=v.backup_run_id order by v.requested_at desc,v.id desc limit 20')).rows
        .map((r) => ({ id: r.id, backupRunId: r.backup_run_id, archiveName: r.archive_name, status: r.status, requestedAt: r.requested_at.toISOString(), finishedAt: iso(r.finished_at), requestedBy: r.requested_by, targetLabel: r.target_label, errorCode: r.error_code, report: r.report }));
    });
  }
  // Controlled restore initiation: Superadmin-only capability, password re-entry, and the archive name typed back.
  // The job restores only into the configured isolated target; a live restore stays an operator CLI procedure.
  async requestRestoreValidation(token: string, raw: unknown): Promise<RestoreValidationSummary> {
    const input = restoreValidationRequestSchema.parse(raw);
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.restore');
      await this.licensing.auth.rateLimit('support-restore', p.account.id);
      await this.reauthenticate(tx, p, input.operatorPassword);
      const run = (await tx.query<RunRow>(`select ${RUN_COLUMNS} from backup_runs where id=$1`, [input.backupRunId])).rows[0];
      if (!run) throw new SafeError('NOT_FOUND', 'support.backupNotFound', false, 404);
      if (run.status !== 'SUCCEEDED' || !run.archive_name || run.archive_deleted_at) throw new SafeError('VALIDATION_ERROR', 'support.backupNotRestorable', false, 409);
      if (run.archive_name !== input.confirmArchiveName) throw new SafeError('VALIDATION_ERROR', 'support.confirmationMismatch', false, 400);
      if ((await tx.query("select 1 from restore_validations where status in ('REQUESTED','RUNNING')")).rowCount) throw new SafeError('VALIDATION_ERROR', 'support.restorePending', false, 409);
      const id = randomUUID(); const target = this.config.backup?.restoreValidationDatabaseUrl ? new URL(this.config.backup.restoreValidationDatabaseUrl).pathname.replace(/^\//, '') : null;
      await tx.query("insert into restore_validations(id,backup_run_id,requested_by,status,target_label) values($1,$2,$3,'REQUESTED',$4)", [id, run.id, p.account.id, target]);
      await this.audit(tx, p, 'support.restore_validation_requested', id, { backupRunId: run.id, archiveName: run.archive_name, reason: input.reason });
      return { id, backupRunId: run.id, archiveName: run.archive_name, status: 'REQUESTED', requestedAt: new Date().toISOString(), finishedAt: null, requestedBy: p.account.id, targetLabel: target, errorCode: null, report: null };
    });
  }
  // Archival preview: counts of dependent records that stay attached to the child (nothing is deleted).
  async childDependents(token: string, childId: string): Promise<ChildDependents> {
    z.uuid().parse(childId);
    return this.licensing.withPolicy(token, async (tx, p) => {
      requireCapability(p, 'support.access');
      const row = (await tx.query<{ id: string; code: string; full_name: string; status: string; version: number; links: number; obligations: number; outstanding: string; receipts: number; documents: number; attendance: number; learning: number }>(`
        select c.id,c.code,c.full_name,c.status,c.version,
          (select count(*)::int from guardian_child_links l where l.child_id=c.id and l.active) as links,
          (select count(*)::int from obligations o where o.child_id=c.id) as obligations,
          (select coalesce(sum(b.remaining),0)::text from obligation_balances b join obligations o on o.id=b.id where o.child_id=c.id) as outstanding,
          (select count(distinct a.receipt_id)::int from receipt_allocations a join installments i on i.id=a.installment_id join obligations o on o.id=i.obligation_id where o.child_id=c.id) as receipts,
          (select count(*)::int from child_documents d where d.child_id=c.id and not d.retired) as documents,
          (select count(*)::int from attendance_records r join learning_events e on e.id=r.event_id join daily_slots s on s.id=e.slot_id join daily_snapshots n on n.id=s.snapshot_id where n.child_id=c.id) as attendance,
          (select count(*)::int from learning_events e join daily_slots s on s.id=e.slot_id join daily_snapshots n on n.id=s.snapshot_id where n.child_id=c.id) as learning
        from children c where c.id=$1`, [childId])).rows[0];
      if (!row) throw denied();
      await this.audit(tx, p, 'support.child_dependents_viewed', childId, {});
      return { childId: row.id, code: row.code, fullName: row.full_name, status: row.status, version: row.version, guardianLinks: row.links, obligations: row.obligations, outstandingPiastres: row.outstanding, receipts: row.receipts, documents: row.documents, attendanceRecords: row.attendance, learningRecords: row.learning };
    });
  }
}
