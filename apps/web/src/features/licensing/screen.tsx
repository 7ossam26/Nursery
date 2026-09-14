import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type {
  LicenseContext, LicenseLimitsInput, ModuleImpactPreview, ModuleKey, ModuleSetting, NurserySettings, ProvisionResult
} from '@nursery/contracts';
import { themeTokenKeys, validateThemeContrast } from '@nursery/contracts';
import { formatEgp, piastres } from '@nursery/domain';
import { Button, DateField, SelectField, TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';

function egp(amount: number) { return formatEgp(piastres(BigInt(amount))); }
function errorKey(caught: unknown): MessageKey { return caught instanceof AuthError && caught.detail.messageKey in catalogs.en ? caught.detail.messageKey as MessageKey : 'auth.networkError'; }

// A reusable "type an account ID and a reason, then call one endpoint" action used by release/restore/deactivate/etc.
function ReasonActionById({ label, run, extra }: Readonly<{ label: string; run: (id: string, reason: string, extra: Record<string, string>) => Promise<void>; extra?: ReadonlyArray<{ key: string; label: string }> }>) {
  const { t } = useLocale();
  const [id, setId] = useState(''); const [reason, setReason] = useState(''); const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [done, setDone] = useState(false);
  return <form onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError(null); setDone(false);
    try { await run(id, reason, values); setDone(true); setReason(''); }
    catch (caught) { setError(errorKey(caught)); } finally { setBusy(false); }
  }} aria-busy={busy}>
    {error && <p role="alert">{t(error)}</p>}{done && <p role="status">{t('licensing.actionDone')}</p>}
    <TextField label={t('licensing.accountId')} required value={id} onChange={(e) => setId(e.target.value)} />
    <TextField label={t('licensing.reason')} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
    {extra?.map((field) => field.key==='untilDate'?<DateField key={field.key} label={field.label} value={values[field.key]??''} onValueChange={value=>setValues(v=>({...v,[field.key]:value}))}/>:<TextField key={field.key} label={field.label} value={values[field.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} />)}
    <Button type="submit" disabled={busy || !id.trim() || !reason.trim()}>{label}</Button>
  </form>;
}

function RenewalPaymentsCard({ payments, onRecorded }: Readonly<{ payments: LicenseContext['renewalPayments']; onRecorded: () => Promise<void> }>) {
  const { t } = useLocale(); const auth = useAuth();
  const [periodStart, setStart] = useState(''); const [periodEnd, setEnd] = useState(''); const [amount, setAmount] = useState(0); const [method, setMethod] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null);
  return <Card title={t('licensing.renewalPayments')}>
    <ul>{payments.map((payment) => <li key={payment.id}>{payment.periodStart} → {payment.periodEnd}: {egp(payment.amountPiastres)} ({payment.method})</li>)}</ul>
    <form aria-busy={busy} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null);
      try { await auth.client.licensing('renewal-payments', 'POST', { periodStart, periodEnd, amountPiastres: Math.round(amount * 100), method, note: note || null }); setStart(''); setEnd(''); setAmount(0); setMethod(''); setNote(''); await onRecorded(); }
      catch (caught) { setError(errorKey(caught)); } finally { setBusy(false); }
    }}>
      {error && <p role="alert">{t(error)}</p>}
      <DateField label={t('licensing.periodStart')} required value={periodStart} onValueChange={setStart} />
      <DateField label={t('licensing.periodEnd')} required value={periodEnd} onValueChange={setEnd} />
      <TextField label={t('licensing.amount')} type="number" min={0} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      <TextField label={t('licensing.method')} required maxLength={120} value={method} onChange={(e) => setMethod(e.target.value)} />
      <TextField label={t('licensing.note')} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="submit" disabled={busy}>{t('licensing.recordPayment')}</Button>
    </form>
  </Card>;
}

