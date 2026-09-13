import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { cairoIsoDate, formatDateOnly, whatsAppLink } from '@nursery/domain';
import { healthEntryKinds, healthSeverities, incidentContactMethods, pickupRestrictionKinds, type ChildSafetyView, type GuardianSafetyView, type HealthEntry, type Incident, type PickupAuthorization, type PickupRecord, type SafetyGuardian } from '@nursery/contracts';
import { Button, SelectField, TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { errorKey, useScoped } from '../children/scoped.js';

const safetyCapabilities = ['health.read','health.manage','pickup.record','pickup.manage','incidents.read','incidents.manage'];
type Save = (path: string,value: unknown,method?: string) => Promise<boolean>;
// Every mutation re-reads the scoped view; forms reset only after the server accepted the change.
function useSave(reload: () => void) {
  const auth = useAuth(); const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null); const [notice,setNotice] = useState<MessageKey | null>(null);
  const save: Save = async (path,value,method = 'POST') => {
    setBusy(true); setError(null); setNotice(null);
    try { await auth.client.business(path,method,value); setNotice('safety.saved'); reload(); return true; }
    catch (caught) { setError(errorKey(caught)); auth.handleError(caught); return false; }
    finally { setBusy(false); }
  };
  return { save,busy,error,notice };
}
function Messages({ error,notice }: { error: MessageKey | null; notice: MessageKey | null }) { const { t } = useLocale(); return <>{error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}</>; }
function Validity({ from,until }: { from: string; until: string | null }) { const { t } = useLocale(); return <>{formatDateOnly(from)} — {until ? formatDateOnly(until) : t('safety.openEnded')}</>; }
function TextArea({ label,value,onChange,required,maxLength }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; maxLength: number }) {
  const id = useId(); return <div className="field"><label className="field__label" htmlFor={id}>{label}</label><textarea className="field__control" id={id} rows={3} required={required} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}
