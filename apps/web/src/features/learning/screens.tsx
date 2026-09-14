import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cairoIsoDate, formatDateOnly } from '@nursery/domain';
import { checkpointIcons, progressMeanings, statusThemes, type CheckpointConfiguration, type CheckpointDefinition, type CheckpointStatus, type DailyLearning, type DailySlot, type LearningEvent } from '@nursery/contracts';
import { Button, SelectField, TextField } from '../../components/controls.js';
import { Icon } from '../../components/Icon.js';
import { LanguageSwitcher } from '../../layout/AppShell.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { errorKey, useScoped } from '../children/scoped.js';

function Frame({ children }: { children: ReactNode }) { const { t } = useLocale(); return <main className="organization-page"><LanguageSwitcher /><Link to="/account">{t('auth.account')}</Link>{children}</main>; }
function newStatus(order: number,meaning: CheckpointStatus['meaning'] = 'PENDING'): CheckpointStatus { return { id: crypto.randomUUID(),label: { en: meaning==='PENDING' ? 'Pending' : meaning==='RESOLVED' ? 'Recorded' : 'Not applicable','ar-EG': meaning==='PENDING' ? 'لسه مستني' : meaning==='RESOLVED' ? 'اتسجل' : 'مش مطلوب' },order,enabled: true,meaning,theme: 'neutral',outcome: null }; }
function newDefinition(order: number): CheckpointDefinition { return { id: crypto.randomUUID(),kind: 'STATUS_NOTE',label: { en: 'New checkpoint','ar-EG': 'متابعة جديدة' },icon: 'learning',order,enabled: true,enabledFrom: null,enabledUntil: null,statuses: progressMeanings.map((meaning,i) => newStatus(i,meaning)) }; }
function Labels({ value,onChange }: { value: CheckpointStatus['label']; onChange: (v: CheckpointStatus['label']) => void }) {
  const { t } = useLocale(); return <><TextField label={t('learning.nameEn')} value={value.en} maxLength={120} required onChange={(e) => onChange({ ...value,en: e.target.value })} /><TextField label={t('learning.nameAr')} dir="rtl" value={value['ar-EG']} maxLength={120} required onChange={(e) => onChange({ ...value,'ar-EG': e.target.value })} /></>;
}
function ConfigurationEditor({ initial,reload }: { initial: CheckpointConfiguration; reload: () => void }) {
  const { t,locale } = useLocale(); const auth = useAuth(); const [definitions,setDefinitions] = useState(initial.definitions); const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null);
  const change = (index: number,d: CheckpointDefinition) => setDefinitions((old) => old.map((v,i) => i===index ? d : v));
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try { await auth.client.business('learning/configuration','PUT',{ expectedVersion: initial.version,definitions }); reload(); } catch (caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  return <form onSubmit={(e) => { void submit(e); }}><p>{t('learning.nextDay')}</p><p>{t('learning.effective')}: {formatDateOnly(initial.effectiveOn)}</p><p>{t('learning.retireHelp')}</p>{error && <p role="alert">{t(error)}</p>}
    <fieldset disabled={busy}><legend>{t('learning.configuration')}</legend>{definitions.map((d,i) => <fieldset key={d.id} className="organization-fields"><legend>{d.label[locale]}</legend>
      <Labels value={d.label} onChange={(label) => change(i,{ ...d,label })} /><TextField label={t('learning.order')} type="number" min={0} max={1000} value={d.order} onChange={(e) => change(i,{ ...d,order: Number(e.target.value) })} />
      <SelectField label={t('learning.icon')} value={d.icon} onChange={(e) => change(i,{ ...d,icon: e.target.value as CheckpointDefinition['icon'] })}>{checkpointIcons.map((k) => <option key={k} value={k}>{t(`learning.${k}`)}</option>)}</SelectField>
      <label><input type="checkbox" checked={d.enabled} onChange={(e) => change(i,{ ...d,enabled: e.target.checked })} />{t('learning.enabled')}</label>
      <TextField label={t('learning.from')} type="date" value={d.enabledFrom ?? ''} onChange={(e) => change(i,{ ...d,enabledFrom: e.target.value || null })} /><TextField label={t('learning.until')} type="date" value={d.enabledUntil ?? ''} min={d.enabledFrom ?? undefined} onChange={(e) => change(i,{ ...d,enabledUntil: e.target.value || null })} />
      {d.statuses.map((s,j) => { const statusChange = (next: CheckpointStatus) => change(i,{ ...d,statuses: d.statuses.map((old,n) => n===j ? next : old) }); const saved = initial.definitions.some((old) => old.statuses.some((v) => v.id===s.id)); return <fieldset key={s.id} className="organization-fields"><legend>{t('learning.status')}: {s.label[locale]}</legend>
        <Labels value={s.label} onChange={(label) => statusChange({ ...s,label })} /><TextField label={t('learning.order')} type="number" min={0} max={1000} value={s.order} onChange={(e) => statusChange({ ...s,order: Number(e.target.value) })} />
        <SelectField label={t('learning.meaning')} disabled={saved} value={s.meaning} onChange={(e) => statusChange({ ...s,meaning: e.target.value as CheckpointStatus['meaning'] })}>{progressMeanings.map((m) => <option key={m} value={m}>{t(`learning.${m}`)}</option>)}</SelectField>
        <SelectField label={t('learning.theme')} value={s.theme} onChange={(e) => statusChange({ ...s,theme: e.target.value as CheckpointStatus['theme'] })}>{statusThemes.map((m) => <option key={m} value={m}>{t(`learning.${m}`)}</option>)}</SelectField>
        <label><input type="checkbox" checked={s.enabled} disabled={s.outcome!==null} onChange={(e) => statusChange({ ...s,enabled: e.target.checked })} />{t('learning.enabled')}</label>
      </fieldset>; })}<Button variant="secondary" onClick={() => change(i,{ ...d,statuses: [...d.statuses,newStatus(d.statuses.length)] })}>{t('learning.addStatus')}</Button>
    </fieldset>)}<Button variant="secondary" onClick={() => setDefinitions((old) => [...old,newDefinition(old.length)])}>{t('learning.add')}</Button> <Button type="submit">{t('learning.save')}</Button></fieldset></form>;
}
export function LearningConfigurationScreen() {
  const { t } = useLocale(); const state = useScoped<CheckpointConfiguration>('learning/configuration');
  return <Frame><h1>{t('learning.configuration')}</h1>{state.error && <p role="alert">{t(state.error)}</p>}{state.data && <ConfigurationEditor key={state.data.version} initial={state.data} reload={state.reload} />}</Frame>;
}
function PublicationForm({ slot,view,reload }: { slot: DailySlot; view: DailyLearning; reload: () => void }) {
  const { t,locale } = useLocale(); const auth = useAuth(); const [statusId,setStatus] = useState(slot.status.id); const [note,setNote] = useState(slot.event?.note ?? ''); const [reason,setReason] = useState(''); const [action,setAction] = useState(slot.event ? 'corrections' : 'publications');
  const [operationId,setOperation] = useState(crypto.randomUUID()); const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null);
  function edit(work: () => void) { work(); setOperation(crypto.randomUUID()); }
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try {
    await auth.client.business(`learning/${action}`,'POST',{ childId: view.childId,date: view.date,definitionId: slot.definition.id,statusId,note: (action==='transitions' ? slot.event?.note : note) || null,expectedVersion: slot.event?.revision ?? 0,operationId,...(action==='corrections' ? { reason } : {}) }); reload();
  } catch (caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{slot.definition.label[locale]}</legend>{error && <p role="alert">{t(error)}</p>}
    {slot.event && <SelectField label={t('learning.action')} value={action} onChange={(e) => edit(() => setAction(e.target.value))}><option value="corrections">{t('learning.correct')}</option><option value="transitions">{t('learning.transition')}</option></SelectField>}
    <SelectField label={t('learning.status')} value={statusId} onChange={(e) => edit(() => setStatus(e.target.value))}>{slot.definition.statuses.filter((s) => s.enabled).sort((a,b) => a.order-b.order || a.id.localeCompare(b.id)).map((s) => <option key={s.id} value={s.id}>{s.label[locale]} — {t(`learning.${s.meaning}`)}</option>)}</SelectField>
    <TextField label={t('learning.note')} value={action==='transitions' ? slot.event?.note ?? '' : note} disabled={action==='transitions'} maxLength={2000} onChange={(e) => edit(() => setNote(e.target.value))} />
    {action==='corrections' && <TextField label={t('learning.reason')} required maxLength={500} value={reason} onChange={(e) => edit(() => setReason(e.target.value))} />}
    <p>{t('learning.uncertain')}</p><Button type="submit">{t(action==='corrections' ? 'learning.correct' : action==='transitions' ? 'learning.transition' : 'learning.publish')}</Button>
  </fieldset></form>;
}
function PublicationHistory({ childId,date,slot }: { childId: string; date: string; slot: DailySlot }) {
  const { t,locale } = useLocale(); const state = useScoped<LearningEvent[]>(`learning/children/${childId}/history?date=${date}&definitionId=${slot.definition.id}`);
  return <details><summary>{t('learning.history')} — {slot.definition.label[locale]}</summary>{state.error && <p role="alert">{t(state.error)}</p>}<ol>{state.data?.map((e) => <li key={e.id}>{slot.definition.statuses.find((s) => s.id===e.statusId)?.label[locale]}{e.note && ` — ${e.note}`}{e.reason && ` — ${t('learning.reason')}: ${e.reason}`}</li>)}</ol></details>;
}
export function DailyLearningPanel({ childId,date = cairoIsoDate(),guardian = false }: { childId: string; date?: string; guardian?: boolean }) {
  const { t,locale } = useLocale(); const state = useScoped<DailyLearning>(`learning/children/${childId}/daily?date=${date}`); const view = state.data;
  return <section><h2>{t('learning.title')} — {formatDateOnly(date)}</h2>{state.error && <p role="alert">{t(state.error)}</p>}{view && <>{view.progress.hidden ? <p>{t('learning.off')}</p> : <><p>{t('learning.progress',{ completed: view.progress.completed,total: view.progress.total })}</p><progress aria-label={t('learning.title')} max={view.progress.total} value={view.progress.completed} /><ul className="learning-slots">{view.slots.map((s) => <li key={s.definition.id} className={`learning-status learning-status--${s.status.theme}`}><Icon name={s.definition.icon} /><strong>{s.definition.label[locale]}</strong>: {s.homework?.future && !s.homework.due ? t('homework.future') : s.status.label[locale]} — {t(`learning.${s.homework?.meaning ?? s.status.meaning}`)}{s.homework?.due && <p>{t('homework.dueCounts',{ missing: s.homework.missing,due: s.homework.due })}</p>}{!s.event && !s.homework?.reported && ` (${t('learning.pending')})`}{s.event?.note && <p>{s.event.note}</p>}</li>)}</ul></>}
    {!guardian && view.slots.map((slot) => <div key={slot.definition.id}>{view.canPublish && slot.definition.kind==='STATUS_NOTE' && <PublicationForm key={`${view.snapshotId}:${slot.definition.id}:${slot.event?.revision ?? 0}`} slot={slot} view={view} reload={state.reload} />}{slot.event && <PublicationHistory childId={childId} date={date} slot={slot} />}</div>)}</>}</section>;
}
type RosterChild = { id: string; fullName: string; classroomId: string; classroomName: string };
function ClassroomPublisher({ children,date }: { children: RosterChild[]; date: string }) {
  const auth = useAuth(); const { t,locale } = useLocale(); const [classroomId,setClassroom] = useState(children[0]?.classroomId ?? '');
  const [views,setViews] = useState<DailyLearning[] | null>(null); const [definitionId,setDefinition] = useState(''); const [choices,setChoices] = useState<Record<string,{ include: boolean; statusId: string; note: string }>>({});
  const [operationId,setOperation] = useState(crypto.randomUUID()); const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null); const [saved,setSaved] = useState(false);
  async function prepare() { setBusy(true); setError(null); setSaved(false); try { const data: DailyLearning[] = []; for (const c of children.filter((c) => c.classroomId===classroomId)) data.push(await auth.client.business<DailyLearning>(`learning/children/${c.id}/daily?date=${date}`)); setViews(data); setDefinition(''); setChoices({}); } catch (caught) { setViews(null); setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  const definitions = views?.flatMap((v) => v.slots.filter((s) => s.definition.kind==='STATUS_NOTE').map((s) => s.definition)).filter((d,i,all) => all.findIndex((v) => v.id===d.id)===i) ?? [];
  const eligible = views?.filter((v) => v.canPublish && v.slots.some((s) => s.definition.id===definitionId && !s.event)) ?? [];
  function chooseDefinition(id: string) { setDefinition(id); setOperation(crypto.randomUUID()); setChoices(Object.fromEntries((views ?? []).map((v) => { const slot = v.slots.find((s) => s.definition.id===id); return [v.childId,{ include: true,statusId: slot?.status.id ?? '',note: '' }]; }))); }
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try { await auth.client.business('learning/classroom-publications','POST',{ classroomId,operationId,entries: eligible.filter((v) => choices[v.childId]?.include).map((v) => ({ childId: v.childId,date,definitionId,statusId: choices[v.childId].statusId,note: choices[v.childId].note || null,expectedVersion: 0 })) }); setSaved(true); setViews(null); } catch (caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  return <section><h2>{t('learning.batch')}</h2><p>{t('learning.exceptionHelp')}</p>{error && <p role="alert">{t(error)}</p>}{saved && <p role="status">{t('learning.saved')}</p>}<fieldset disabled={busy} className="organization-fields"><legend>{t('learning.classroom')}</legend>
    <SelectField label={t('learning.classroom')} value={classroomId} onChange={(e) => { setClassroom(e.target.value); setViews(null); }}>{children.filter((c,i) => children.findIndex((v) => v.classroomId===c.classroomId)===i).map((c) => <option key={c.classroomId} value={c.classroomId}>{c.classroomName}</option>)}</SelectField><Button onClick={() => { void prepare(); }}>{t('learning.prepare')}</Button>
    {views && <form onSubmit={(e) => { void submit(e); }}><SelectField label={t('learning.configuration')} value={definitionId} onChange={(e) => chooseDefinition(e.target.value)}><option value="">—</option>{definitions.map((d) => <option key={d.id} value={d.id}>{d.label[locale]}</option>)}</SelectField>
      {eligible.map((v) => { const slot = v.slots.find((s) => s.definition.id===definitionId)!; const choice = choices[v.childId]; if (!choice) return null; const change = (next: typeof choice) => { setChoices((old) => ({ ...old,[v.childId]: next })); setOperation(crypto.randomUUID()); }; return <fieldset key={v.childId} className="organization-fields"><legend>{children.find((c) => c.id===v.childId)?.fullName}</legend>
        <label><input type="checkbox" checked={choice.include} onChange={(e) => change({ ...choice,include: e.target.checked })} />{t('learning.include')}</label><SelectField label={t('learning.status')} value={choice.statusId} onChange={(e) => change({ ...choice,statusId: e.target.value })}>{slot.definition.statuses.filter((s) => s.enabled).map((s) => <option key={s.id} value={s.id}>{s.label[locale]} — {t(`learning.${s.meaning}`)}</option>)}</SelectField><TextField label={t('learning.note')} maxLength={2000} value={choice.note} onChange={(e) => change({ ...choice,note: e.target.value })} />
      </fieldset>; })}<Button type="submit" disabled={!eligible.some((v) => choices[v.childId]?.include)}>{t('learning.batch')}</Button></form>}
  </fieldset></section>;
}
export function TeacherLearningScreen() {
  const { t } = useLocale(); const [offset,setOffset] = useState(0); const roster = useScoped<RosterChild[]>(`learning/roster?offset=${offset}`); const [childId,setChild] = useState(''); const [date,setDate] = useState(cairoIsoDate());
  const access = useScoped<{ modules: string[]; canPublish: boolean; scopeRevision: number }>('learning/context');
  const selected = roster.data?.find((c) => c.id===childId)?.id ?? roster.data?.[0]?.id;
  return <Frame><h1>{t('learning.title')}</h1>{roster.error && <p role="alert">{t(roster.error)}</p>}<TextField label={t('learning.date')} type="date" max={cairoIsoDate()} value={date} required onChange={(e) => setDate(e.target.value)} />
    {roster.data?.length ? <><SelectField label={t('learning.child')} value={selected} onChange={(e) => setChild(e.target.value)}>{roster.data.map((c) => <option key={c.id} value={c.id}>{c.fullName} — {c.classroomName}</option>)}</SelectField>{selected && date && <DailyLearningPanel key={`${selected}/${date}`} childId={selected} date={date} />}</> : <p>{t('learning.empty')}</p>}
    <Button disabled={offset===0} onClick={() => setOffset((v) => Math.max(0,v-100))}>{t('learning.previous')}</Button><Button disabled={roster.data?.length!==100} onClick={() => setOffset((v) => v+100)}>{t('learning.more')}</Button>
    {!!roster.data?.length && date && access.data?.canPublish && access.data.modules.includes('CUSTOM_CHECKPOINTS') && <ClassroomPublisher key={`${date}/${offset}/${access.data.scopeRevision}/${access.data.modules.join(',')}/${roster.data.map((c) => c.id).join(',')}`} children={roster.data} date={date} />}
  </Frame>;
}