export function LicensingScreen() {
  const auth = useAuth(); const { t } = useLocale();
  const [context, setContext] = useState<LicenseContext | null>(null);
  const [error, setError] = useState<MessageKey | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [supportReason, setSupportReason] = useState(''); const [supportResult, setSupportResult] = useState<{ status: string; staffCount: number; parentCount: number } | null>(null); const [supportError, setSupportError] = useState<MessageKey | null>(null);

  async function load() {
    try { setContext(await auth.client.licensing<LicenseContext>('context')); setError(null); }
    catch (caught) { auth.handleError(caught); setError(errorKey(caught)); }
  }
  useEffect(() => { void load(); }, [auth.client]);

  const [form, setForm] = useState<LicenseLimitsInput | null>(null);
  useEffect(() => {
    if (context?.limits) setForm(context.limits);
    else if (context && !context.limits) setForm({ parentCapacity: 10, employeeCapacity: 5, parentUnitPricePiastres: 0, employeeUnitPricePiastres: 0, subscriptionPeriod: 'MONTHLY', startsOn: '', validUntil: '', graceDays: 7, agreedTotalOverridePiastres: null, agreedTotalOverrideReason: null, supportContact: null });
  }, [context]);

  async function saveLimits(e: FormEvent) {
    e.preventDefault(); if (!form) return; setBusy(true); setError(null); setNotice(null);
    try {
      await auth.client.licensing('limits', 'PUT', { expectedVersion: context?.limits?.version ?? null, value: form });
      setNotice(t('licensing.saved')); await load();
    } catch (caught) { auth.handleError(caught); setError(errorKey(caught)); } finally { setBusy(false); }
  }

  const can = (key: string) => auth.session?.account.capabilities.includes(key) ?? false;

  return <main className="organization-page"><header><h1>{t('licensing.title')}</h1></header>
    {error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{notice}</p>}
    {!context ? <p role="status">{t('state.loading')}</p> : <>
      <Card title={t('licensing.status')}>
        <p>{t(`licensing.status.${context.status}`)}</p>
        <p>{t('licensing.parentReserved', { count: context.parentReserved, capacity: context.limits?.parentCapacity ?? 0 })}</p>
        <p>{t('licensing.employeeReserved', { count: context.employeeReserved, capacity: context.limits?.employeeCapacity ?? 0 })}</p>
        {context.estimatePiastres !== null && <p>{t('licensing.estimate', { amount: egp(context.estimatePiastres) })}</p>}
        <p className="field__hint">{t('licensing.estimateHelp')}</p>
      </Card>
      {can('licensing.manage') && form && <Card title={t('licensing.capacities')}>
        <form onSubmit={saveLimits} aria-busy={busy}>
          <TextField label={t('licensing.parentCapacity')} type="number" min={0} required value={form.parentCapacity} onChange={(e) => setForm({ ...form, parentCapacity: Number(e.target.value) })} />
          <TextField label={t('licensing.employeeCapacity')} type="number" min={0} required value={form.employeeCapacity} onChange={(e) => setForm({ ...form, employeeCapacity: Number(e.target.value) })} />
          <TextField label={t('licensing.parentUnitPrice')} type="number" min={0} required value={form.parentUnitPricePiastres / 100} onChange={(e) => setForm({ ...form, parentUnitPricePiastres: Math.round(Number(e.target.value) * 100) })} />
          <TextField label={t('licensing.employeeUnitPrice')} type="number" min={0} required value={form.employeeUnitPricePiastres / 100} onChange={(e) => setForm({ ...form, employeeUnitPricePiastres: Math.round(Number(e.target.value) * 100) })} />
          <SelectField label={t('licensing.period')} value={form.subscriptionPeriod} onChange={(e) => setForm({ ...form, subscriptionPeriod: e.target.value as 'MONTHLY' | 'YEARLY' })}>
            <option value="MONTHLY">{t('licensing.periodMonthly')}</option><option value="YEARLY">{t('licensing.periodYearly')}</option>
          </SelectField>
          <DateField label={t('licensing.startsOn')} required value={form.startsOn} onValueChange={(v) => setForm({ ...form, startsOn: v })} />
          <DateField label={t('licensing.validUntil')} required value={form.validUntil} onValueChange={(v) => setForm({ ...form, validUntil: v })} />
          <TextField label={t('licensing.graceDays')} type="number" min={0} max={90} required value={form.graceDays} onChange={(e) => setForm({ ...form, graceDays: Number(e.target.value) })} />
          <TextField label={t('licensing.overrideAmount')} type="number" min={0} value={form.agreedTotalOverridePiastres === null ? '' : form.agreedTotalOverridePiastres / 100} onChange={(e) => setForm({ ...form, agreedTotalOverridePiastres: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })} />
          <TextField label={t('licensing.overrideReason')} value={form.agreedTotalOverrideReason ?? ''} onChange={(e) => setForm({ ...form, agreedTotalOverrideReason: e.target.value || null })} />
          <TextField label={t('licensing.supportContact')} value={form.supportContact ?? ''} onChange={(e) => setForm({ ...form, supportContact: e.target.value || null })} />
          <Button type="submit" disabled={busy}>{t('licensing.save')}</Button>
        </form>
      </Card>}
      {can('licensing.manage') && <RenewalPaymentsCard payments={context.renewalPayments} onRecorded={load} />}
      {can('seats.release') && <>
        <Card title={t('licensing.release')}><ReasonActionById label={t('licensing.release')} run={async (accountId, reason) => { await auth.client.licensing(`accounts/${accountId}/release`, 'POST', { reason }); await load(); }} /></Card>
        <Card title={t('licensing.restore')}><ReasonActionById label={t('licensing.restore')} run={async (accountId, reason) => { await auth.client.licensing(`accounts/${accountId}/restore`, 'POST', { reason }); await load(); }} /></Card>
      </>}
      {can('support.access') && <Card title={t('licensing.supportContext')}>
        <p>{t('licensing.supportContextHelp')}</p>
        <TextField label={t('licensing.reason')} value={supportReason} onChange={(e) => setSupportReason(e.target.value)} />
        {supportError && <p role="alert">{t(supportError)}</p>}
        <Button disabled={!supportReason.trim()} onClick={async () => {
          setSupportError(null);
          try { setSupportResult(await auth.client.licensing<{ status: string; staffCount: number; parentCount: number }>('support-context', 'POST', { reason: supportReason })); }
          catch (caught) { setSupportError(errorKey(caught)); }
        }}>{t('licensing.openSupportContext')}</Button>
        {supportResult && <div role="status">
          <p>{t(`licensing.status.${supportResult.status}` as MessageKey)}</p>
          <p>{t('licensing.staffCount', { count: supportResult.staffCount })}</p>
          <p>{t('licensing.parentCount', { count: supportResult.parentCount })}</p>
        </div>}
      </Card>}
    </>}
  </main>;
}

