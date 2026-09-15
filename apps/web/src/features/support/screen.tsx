import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { BackupRunSummary, ChildDependents, RestoreValidationSummary, SupportAccount, SupportAuditEvent, SupportStatus } from '@nursery/contracts';
import { formatEgp, piastres } from '@nursery/domain';
import { Button, DateField, SelectField, TextField } from '../../components/controls.js';
import { Card, ResponsiveTable } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';

function errorKey(caught: unknown): MessageKey { return caught instanceof AuthError && caught.detail.messageKey in catalogs.en ? caught.detail.messageKey as MessageKey : 'auth.networkError'; }
const when = (value: string | null, locale: string) => (value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—');
const bytes = (value: number | null) => (value === null ? '—' : value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : value >= 1024 ** 2 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`);
const egp = (amount: string) => formatEgp(piastres(BigInt(amount)));

function StatusCard({ status }: Readonly<{ status: SupportStatus }>) {
  const { t, locale } = useLocale();
  const worker = status.worker.ageSeconds === null ? t('support.workerNever') : status.worker.healthy ? t('support.workerHealthy', { seconds: status.worker.ageSeconds }) : t('support.workerStale', { seconds: status.worker.ageSeconds });
  return <Card title={t('support.installation')}>
    <p dir="ltr">{status.installation.id}</p>
    <p>{t('support.release')}: <span dir="ltr">{status.installation.releaseVersion}</span> · {t('support.schema')}: <span dir="ltr">{status.installation.schemaVersion ?? '—'}</span> · {t('support.pendingMigrations')}: {status.installation.pendingMigrations}</p>
    <p>{t('support.license')}: {t(`licensing.status.${status.installation.licenseStatus}` as MessageKey)}</p>
    <p role="status" data-worker-healthy={String(status.worker.healthy)}>{t('support.worker')}: {worker}</p>
    <p>{t('support.failedJobs', { count: status.failedJobs24h })} · {t('support.overdueJobs', { count: status.overdueJobs })}</p>
    <p>{t('support.billingLast', { value: status.billing.lastOccurrenceAt ?? '—' })} · {t('support.remindersLast', { value: when(status.billing.lastReminderAt, locale) })}</p>
    <p>{t('support.storage')}: {status.storage.privateFiles ? t('support.privateFilesFree', { free: bytes(status.storage.privateFiles.freeBytes), total: bytes(status.storage.privateFiles.totalBytes) }) : t('support.storageUnknown')} · {status.storage.backups ? t('support.backupsFree', { free: bytes(status.storage.backups.freeBytes), total: bytes(status.storage.backups.totalBytes) }) : t('support.storageUnknown')}</p>
    {status.queues.length > 0 && <ResponsiveTable caption={t('support.queues')} rows={status.queues} rowKey={(q) => `${q.name}/${q.state}`} columns={[
      { key: 'name', heading: t('support.queueName'), cell: (q) => <span dir="ltr">{q.name}</span> }, { key: 'state', heading: t('support.queueState'), cell: (q) => q.state },
      { key: 'count', heading: t('support.queueCount'), cell: (q) => q.count, numeric: true }, { key: 'oldest', heading: t('support.queueOldest'), cell: (q) => when(q.oldestCreatedAt, locale) }]} />}
  </Card>;
}

function BackupsCard({ status, runs, reload }: Readonly<{ status: SupportStatus; runs: BackupRunSummary[]; reload: () => Promise<void> }>) {
  const { t, locale } = useLocale(); const auth = useAuth();
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [notice, setNotice] = useState<MessageKey | null>(null);
  return <Card title={t('support.backups')}>
    <p>{t('support.backupsHelp')}</p>
    {!status.backups.configured && <p role="alert">{t('support.backupsNotConfigured')}</p>}
    {status.backups.configured && !status.backups.offsiteConfigured && <p role="alert">{t('support.offsiteMissing')}</p>}
    <p>{t('support.lastSuccessful', { value: status.backups.lastSuccessfulAt ? `${when(status.backups.lastSuccessfulAt, locale)} (${t('support.backupAge', { hours: status.backups.ageHours ?? 0 })})` : t('support.never') })} · {t('support.failedRecently', { count: status.backups.failedLast7Days })}</p>
    <form aria-busy={busy} onSubmit={async (e: FormEvent) => {
      e.preventDefault(); setBusy(true); setError(null); setNotice(null);
      try { await auth.client.business('support/backups', 'POST', { reason }); setReason(''); setNotice('support.backupRequested'); await reload(); }
      catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setBusy(false); }
    }}>
      {error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
      <TextField label={t('support.reason')} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" disabled={busy || !status.backups.configured || !reason.trim()}>{t('support.requestBackup')}</Button>
    </form>
    <ResponsiveTable caption={t('support.backups')} rows={runs} rowKey={(r) => r.id} columns={[
      { key: 'kind', heading: t('support.kind'), cell: (r) => r.kind }, { key: 'status', heading: t('support.status'), cell: (r) => r.status },
      { key: 'requested', heading: t('support.requestedAt'), cell: (r) => when(r.requestedAt, locale) }, { key: 'finished', heading: t('support.finishedAt'), cell: (r) => when(r.finishedAt, locale) },
      { key: 'archive', heading: t('support.archive'), cell: (r) => <span dir="ltr">{r.archiveDeletedAt ? t('support.deleted') : r.archiveName ?? '—'}</span> },
      { key: 'size', heading: t('support.size'), cell: (r) => bytes(r.archiveBytes), numeric: true }, { key: 'files', heading: t('support.files'), cell: (r) => r.fileCount ?? '—', numeric: true },
      { key: 'offsite', heading: t('support.offsite'), cell: (r) => (r.offsiteCopiedAt ? t('support.yes') : t('support.no')) }, { key: 'error', heading: t('support.error'), cell: (r) => <span dir="ltr">{r.errorCode ?? '—'}</span> }]} />
  </Card>;
}

function RestoreCard({ status, runs, validations, reload }: Readonly<{ status: SupportStatus; runs: BackupRunSummary[]; validations: RestoreValidationSummary[]; reload: () => Promise<void> }>) {
  const { t, locale } = useLocale(); const auth = useAuth();
  const candidates = runs.filter((r) => r.status === 'SUCCEEDED' && r.archiveName && !r.archiveDeletedAt);
  const [backupRunId, setRun] = useState(''); const [confirm, setConfirm] = useState(''); const [password, setPassword] = useState(''); const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [notice, setNotice] = useState<MessageKey | null>(null);
  return <Card title={t('support.restoreValidation')}>
    <p>{t('support.restoreHelp')}</p>
    {!status.backups.restoreValidationConfigured && <p role="alert">{t('support.restoreNotConfigured')}</p>}
    <form aria-busy={busy} onSubmit={async (e: FormEvent) => {
      e.preventDefault(); setBusy(true); setError(null); setNotice(null);
      try { await auth.client.business('support/restore-validations', 'POST', { backupRunId, operatorPassword: password, confirmArchiveName: confirm, reason }); setConfirm(''); setReason(''); setNotice('support.validationRequested'); await reload(); }
      catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setPassword(''); setBusy(false); }
    }}>
      {error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
      <SelectField label={t('support.selectBackup')} required value={backupRunId} onChange={(e) => setRun(e.target.value)}>
        <option value="">—</option>{candidates.map((r) => <option key={r.id} value={r.id}>{r.archiveName}</option>)}
      </SelectField>
      <TextField label={t('support.confirmArchive')} required dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <TextField label={t('support.operatorPassword')} required type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
      <TextField label={t('support.reason')} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" disabled={busy || !backupRunId || !confirm.trim() || !password || !reason.trim()}>{t('support.startValidation')}</Button>
    </form>
    <ResponsiveTable caption={t('support.restoreValidation')} rows={validations} rowKey={(v) => v.id} columns={[
      { key: 'archive', heading: t('support.archive'), cell: (v) => <span dir="ltr">{v.archiveName ?? '—'}</span> }, { key: 'status', heading: t('support.status'), cell: (v) => v.status },
      { key: 'target', heading: t('support.target'), cell: (v) => <span dir="ltr">{v.targetLabel ?? '—'}</span> }, { key: 'requested', heading: t('support.requestedAt'), cell: (v) => when(v.requestedAt, locale) },
      { key: 'error', heading: t('support.error'), cell: (v) => <span dir="ltr">{v.errorCode ?? '—'}</span> },
      { key: 'report', heading: t('support.report'), cell: (v) => { const r = v.report as { files?: { extracted: number; missing: number }; checks?: { accounts: number; children: number; outstandingDebtPiastres: string; treasuryBalancePiastres: string }; database?: { sessionsRevoked: number } } | null; return r?.files && r.checks ? t('support.reportSummary', { files: r.files.extracted, missing: r.files.missing, accounts: r.checks.accounts, children: r.checks.children, debt: egp(r.checks.outstandingDebtPiastres), treasury: egp(r.checks.treasuryBalancePiastres), sessions: r.database?.sessionsRevoked ?? 0 }) : '—'; } }]} />
  </Card>;
}

function AuditCard() {
  const { t, locale } = useLocale(); const auth = useAuth();
  const [query, setQuery] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [rows, setRows] = useState<SupportAuditEvent[] | null>(null); const [error, setError] = useState<MessageKey | null>(null);
  return <Card title={t('support.audit')}>
    <p>{t('support.auditHelp')}</p>
    <form onSubmit={async (e: FormEvent) => {
      e.preventDefault(); setError(null);
      const params = new URLSearchParams(); if (query.trim()) params.set('query', query.trim()); if (from) params.set('from', from); if (to) params.set('to', to);
      try { setRows(await auth.client.business<SupportAuditEvent[]>(`support/audit?${params.toString()}`)); } catch (caught) { auth.handleError(caught); setError(errorKey(caught)); }
    }}>
      {error && <p role="alert">{t(error)}</p>}
      <TextField label={t('support.auditQuery')} maxLength={120} value={query} onChange={(e) => setQuery(e.target.value)} />
      <DateField label={t('support.from')} value={from} onValueChange={setFrom} /><DateField label={t('support.to')} value={to} onValueChange={setTo} />
      <Button type="submit">{t('support.search')}</Button>
    </form>
    {rows && (rows.length === 0 ? <p role="status">{t('support.noResults')}</p> : <ResponsiveTable caption={t('support.audit')} rows={rows} rowKey={(r) => `${r.source}/${r.createdAt}/${r.event}/${r.targetId ?? ''}`} columns={[
      { key: 'when', heading: t('support.when'), cell: (r) => when(r.createdAt, locale) }, { key: 'source', heading: t('support.source'), cell: (r) => r.source },
      { key: 'event', heading: t('support.event'), cell: (r) => <span dir="ltr">{r.event}</span> }, { key: 'actor', heading: t('support.actor'), cell: (r) => <span dir="ltr">{r.actorUsername ?? r.actorId ?? '—'}</span> },
      { key: 'target', heading: t('support.targetId'), cell: (r) => <span dir="ltr">{r.targetId ?? '—'}</span> }]} />)}
  </Card>;
}

function AccountAction({ label, run, fields }: Readonly<{ label: string; run: (values: Record<string, string>) => Promise<string | void>; fields: ReadonlyArray<{ key: string; label: string; type?: 'password' | 'date' }> }>) {
  const { t } = useLocale();
  const [values, setValues] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [result, setResult] = useState<string | null>(null); const [done, setDone] = useState(false);
  return <form aria-busy={busy} onSubmit={async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setDone(false); setResult(null);
    try { const out = await run(values); setDone(true); if (typeof out === 'string') setResult(out); setValues((v) => ({ ...v, operatorPassword: '', reason: '' })); }
    catch (caught) { setError(errorKey(caught)); } finally { setBusy(false); }
  }}>
    <h3>{label}</h3>{error && <p role="alert">{t(error)}</p>}{done && !result && <p role="status">{t('support.actionDone')}</p>}
    {fields.map((field) => field.type === 'date' ? <DateField key={field.key} label={field.label} value={values[field.key] ?? ''} onValueChange={(value) => setValues((v) => ({ ...v, [field.key]: value }))} />
      : <TextField key={field.key} label={field.label} type={field.type} autoComplete={field.type === 'password' ? 'current-password' : undefined} maxLength={field.type === 'password' ? 128 : 500} value={values[field.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} />)}
    <Button type="submit" disabled={busy}>{label}</Button>
    {result && <div role="status"><p>{t('support.resetDone')}</p><code className="auth-temporary" dir="ltr">{result}</code><Button variant="secondary" onClick={() => setResult(null)}>{t('auth.dismissSecret')}</Button></div>}
  </form>;
}

function AccountsCard() {
  const { t, locale } = useLocale(); const auth = useAuth();
  const [query, setQuery] = useState(''); const [rows, setRows] = useState<SupportAccount[] | null>(null); const [selected, setSelected] = useState<SupportAccount | null>(null); const [error, setError] = useState<MessageKey | null>(null);
  const can = (key: string) => auth.session?.account.capabilities.includes(key) ?? false;
  const licensing = (path: string, body: unknown) => auth.client.licensing(path, 'POST', body).then(() => undefined);
  return <Card title={t('support.accounts')}>
    <p>{t('support.accountsHelp')}</p>
    <form onSubmit={async (e: FormEvent) => { e.preventDefault(); setError(null); try { setRows(await auth.client.business<SupportAccount[]>(`support/accounts?query=${encodeURIComponent(query.trim())}`)); } catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } }}>
      {error && <p role="alert">{t(error)}</p>}
      <TextField label={t('support.accountQuery')} required maxLength={64} value={query} onChange={(e) => setQuery(e.target.value)} />
      <Button type="submit" disabled={!query.trim()}>{t('support.search')}</Button>
    </form>
    {rows && (rows.length === 0 ? <p role="status">{t('support.noResults')}</p> : <ResponsiveTable caption={t('support.accounts')} rows={rows} rowKey={(r) => r.id} columns={[
      { key: 'username', heading: t('support.username'), cell: (r) => <span dir="ltr">{r.username}</span> }, { key: 'kind', heading: t('support.accountKind'), cell: (r) => r.kind }, { key: 'status', heading: t('support.accountStatus'), cell: (r) => `${r.status}${r.statusUntil ? ` → ${r.statusUntil}` : ''}${r.mustChangePassword ? ` (${t('support.mustChange')})` : ''}` },
      { key: 'seat', heading: t('support.reservation'), cell: (r) => (r.reservationActive ? t('support.yes') : t('support.no')) }, { key: 'login', heading: t('support.lastLogin'), cell: (r) => when(r.lastLoginAt, locale) },
      { key: 'select', heading: t('support.action'), cell: (r) => <Button variant="secondary" onClick={() => setSelected(r)}>{t('support.copyId')}</Button> }]} />)}
    {selected && <div className="organization-fields">
      <p role="status"><span>{t('support.selectedAccount', { id: '' })}</span><code dir="ltr">{selected.id}</code> · <span dir="ltr">{selected.username}</span></p>
      {selected.kind !== 'SYSTEM' && can('accounts.reset_password') && <AccountAction label={t('support.resetPassword')} fields={[{ key: 'operatorPassword', label: t('support.operatorPassword'), type: 'password' }]} run={(v) => auth.client.reset(selected.id, v.operatorPassword ?? '')} />}
      {selected.kind === 'GUARDIAN' && can('parents.block') && <>
        <AccountAction label={t('support.blockParent')} fields={[{ key: 'reason', label: t('support.reason') }, { key: 'publicMessage', label: t('support.publicMessage') }, { key: 'untilDate', label: t('support.untilDate'), type: 'date' }]} run={(v) => licensing(`accounts/${selected.id}/block`, { reason: v.reason, publicMessage: v.publicMessage || undefined, untilDate: v.untilDate || undefined })} />
        <AccountAction label={t('support.unblockParent')} fields={[{ key: 'reason', label: t('support.reason') }]} run={(v) => licensing(`accounts/${selected.id}/unblock`, { reason: v.reason })} />
      </>}
      {selected.kind === 'STAFF' && can('users.manage_staff') && <>
        <AccountAction label={t('support.deactivateStaff')} fields={[{ key: 'reason', label: t('support.reason') }]} run={(v) => licensing(`accounts/${selected.id}/deactivate`, { reason: v.reason })} />
        <AccountAction label={t('support.reactivateStaff')} fields={[{ key: 'reason', label: t('support.reason') }]} run={(v) => licensing(`accounts/${selected.id}/reactivate`, { reason: v.reason })} />
      </>}
      {selected.kind !== 'SYSTEM' && can('seats.release') && <>
        <AccountAction label={t('support.releaseSeat')} fields={[{ key: 'reason', label: t('support.reason') }]} run={(v) => licensing(`accounts/${selected.id}/release`, { reason: v.reason })} />
        <AccountAction label={t('support.restoreAccount')} fields={[{ key: 'reason', label: t('support.reason') }]} run={async (v) => (await auth.client.licensing<{ temporaryPassword: string }>(`accounts/${selected.id}/restore`, 'POST', { reason: v.reason })).temporaryPassword} />
      </>}
    </div>}
  </Card>;
}

function ArchivalCard() {
  const { t } = useLocale(); const auth = useAuth();
  const [childId, setChildId] = useState(''); const [reason, setReason] = useState(''); const [preview, setPreview] = useState<ChildDependents | null>(null); const [error, setError] = useState<MessageKey | null>(null); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  return <Card title={t('support.archival')}>
    <p>{t('support.archivalHelp')}</p>
    <form onSubmit={async (e: FormEvent) => { e.preventDefault(); setError(null); setDone(false); try { setPreview(await auth.client.business<ChildDependents>(`support/children/${encodeURIComponent(childId.trim())}/dependents`)); } catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } }}>
      {error && <p role="alert">{t(error)}</p>}
      <TextField label={t('support.childId')} required dir="ltr" value={childId} onChange={(e) => setChildId(e.target.value)} />
      <Button type="submit" disabled={!childId.trim()}>{t('support.preview')}</Button>
    </form>
    {preview && <div role="status">
      <p>{t('support.dependents', { code: preview.code, name: preview.fullName, status: preview.status, links: preview.guardianLinks, obligations: preview.obligations, outstanding: egp(preview.outstandingPiastres), receipts: preview.receipts, documents: preview.documents, attendance: preview.attendanceRecords, learning: preview.learningRecords })}</p>
      {preview.status !== 'ARCHIVED' && auth.session?.account.capabilities.includes('children.manage') && <form aria-busy={busy} onSubmit={async (e: FormEvent) => {
        e.preventDefault(); setBusy(true); setError(null);
        try { await auth.client.business(`children/${preview.childId}/lifecycle`, 'POST', { expectedVersion: preview.version, status: 'ARCHIVED', reason, publicMessage: null }); setDone(true); setPreview(await auth.client.business<ChildDependents>(`support/children/${preview.childId}/dependents`)); }
        catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setBusy(false); }
      }}>
        <TextField label={t('support.reason')} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" disabled={busy || !reason.trim()}>{t('support.archiveChild')}</Button>
      </form>}
      {done && <p>{t('support.archived')}</p>}
    </div>}
  </Card>;
}

export function SupportScreen() {
  const auth = useAuth(); const { t } = useLocale();
  const [status, setStatus] = useState<SupportStatus | null>(null); const [runs, setRuns] = useState<BackupRunSummary[]>([]); const [validations, setValidations] = useState<RestoreValidationSummary[]>([]); const [error, setError] = useState<MessageKey | null>(null);
  const canRestore = auth.session?.account.capabilities.includes('support.restore') ?? false;
  const load = useCallback(async () => {
    try {
      const [next, backups, restores] = await Promise.all([auth.client.business<SupportStatus>('support/status'), auth.client.business<BackupRunSummary[]>('support/backups'), canRestore ? auth.client.business<RestoreValidationSummary[]>('support/restore-validations') : Promise.resolve([])]);
      setStatus(next); setRuns(backups); setValidations(restores); setError(null);
    } catch (caught) { auth.handleError(caught); setError(errorKey(caught)); }
  }, [auth, canRestore]);
  useEffect(() => { void load(); }, [load]);
  return <main className="organization-page"><header><h1>{t('support.title')}</h1><p>{t('support.help')}</p><Button variant="secondary" onClick={() => void load()}>{t('support.refresh')}</Button></header>
    {error && <p role="alert">{t(error)}</p>}
    {!status ? <p role="status">{t('state.loading')}</p> : <>
      <StatusCard status={status} />
      <BackupsCard status={status} runs={runs} reload={load} />
      {canRestore && <RestoreCard status={status} runs={runs} validations={validations} reload={load} />}
      <AuditCard />
      <AccountsCard />
      <ArchivalCard />
    </>}
  </main>;
}