function GuardianContacts({ guardians }: { guardians: SafetyGuardian[] }) {
  const { t } = useLocale();
  return <><h3>{t('safety.guardians')}</h3><p>{t('safety.whatsappHelp')}</p><ul>{guardians.map((g) => <li key={g.id}>{g.fullName} ({g.relationship}) — <a href={`tel:${g.mobile.replace(/[^+0-9]/g,'')}`} dir="ltr">{g.mobile}</a>{' '}
    {g.whatsappNumber ? <a href={whatsAppLink(g.whatsappNumber)} target="_blank" rel="noopener noreferrer">{t('safety.whatsapp')}</a> : <span>{t('safety.noWhatsapp')}</span>}{g.permissions.pickup && <> — {t('children.pickup')}</>}</li>)}</ul></>;
}
function HealthList({ entries,onRetire,busy }: { entries: HealthEntry[]; onRetire?: (entry: HealthEntry) => void; busy: boolean }) {
  const { t } = useLocale(); if (!entries.length) return <p>{t('safety.none')}</p>;
  return <ul>{entries.map((h) => <li key={h.id}><strong>{t(`safety.${h.kind}`)}{h.severity === 'CRITICAL' && ` — ${t('safety.CRITICAL')}`}:</strong> {h.title}{h.mobile && <> — <a href={`tel:${h.mobile.replace(/[^+0-9]/g,'')}`} dir="ltr">{h.mobile}</a></>}{h.body && <> — {h.body}</>}{!h.active && <> ({t('safety.retired')})</>}
    {onRetire && h.active && <> <Button variant="secondary" disabled={busy} onClick={() => onRetire(h)}>{t('safety.retireEntry')}</Button></>}</li>)}</ul>;
}
function HealthForm({ childId,save,busy }: { childId: string; save: Save; busy: boolean }) {
  const { t } = useLocale(); const [kind,setKind] = useState<HealthEntry['kind']>('ALLERGY'); const [title,setTitle] = useState(''); const [body,setBody] = useState(''); const [mobile,setMobile] = useState(''); const [severity,setSeverity] = useState<HealthEntry['severity']>('INFO');
  async function submit(e: FormEvent) { e.preventDefault(); if (await save(`children/${childId}/health-entries`,{ kind,title,body,mobile: kind === 'EMERGENCY_CONTACT' ? mobile : null,severity })) { setTitle(''); setBody(''); setMobile(''); } }
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('safety.addEntry')}</legend>
    <SelectField label={t('safety.kind')} value={kind} onChange={(e) => setKind(e.target.value as HealthEntry['kind'])}>{healthEntryKinds.map((k) => <option key={k} value={k}>{t(`safety.${k}`)}</option>)}</SelectField>
    <TextField label={t('safety.entryTitle')} required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
    {kind === 'EMERGENCY_CONTACT' && <TextField label={t('children.mobile')} type="tel" required minLength={7} maxLength={40} value={mobile} onChange={(e) => setMobile(e.target.value)} />}
    <TextArea label={t('safety.entryBody')} maxLength={1000} value={body} onChange={setBody} />
    <SelectField label={t('safety.severity')} value={severity} onChange={(e) => setSeverity(e.target.value as HealthEntry['severity'])}>{healthSeverities.map((s) => <option key={s} value={s}>{t(`safety.${s}`)}</option>)}</SelectField>
    <Button type="submit">{t('safety.addEntry')}</Button></fieldset></form>;
}
function PersonForm({ childId,save,busy,guardian }: { childId: string; save: Save; busy: boolean; guardian: boolean }) {
  const { t } = useLocale(); const [fullName,setName] = useState(''); const [mobile,setMobile] = useState(''); const [relationship,setRelationship] = useState(''); const [validFrom,setFrom] = useState(cairoIsoDate()); const [oneDay,setOneDay] = useState(true); const [validUntil,setUntil] = useState('');
  async function submit(e: FormEvent) { e.preventDefault(); if (await save(`children/${childId}/pickup-authorizations`,{ fullName,mobile,relationship,validFrom,validUntil: oneDay ? validFrom : validUntil || null })) { setName(''); setMobile(''); setRelationship(''); } }
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('safety.addPerson')}</legend>{guardian && <p>{t('safety.pickupGuardianHelp')}</p>}
    <TextField label={t('children.fullName')} required maxLength={160} value={fullName} onChange={(e) => setName(e.target.value)} />
    <TextField label={t('children.mobile')} type="tel" required minLength={7} maxLength={40} value={mobile} onChange={(e) => setMobile(e.target.value)} />
    <TextField label={t('children.relationship')} required maxLength={80} value={relationship} onChange={(e) => setRelationship(e.target.value)} />
    <TextField label={t('safety.validFrom')} type="date" required value={validFrom} onChange={(e) => setFrom(e.target.value)} />
    <label><input type="checkbox" checked={oneDay} onChange={(e) => setOneDay(e.target.checked)} />{t('safety.oneDay')}</label>
    {!oneDay && <TextField label={t('safety.validUntil')} type="date" value={validUntil} min={validFrom} onChange={(e) => setUntil(e.target.value)} />}
    <Button type="submit">{t('safety.addPerson')}</Button></fieldset></form>;
}
function ReviewForm({ authorization,save,busy }: { authorization: PickupAuthorization; save: Save; busy: boolean }) {
  const { t } = useLocale(); const [note,setNote] = useState('');
  const review = (decision: 'APPROVED' | 'REJECTED') => save(`pickup-authorizations/${authorization.id}/review`,{ expectedVersion: authorization.version,decision,note: note || null });
  return <fieldset disabled={busy} className="organization-fields"><legend>{t('safety.review')}: {authorization.fullName}</legend>{authorization.review && <p>{t(`safety.${authorization.review.decision}`)}{authorization.review.note && ` — ${authorization.review.note}`}</p>}
    <TextField label={t('safety.reviewNote')} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /><Button onClick={() => { void review('APPROVED'); }}>{t('safety.approve')}</Button> <Button variant="danger" onClick={() => { void review('REJECTED'); }}>{t('safety.reject')}</Button></fieldset>;
}
function RestrictionForm({ childId,save,busy }: { childId: string; save: Save; busy: boolean }) {
  const { t } = useLocale(); const [kind,setKind] = useState<typeof pickupRestrictionKinds[number]>('PROHIBITED_COLLECTOR'); const [fullName,setName] = useState(''); const [mobile,setMobile] = useState(''); const [summary,setSummary] = useState(''); const [privateNote,setPrivate] = useState('');
  async function submit(e: FormEvent) { e.preventDefault(); if (await save(`children/${childId}/pickup-restrictions`,{ kind,fullName: fullName || null,mobile: mobile || null,summary,privateNote: privateNote || null })) { setName(''); setMobile(''); setSummary(''); setPrivate(''); } }
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('safety.addRestriction')}</legend>
    <SelectField label={t('safety.kind')} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{pickupRestrictionKinds.map((k) => <option key={k} value={k}>{t(`safety.${k}`)}</option>)}</SelectField>
    {kind === 'PROHIBITED_COLLECTOR' && <><TextField label={t('children.fullName')} required maxLength={160} value={fullName} onChange={(e) => setName(e.target.value)} /><TextField label={t('children.mobile')} type="tel" minLength={7} maxLength={40} value={mobile} onChange={(e) => setMobile(e.target.value)} /></>}
    <TextField label={t('safety.summary')} required maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} />
    <TextArea label={t('safety.privateNote')} maxLength={1000} value={privateNote} onChange={setPrivate} /><p>{t('safety.privateNoteHelp')}</p>
    <Button type="submit">{t('safety.addRestriction')}</Button></fieldset></form>;
}
function ReleaseForm({ view,save,busy }: { view: ChildSafetyView; save: Save; busy: boolean }) {
  const { t } = useLocale(); const [collector,setCollector] = useState(''); const [called,setCalled] = useState(''); const [confirmed,setConfirmed] = useState(false); const [note,setNote] = useState('');
  const pickupGuardians = view.guardians.filter((g) => g.permissions.pickup);
  async function submit(e: FormEvent) {
    e.preventDefault(); const [kind,id] = collector.split(':');
    if (await save(`children/${view.child.id}/pickup-records`,{ collector: kind === 'G' ? { kind: 'GUARDIAN',accountId: id } : { kind: 'AUTHORIZED_PERSON',authorizationId: id },callConfirmed: confirmed,calledGuardianId: called,note: note || null })) { setCollector(''); setConfirmed(false); setNote(''); }
  }
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('safety.record')}</legend><p>{t('safety.recordHelp')}</p>
    <SelectField label={t('safety.collector')} required value={collector} onChange={(e) => setCollector(e.target.value)}><option value="">{t('safety.chooseCollector')}</option>
      {view.pickup!.authorizations.filter((a) => a.active).map((a) => <option key={a.id} value={`A:${a.id}`}>{a.fullName} ({a.relationship}) — {a.blockers.length ? a.blockers.map((b) => t(`safety.blocker.${b}`)).join(', ') : t('safety.permitted')}</option>)}
      {pickupGuardians.map((g) => <option key={g.id} value={`G:${g.id}`}>{g.fullName} ({g.relationship})</option>)}</SelectField>
    <SelectField label={t('safety.calledGuardian')} required value={called} onChange={(e) => setCalled(e.target.value)}><option value="">{t('safety.chooseGuardian')}</option>{pickupGuardians.map((g) => <option key={g.id} value={g.id}>{g.fullName} — {g.mobile}</option>)}</SelectField>
    <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{t('safety.callConfirmed')}</label>
    <TextField label={t('safety.note')} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
    <Button type="submit">{t('safety.record')}</Button></fieldset></form>;
}
function Records({ records }: { records: PickupRecord[] }) {
  const { t } = useLocale(); return <><h3>{t('safety.records')}</h3>{records.length ? <ul>{records.map((r) => <li key={r.id}>{formatDateOnly(r.businessDate)} — {t('safety.collectedBy',{ name: r.collectorName,relationship: r.collectorRelationship,guardian: r.calledGuardianName })}{r.note && ` — ${r.note}`}</li>)}</ul> : <p>{t('safety.none')}</p>}</>;
}
function IncidentList({ incidents,editor }: { incidents: Incident[]; editor?: (incident: Incident) => ReactNode }) {
  const { t } = useLocale(); if (!incidents.length) return <p>{t('safety.none')}</p>;
  return <ul>{incidents.map((i) => <li key={`${i.id}:${i.version}`}><strong>{formatDateOnly(i.occurredOn)} {i.occurredTime}</strong> — {t(`safety.${i.status}`)}<br />{t('safety.description')}: {i.description}<br />{t('safety.actionTaken')}: {i.actionTaken}<br />{i.guardianInformed ? `${t('safety.guardianInformed')} — ${t(`safety.${i.contactMethod!}`)}` : t('safety.notInformed')}{i.followUp && <><br />{t('safety.followUp')}: {i.followUp}</>}{editor?.(i)}</li>)}</ul>;
}
function InformedFields({ informed,setInformed,method,setMethod,followUp,setFollowUp }: { informed: boolean; setInformed: (v: boolean) => void; method: string; setMethod: (v: string) => void; followUp: string; setFollowUp: (v: string) => void }) {
  const { t } = useLocale(); return <>
    <label><input type="checkbox" checked={informed} onChange={(e) => setInformed(e.target.checked)} />{t('safety.guardianInformed')}</label>
    {informed && <SelectField label={t('safety.contactMethod')} required value={method} onChange={(e) => setMethod(e.target.value)}><option value="">{t('safety.contactMethod')}</option>{incidentContactMethods.map((m) => <option key={m} value={m}>{t(`safety.${m}`)}</option>)}</SelectField>}
    <TextArea label={t('safety.followUp')} maxLength={2000} value={followUp} onChange={setFollowUp} /></>;
}
function IncidentForm({ childId,save,busy }: { childId: string; save: Save; busy: boolean }) {
  const { t } = useLocale(); const [occurredOn,setOn] = useState(cairoIsoDate()); const [occurredTime,setTime] = useState(''); const [description,setDescription] = useState(''); const [actionTaken,setAction] = useState(''); const [informed,setInformed] = useState(false); const [method,setMethod] = useState(''); const [followUp,setFollowUp] = useState('');
  async function submit(e: FormEvent) { e.preventDefault(); if (await save(`children/${childId}/incidents`,{ occurredOn,occurredTime,description,actionTaken,guardianInformed: informed,contactMethod: informed ? method || null : null,followUp: followUp || null })) { setDescription(''); setAction(''); setFollowUp(''); setInformed(false); setMethod(''); } }
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('safety.report')}</legend><p>{t('safety.incidentHelp')}</p>
    <TextField label={t('safety.occurredOn')} type="date" required max={cairoIsoDate()} value={occurredOn} onChange={(e) => setOn(e.target.value)} /><TextField label={t('safety.occurredTime')} type="time" required value={occurredTime} onChange={(e) => setTime(e.target.value)} />
    <TextArea label={t('safety.description')} required maxLength={2000} value={description} onChange={setDescription} /><TextArea label={t('safety.actionTaken')} required maxLength={2000} value={actionTaken} onChange={setAction} />
    <InformedFields informed={informed} setInformed={setInformed} method={method} setMethod={setMethod} followUp={followUp} setFollowUp={setFollowUp} />
    <Button type="submit">{t('safety.report')}</Button></fieldset></form>;
}
function IncidentEditor({ incident,save,busy }: { incident: Incident; save: Save; busy: boolean }) {
  const { t } = useLocale(); const [actionTaken,setAction] = useState(incident.actionTaken); const [informed,setInformed] = useState(incident.guardianInformed); const [method,setMethod] = useState(incident.contactMethod ?? ''); const [followUp,setFollowUp] = useState(incident.followUp ?? ''); const [status,setStatus] = useState(incident.status);
  return <form onSubmit={(e) => { e.preventDefault(); void save(`incidents/${incident.id}`,{ expectedVersion: incident.version,actionTaken,guardianInformed: informed,contactMethod: informed ? method || null : null,followUp: followUp || null,status },'PUT'); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('safety.updateIncident')}</legend>
    <TextArea label={t('safety.actionTaken')} required maxLength={2000} value={actionTaken} onChange={setAction} />
    <InformedFields informed={informed} setInformed={setInformed} method={method} setMethod={setMethod} followUp={followUp} setFollowUp={setFollowUp} />
    <SelectField label={t('safety.status')} value={status} onChange={(e) => setStatus(e.target.value as Incident['status'])}>{(['OPEN','CLOSED'] as const).map((s) => <option key={s} value={s}>{t(`safety.${s}`)}</option>)}</SelectField>
    <Button type="submit">{t('safety.updateIncident')}</Button></fieldset></form>;
}

// Staff panel inside the child record. The server decides every section; capabilities only choose which forms render.
export function ChildSafetyPanel({ childId }: { childId: string }) {
  const auth = useAuth(); return safetyCapabilities.some((c) => auth.session?.account.capabilities.includes(c)) ? <StaffSafety childId={childId} /> : null;
}
function StaffSafety({ childId }: { childId: string }) {
  const { t } = useLocale(); const state = useScoped<ChildSafetyView>(`children/${encodeURIComponent(childId)}/safety`); const { save,busy,error,notice } = useSave(state.reload);
  if (state.error) return <p role="alert">{t(state.error)}</p>;
  const view = state.data; if (!view) return <p role="status">{t('state.loading')}</p>;
  const can = (c: string) => view.capabilities.includes(c); const active = view.child.status === 'ACTIVE';
  return <section aria-label={t('safety.title')}><Messages error={error} notice={notice} />
    {view.health && <Card title={t('safety.emergency')}><p>{t('safety.emergencyHelp')}</p>{!view.modules.health && <p role="status">{t('safety.healthDisabled')}</p>}<GuardianContacts guardians={view.guardians} />
      <h3>{t('safety.health')}</h3><p>{t('safety.healthHelp')}</p><HealthList entries={view.health} busy={busy} onRetire={can('health.manage') && view.modules.health ? (h) => { void save(`health-entries/${h.id}/retire`,{ expectedVersion: h.version }); } : undefined} />
      {can('health.manage') && view.modules.health && view.child.status !== 'ARCHIVED' && <HealthForm childId={view.child.id} save={save} busy={busy} />}</Card>}
    {view.pickup && <Card title={t('safety.pickup')}>{!view.modules.pickup && <p role="status">{t('safety.pickupDisabled')}</p>}
      <h3>{t('safety.authorized')}</h3>{view.pickup.authorizations.length ? <ul>{view.pickup.authorizations.map((a) => <li key={`${a.id}:${a.version}`}>{a.fullName} ({a.relationship}) — <span dir="ltr">{a.mobile}</span> — <Validity from={a.validFrom} until={a.validUntil} /> — {a.blockers.length ? a.blockers.map((b) => t(`safety.blocker.${b}`)).join(', ') : t('safety.permitted')}
        {a.review && <> — {t(`safety.${a.review.decision}`)}</>}
        {can('pickup.manage') && view.modules.pickup && a.active && <> <Button variant="secondary" disabled={busy} onClick={() => { void save(`pickup-authorizations/${a.id}/deactivate`,{ expectedVersion: a.version }); }}>{t('safety.deactivate')}</Button><ReviewForm authorization={a} save={save} busy={busy} /></>}</li>)}</ul> : <p>{t('safety.none')}</p>}
      {can('pickup.manage') && view.modules.pickup && active && <PersonForm childId={view.child.id} save={save} busy={busy} guardian={false} />}
      <h3>{t('safety.restrictions')}</h3>{view.pickup.restrictions.length ? <ul>{view.pickup.restrictions.map((r) => <li key={`${r.id}:${r.version}`}>{t(`safety.${r.kind}`)}{r.fullName && ` — ${r.fullName}`}{r.mobile && <> — <span dir="ltr">{r.mobile}</span></>} — {r.summary}{r.privateNote && <> — <em>{r.privateNote}</em></>}{!r.active && <> ({t('safety.ended')})</>}
        {can('pickup.manage') && view.modules.pickup && r.active && <> <Button variant="secondary" disabled={busy} onClick={() => { void save(`pickup-restrictions/${r.id}/deactivate`,{ expectedVersion: r.version }); }}>{t('safety.endRestriction')}</Button></>}</li>)}</ul> : <p>{t('safety.none')}</p>}
      {can('pickup.manage') && view.modules.pickup && view.child.status !== 'ARCHIVED' && <RestrictionForm childId={view.child.id} save={save} busy={busy} />}
      {can('pickup.record') && view.modules.pickup && active && <ReleaseForm view={view} save={save} busy={busy} />}
      <Records records={view.pickup.records} /></Card>}
    {view.incidents && <Card title={t('safety.incidents')}>{!view.modules.incidents && <p role="status">{t('safety.incidentsDisabled')}</p>}
      <IncidentList incidents={view.incidents} editor={can('incidents.manage') && view.modules.incidents ? (i) => <IncidentEditor incident={i} save={save} busy={busy} /> : undefined} />
      {can('incidents.manage') && view.modules.incidents && active && <IncidentForm childId={view.child.id} save={save} busy={busy} />}</Card>}
  </section>;
}
// Guardian panel inside the linked-child screen: sections appear only when the module is enabled and the link permits them.
export function GuardianSafetyPanel({ childId }: { childId: string }) {
  const { t } = useLocale(); const state = useScoped<GuardianSafetyView>(`parent/children/${encodeURIComponent(childId)}/safety`); const { save,busy,error,notice } = useSave(state.reload);
  if (state.error) return <p role="alert">{t(state.error)}</p>;
  const view = state.data; if (!view) return <p role="status">{t('state.loading')}</p>;
  return <section aria-label={t('safety.title')}><Messages error={error} notice={notice} />
    {view.health && <Card title={t('safety.health')}><HealthList entries={view.health} busy={busy} /></Card>}
    {view.pickup && <Card title={t('safety.pickup')}><h3>{t('safety.authorized')}</h3>{view.pickup.authorizations.length ? <ul>{view.pickup.authorizations.map((a) => <li key={`${a.id}:${a.version}`}>{a.fullName} ({a.relationship}) — <span dir="ltr">{a.mobile}</span> — <Validity from={a.validFrom} until={a.validUntil} />{a.pendingNurseryConfirmation && <> — {t('safety.pending')}</>}
      {' '}<Button variant="secondary" disabled={busy} onClick={() => { void save(`pickup-authorizations/${a.id}/deactivate`,{ expectedVersion: a.version }); }}>{t('safety.deactivate')}</Button></li>)}</ul> : <p>{t('safety.none')}</p>}
      <PersonForm childId={childId} save={save} busy={busy} guardian /></Card>}
    {view.incidents && <Card title={t('safety.incidents')}><IncidentList incidents={view.incidents} /></Card>}
  </section>;
}