function ProvisionCard({ title, action }: Readonly<{ title: string; action: string }>) {
  const { t } = useLocale(); const auth = useAuth();
  const [username, setUsername] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<MessageKey | null>(null); const [result, setResult] = useState<ProvisionResult | null>(null);
  return <Card title={title}>
    <form aria-busy={busy} onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null); setResult(null);
      try { setResult(await auth.client.licensing<ProvisionResult>(action, 'POST', { username })); setUsername(''); }
      catch (caught) { setError(errorKey(caught)); } finally { setBusy(false); }
    }}>
      {error && <p role="alert">{t(error)}</p>}
      <TextField label={t('licensing.username')} required minLength={3} maxLength={64} value={username} onChange={(e) => setUsername(e.target.value)} />
      <Button type="submit" disabled={busy}>{title}</Button>
    </form>
    {result && <div role="status"><p>{result.id}</p><p>{t('licensing.temporaryPassword')}</p><code className="auth-temporary" dir="ltr">{result.temporaryPassword}</code></div>}
  </Card>;
}

function ModulesCard() {
  const { t } = useLocale(); const auth = useAuth();
  const [modules, setModules] = useState<ModuleSetting[] | null>(null); const [error, setError] = useState<MessageKey | null>(null);
  const [preview, setPreview] = useState<Partial<Record<ModuleKey, ModuleImpactPreview>>>({});
  const [ack, setAck] = useState<Partial<Record<ModuleKey, boolean>>>({});
  const [reason, setReason] = useState<Partial<Record<ModuleKey, string>>>({});
  const [busy, setBusy] = useState<ModuleKey | null>(null);
  async function load() { try { setModules(await auth.client.licensing<ModuleSetting[]>('modules')); } catch (caught) { setError(errorKey(caught)); } }
  useEffect(() => { void load(); }, []);
  return <Card title={t('licensing.modules')}>
    <p>{t('licensing.modulesHelp')}</p>{error && <p role="alert">{t(error)}</p>}
    {modules?.map((module) => {
      const nextEnabled = !module.enabled;
      const impact = preview[module.moduleKey];
      return <fieldset key={module.moduleKey} className="organization-fields">
        <legend>{t(`licensing.module.${module.moduleKey}`)} — {t(module.enabled ? 'licensing.moduleEnabled' : 'licensing.moduleDisabled')}</legend>
        <Button variant="secondary" onClick={async () => { const next = await auth.client.licensing<ModuleImpactPreview>(`modules/${module.moduleKey}/preview`, 'POST', { enabled: nextEnabled }); setPreview((p) => ({ ...p, [module.moduleKey]: next })); }}>{t('licensing.preview')}</Button>
        {impact && <div>
          <ul>{impact.impacts.map((line) => <li key={line}>{line}</li>)}</ul>
          {impact.requiresCatchupAcknowledgement && <>
            <p>{t('licensing.noMissingPeriods')}</p>
            {impact.missingPeriods.map(period=><p key={period.start} dir="ltr">{period.start} – {period.end}</p>)}
            <Link to="/administration/billing">{t('billing.title')}</Link>
            <label><input type="checkbox" checked={ack[module.moduleKey] ?? false} onChange={(e) => setAck((a) => ({ ...a, [module.moduleKey]: e.target.checked }))} />{t('licensing.catchupAcknowledge')}</label>
          </>}
          <TextField label={t('licensing.reason')} required value={reason[module.moduleKey] ?? ''} onChange={(e) => setReason((r) => ({ ...r, [module.moduleKey]: e.target.value }))} />
          <Button disabled={busy === module.moduleKey || !(reason[module.moduleKey] ?? '').trim() || (impact.requiresCatchupAcknowledgement && !ack[module.moduleKey])} onClick={async () => {
            setBusy(module.moduleKey); setError(null);
            try {
              await auth.client.licensing(`modules/${module.moduleKey}`, 'PUT', { expectedVersion: module.version, enabled: nextEnabled, reason: reason[module.moduleKey], catchupAcknowledged: ack[module.moduleKey] ?? false });
              setPreview((p) => ({ ...p, [module.moduleKey]: undefined })); setReason((r) => ({ ...r, [module.moduleKey]: '' })); await load();
            } catch (caught) { setError(errorKey(caught)); } finally { setBusy(null); }
          }}>{t('licensing.apply')}</Button>
        </div>}
      </fieldset>;
    })}
  </Card>;
}

function BrandingCard() {
  const { t } = useLocale(); const auth = useAuth();
  const [settings, setSettings] = useState<NurserySettings | null>(null); const [form, setForm] = useState<NurserySettings | null>(null);
  const [error, setError] = useState<MessageKey | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void auth.client.licensing<NurserySettings>('settings').then((s) => { setSettings(s); setForm(s); }).catch((caught: unknown) => setError(errorKey(caught))); }, []);
  const failures = form ? validateThemeContrast(form.theme) : [];
  return <Card title={t('licensing.branding')}>
    {error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{notice}</p>}
    {form && <form aria-busy={busy} onSubmit={async (e) => {
      e.preventDefault(); if (failures.length) return; setBusy(true); setError(null); setNotice(null);
      try { const saved = await auth.client.licensing<NurserySettings>('settings', 'PUT', { expectedVersion: settings!.version, value: { name: form.name, logoPath: form.logoPath, contactPhone: form.contactPhone, contactEmail: form.contactEmail, theme: form.theme } }); setSettings(saved); setForm(saved); setNotice(t('licensing.saved')); }
      catch (caught) { setError(errorKey(caught)); } finally { setBusy(false); }
    }}>
      <TextField label={t('licensing.name')} required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextField label={t('licensing.logoPath')} value={form.logoPath ?? ''} onChange={(e) => setForm({ ...form, logoPath: e.target.value || null })} />
      <TextField label={t('licensing.contactPhone')} value={form.contactPhone ?? ''} onChange={(e) => setForm({ ...form, contactPhone: e.target.value || null })} />
      <TextField label={t('licensing.contactEmail')} value={form.contactEmail ?? ''} onChange={(e) => setForm({ ...form, contactEmail: e.target.value || null })} />
      {themeTokenKeys.map((key) => <TextField key={key} label={t(`licensing.theme.${key}` as MessageKey)} type="color" value={form.theme[key]} onChange={(e) => setForm({ ...form, theme: { ...form.theme, [key]: e.target.value.toUpperCase() } })} />)}
      {failures.length > 0 ? <p role="alert">{t('licensing.contrastFail', { pairs: failures.map((f) => `${f.pair} ${f.ratio.toFixed(2)}:1`).join(', ') })}</p> : <p role="status">{t('licensing.contrastOk')}</p>}
      <Button type="submit" disabled={busy || failures.length > 0}>{t('licensing.save')}</Button>
    </form>}
  </Card>;
}

export function SettingsScreen() {
  const auth = useAuth(); const { t } = useLocale();
  const can = (key: string) => auth.session?.account.capabilities.includes(key) ?? false;
  return <main className="organization-page"><header><h1>{t('licensing.settingsTitle')}</h1></header>
    {can('branding.manage') && <BrandingCard />}
    {can('modules.manage') && <ModulesCard />}
    {can('users.manage_staff') && <>
      <ProvisionCard title={t('licensing.provisionStaff')} action="staff" />
      <Card title={t('licensing.deactivate')}><ReasonActionById label={t('licensing.deactivate')} run={async (id, reason) => { await auth.client.licensing(`accounts/${id}/deactivate`, 'POST', { reason }); }} /></Card>
      <Card title={t('licensing.reactivate')}><ReasonActionById label={t('licensing.reactivate')} run={async (id, reason) => { await auth.client.licensing(`accounts/${id}/reactivate`, 'POST', { reason }); }} /></Card>
    </>}
    {can('users.create_parent') && <ProvisionCard title={t('licensing.provisionParent')} action="parents" />}
    {can('parents.block') && <>
      <Card title={t('licensing.block')}>
        <ReasonActionById label={t('licensing.block')} extra={[{ key: 'publicMessage', label: t('licensing.publicMessage') }, { key: 'untilDate', label: t('licensing.untilDate') }]}
          run={async (id, reason, extra) => { await auth.client.licensing(`accounts/${id}/block`, 'POST', { reason, publicMessage: extra.publicMessage || undefined, untilDate: extra.untilDate || undefined }); }} />
      </Card>
      <Card title={t('licensing.unblock')}><ReasonActionById label={t('licensing.unblock')} run={async (id, reason) => { await auth.client.licensing(`accounts/${id}/unblock`, 'POST', { reason }); }} /></Card>
    </>}
  </main>;
}
