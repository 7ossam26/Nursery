import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cairoIsoDate, formatDateOnly } from '@nursery/domain';
import type { ExamCatalogItem, ExamClassroomDraft, ExamDefinition, ExamHistoryEntry, ExamResult, GradeFormat } from '@nursery/contracts';
import { Button, SelectField, TextField } from '../../components/controls.js';
import { LanguageSwitcher } from '../../layout/AppShell.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { errorKey, useScoped } from '../children/scoped.js';

function Frame({ children }: { children: ReactNode }) { const { t }=useLocale(); return <main className="organization-page"><LanguageSwitcher /><Link to="/account">{t('auth.account')}</Link>{children}</main>; }
type Choice={ include: boolean; outcome: 'RESULT' | 'CHILD_ABSENT'; score: string; label: string; comment: string };

function CatalogEditor({ table,items,reload }: { table: 'subjects' | 'exam_types'; items: ExamCatalogItem[]; reload: () => void }) {
  const { t }=useLocale(); const auth=useAuth(); const [name,setName]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState<MessageKey|null>(null);
  const path=table==='subjects' ? 'exams/catalog/subjects' : 'exams/catalog/types';
  async function add(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try { await auth.client.business(path,'POST',{ name,enabled: true }); setName(''); reload(); } catch(caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  async function toggle(item: ExamCatalogItem) { setBusy(true); setError(null); try { await auth.client.business(`${path}/${item.id}`,'PUT',{ expectedVersion: item.version,value: { name: item.name,enabled: !item.enabled } }); reload(); } catch(caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  return <fieldset disabled={busy} className="organization-fields"><legend>{t(table==='subjects' ? 'exams.subjects' : 'exams.types')}</legend>{error && <p role="alert">{t(error)}</p>}
    <ul>{items.map((item) => <li key={item.id}>{item.name}{!item.enabled && ' — ✗'} <Button variant="quiet" onClick={() => { void toggle(item); }}>{item.enabled ? '—' : '+'}</Button></li>)}</ul>
    <form onSubmit={(e) => { void add(e); }}><TextField label={t(table==='subjects' ? 'exams.addSubject' : 'exams.addType')} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /><Button type="submit">{t('exams.save')}</Button></form>
  </fieldset>;
}
function ExamCatalogPanel() {
  const { t }=useLocale(); const state=useScoped<{ subjects: ExamCatalogItem[]; types: ExamCatalogItem[] }>('exams/catalog');
  if (state.error) return <p role="alert">{t(state.error)}</p>; if (!state.data) return null;
  return <details><summary>{t('exams.catalogTitle')}</summary><CatalogEditor table="subjects" items={state.data.subjects} reload={state.reload} /><CatalogEditor table="exam_types" items={state.data.types} reload={state.reload} /></details>;
}

function CreateExam({ classroomId,date,subjects,types,reload }: { classroomId: string; date: string; subjects: ExamCatalogItem[]; types: ExamCatalogItem[]; reload: () => void }) {
  const { t }=useLocale(); const auth=useAuth();
  const [name,setName]=useState(''); const [subjectId,setSubject]=useState(subjects[0]?.id ?? ''); const [typeId,setType]=useState(types[0]?.id ?? '');
  const [gradeFormat,setFormat]=useState<GradeFormat>('NUMERIC'); const [maximumMarks,setMax]=useState('10'); const [decimalAllowed,setDecimal]=useState(false); const [labelText,setLabelText]=useState('');
  const [operationId,setOperation]=useState(crypto.randomUUID()); const [busy,setBusy]=useState(false); const [error,setError]=useState<MessageKey|null>(null);
  const edit=(work: () => void) => { work(); setOperation(crypto.randomUUID()); };
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try {
    const labelOptions=gradeFormat==='LABEL' ? labelText.split(',').map((v) => v.trim()).filter(Boolean) : null;
    await auth.client.business('exams','POST',{ name,subjectId,typeId,classroomId,assessedOn: date,gradeFormat,maximumMarks: gradeFormat==='NUMERIC' ? Number(maximumMarks) : null,decimalAllowed: gradeFormat==='NUMERIC' && decimalAllowed,labelOptions,operationId });
    setName(''); setLabelText(''); setOperation(crypto.randomUUID()); reload();
  } catch(caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  if (!subjects.length || !types.length) return <p>{t('exams.empty')}</p>;
  return <form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('exams.createTitle')}</legend>{error && <p role="alert">{t(error)}</p>}
    <TextField label={t('exams.examName')} required maxLength={160} value={name} onChange={(e) => edit(() => setName(e.target.value))} />
    <SelectField label={t('exams.subject')} value={subjectId} onChange={(e) => edit(() => setSubject(e.target.value))}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
    <SelectField label={t('exams.type')} value={typeId} onChange={(e) => edit(() => setType(e.target.value))}>{types.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
    <SelectField label={t('exams.gradeFormat')} value={gradeFormat} onChange={(e) => edit(() => setFormat(e.target.value as GradeFormat))}><option value="NUMERIC">{t('exams.numeric')}</option><option value="LABEL">{t('exams.label')}</option></SelectField>
    {gradeFormat==='NUMERIC' ? <><TextField label={t('exams.maximumMarks')} type="number" min={1} step={decimalAllowed ? 0.01 : 1} required value={maximumMarks} onChange={(e) => edit(() => setMax(e.target.value))} />
      <label><input type="checkbox" checked={decimalAllowed} onChange={(e) => edit(() => setDecimal(e.target.checked))} />{t('exams.decimalAllowed')}</label></> :
      <TextField label={t('exams.labelOptions')} required value={labelText} onChange={(e) => edit(() => setLabelText(e.target.value))} />}
    <Button type="submit">{t('exams.createAction')}</Button>
  </fieldset></form>;
}

function ResultCorrection({ exam,childId,slotRevision,current,reload }: { exam: ExamDefinition; childId: string; slotRevision: number; current: ExamResult; reload: () => void }) {
  const { t }=useLocale(); const auth=useAuth();
  const [outcome,setOutcome]=useState<Choice['outcome']>(current.outcome); const [score,setScore]=useState(current.score ?? ''); const [label,setLabelValue]=useState(current.label ?? '');
  const [comment,setComment]=useState(current.comment ?? ''); const [reason,setReason]=useState('');
  const [operationId,setOperation]=useState(crypto.randomUUID()); const [busy,setBusy]=useState(false); const [error,setError]=useState<MessageKey|null>(null);
  const edit=(work: () => void) => { work(); setOperation(crypto.randomUUID()); };
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try {
    await auth.client.business('exams/results/corrections','POST',{ examId: exam.id,childId,outcome,score: outcome==='RESULT' && exam.gradeFormat==='NUMERIC' ? Number(score) : null,label: outcome==='RESULT' && exam.gradeFormat==='LABEL' ? label : null,comment: comment || null,expectedVersion: slotRevision,operationId,reason });
    reload();
  } catch(caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  return <details><summary>{t('exams.correct')}</summary><form onSubmit={(e) => { void submit(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('exams.correct')}</legend>{error && <p role="alert">{t(error)}</p>}
    <SelectField label={t('exams.outcome')} value={outcome} onChange={(e) => edit(() => setOutcome(e.target.value as Choice['outcome']))}><option value="RESULT">{t('exams.result')}</option><option value="CHILD_ABSENT">{t('exams.childAbsent')}</option></SelectField>
    {outcome==='RESULT' && (exam.gradeFormat==='NUMERIC' ?
      <TextField label={`${t('exams.score')} (${t('exams.of')} ${exam.maximumMarks})`} type="number" min={0} max={Number(exam.maximumMarks)} step={exam.decimalAllowed ? 0.01 : 1} required value={score} onChange={(e) => edit(() => setScore(e.target.value))} /> :
      <SelectField label={t('exams.label')} required value={label} onChange={(e) => edit(() => setLabelValue(e.target.value))}><option value="">—</option>{exam.labelOptions?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</SelectField>)}
    <TextField label={t('exams.comment')} maxLength={2000} value={comment} onChange={(e) => edit(() => setComment(e.target.value))} />
    <TextField label={t('exams.correctionReason')} required maxLength={500} value={reason} onChange={(e) => edit(() => setReason(e.target.value))} />
    <Button type="submit">{t('exams.correct')}</Button>
  </fieldset></form></details>;
}

function ExamRoster({ examId }: { examId: string }) {
  const { t }=useLocale(); const auth=useAuth(); const state=useScoped<ExamClassroomDraft>(`exams/${examId}/roster`); const draft=state.data;
  const [choices,setChoices]=useState<Record<string,Choice>>({}); const [operationId,setOperation]=useState(crypto.randomUUID()); const [busy,setBusy]=useState(false); const [error,setError]=useState<MessageKey|null>(null); const [saved,setSaved]=useState(false);
  const effective=useMemo(() => draft ? Object.fromEntries(draft.entries.map((entry) => [entry.childId,choices[entry.childId] ?? { include: false,outcome: 'RESULT' as const,score: '',label: draft.exam.labelOptions?.[0] ?? '',comment: '' }])) : {},[draft,choices]);
  const edit=(next: Record<string,Choice>) => { setChoices(next); setOperation(crypto.randomUUID()); setSaved(false); };
  async function publish() { if (!draft) return; setBusy(true); setError(null); try {
    const entries=draft.entries.filter((entry) => !entry.result && effective[entry.childId]?.include).map((entry) => { const choice=effective[entry.childId];
      return { childId: entry.childId,outcome: choice.outcome,score: choice.outcome==='RESULT' && draft.exam.gradeFormat==='NUMERIC' ? Number(choice.score) : null,label: choice.outcome==='RESULT' && draft.exam.gradeFormat==='LABEL' ? choice.label : null,comment: choice.comment || null,expectedVersion: entry.slotRevision }; });
    await auth.client.business('exams/results','POST',{ examId,operationId,entries }); setSaved(true); setChoices({}); state.reload();
  } catch(caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  if (state.error) return <p role="alert">{t(state.error)}</p>; if (!draft) return <p role="status">{t('state.loading')}</p>;
  return <section><h3>{draft.exam.name}</h3><p>{draft.complete} {t('exams.of')} {draft.total}</p><progress aria-label={draft.exam.name} max={draft.total || 1} value={draft.complete} />{error && <p role="alert">{t(error)}</p>}{saved && <p role="status">{t('exams.saved')}</p>}
    {!draft.entries.length ? <p>{t('exams.empty')}</p> : <fieldset disabled={busy} className="organization-fields"><legend>{t('exams.rosterTitle')}</legend><p>{t('exams.reviewHelp')}</p>
      {draft.entries.map((entry) => { const choice=effective[entry.childId]; return <fieldset key={entry.childId} className="organization-fields"><legend>{entry.fullName}</legend>
        {entry.result ? <><strong>{entry.result.outcome==='CHILD_ABSENT' ? t('exams.childAbsent') : draft.exam.gradeFormat==='NUMERIC' ? `${entry.result.score} / ${draft.exam.maximumMarks}` : entry.result.label}</strong>{entry.result.comment && <p>{entry.result.comment}</p>}
          <ResultCorrection exam={draft.exam} childId={entry.childId} slotRevision={entry.slotRevision} current={entry.result} reload={state.reload} /></> :
          <><p>{t('exams.missing')}</p><label><input type="checkbox" checked={choice.include} onChange={(e) => edit({ ...effective,[entry.childId]: { ...choice,include: e.target.checked } })} />{t('exams.include')}</label>
            <SelectField label={t('exams.outcome')} value={choice.outcome} onChange={(e) => edit({ ...effective,[entry.childId]: { ...choice,outcome: e.target.value as Choice['outcome'] } })}><option value="RESULT">{t('exams.result')}</option><option value="CHILD_ABSENT">{t('exams.childAbsent')}</option></SelectField>
            {choice.outcome==='RESULT' && (draft.exam.gradeFormat==='NUMERIC' ?
              <TextField label={`${t('exams.score')} (${t('exams.of')} ${draft.exam.maximumMarks})`} type="number" min={0} max={Number(draft.exam.maximumMarks)} step={draft.exam.decimalAllowed ? 0.01 : 1} value={choice.score} onChange={(e) => edit({ ...effective,[entry.childId]: { ...choice,score: e.target.value } })} /> :
              <SelectField label={t('exams.label')} value={choice.label} onChange={(e) => edit({ ...effective,[entry.childId]: { ...choice,label: e.target.value } })}>{draft.exam.labelOptions?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}</SelectField>)}
            <TextField label={t('exams.comment')} maxLength={2000} value={choice.comment} onChange={(e) => edit({ ...effective,[entry.childId]: { ...choice,comment: e.target.value } })} /></>}
      </fieldset>; })}
      <Button disabled={!draft.entries.some((entry) => !entry.result && effective[entry.childId]?.include)} onClick={() => { void publish(); }}>{t('exams.publish')}</Button>
    </fieldset>}
  </section>;
}

function ClassroomExams({ classroomId,date }: { classroomId: string; date: string }) {
  const { t }=useLocale(); const auth=useAuth();
  const catalog=useScoped<{ subjects: ExamCatalogItem[]; types: ExamCatalogItem[] }>('exams/catalog');
  const examsList=useScoped<ExamDefinition[]>(`exams?classroomId=${classroomId}&date=${date}`);
  const [examId,setExamId]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState<MessageKey|null>(null); const [saved,setSaved]=useState(false); const [operationId,setOperation]=useState(crypto.randomUUID());
  async function noExam() { setBusy(true); setError(null); try { await auth.client.business('exams/no-exam-day','POST',{ classroomId,date,operationId }); setSaved(true); setOperation(crypto.randomUUID()); examsList.reload(); } catch(caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); } }
  const selectedExam=examsList.data?.some((exam) => exam.id===examId) ? examId : examsList.data?.[0]?.id;
  return <section>
    {catalog.data && <CreateExam classroomId={classroomId} date={date} subjects={catalog.data.subjects.filter((s) => s.enabled)} types={catalog.data.types.filter((s) => s.enabled)} reload={examsList.reload} />}
    <h2>{t('exams.listTitle')}</h2>{examsList.error && <p role="alert">{t(examsList.error)}</p>}{error && <p role="alert">{t(error)}</p>}{saved && <p role="status">{t('exams.saved')}</p>}
    {examsList.data?.length ? <><SelectField label={t('exams.listTitle')} value={selectedExam} onChange={(e) => setExamId(e.target.value)}>{examsList.data.map((exam) => <option key={exam.id} value={exam.id}>{exam.name} — {exam.subjectName}</option>)}</SelectField>
      {selectedExam && <ExamRoster key={selectedExam} examId={selectedExam} />}</> :
      <><p>{t('exams.empty')}</p><p>{t('exams.noExamHelp')}</p><Button variant="secondary" disabled={busy} onClick={() => { void noExam(); }}>{t('exams.noExam')}</Button></>}
  </section>;
}

type RosterChild={ id: string; classroomId: string; classroomName: string };
export function TeacherExamsScreen() {
  const { t }=useLocale(); const [date,setDate]=useState(cairoIsoDate()); const roster=useScoped<RosterChild[]>('learning/roster?offset=0');
  const classrooms=roster.data?.filter((child,index,all) => all.findIndex((value) => value.classroomId===child.classroomId)===index) ?? [];
  const [selected,setSelected]=useState(''); const classroomId=classrooms.some((value) => value.classroomId===selected) ? selected : classrooms[0]?.classroomId;
  return <Frame><h1>{t('exams.title')}</h1><ExamCatalogPanel />
    <TextField label={t('exams.date')} type="date" max={cairoIsoDate()} value={date} onChange={(e) => setDate(e.target.value)} />
    {roster.error && <p role="alert">{t(roster.error)}</p>}
    {classrooms.length ? <><SelectField label={t('exams.classroom')} value={classroomId} onChange={(e) => setSelected(e.target.value)}>{classrooms.map((value) => <option key={value.classroomId} value={value.classroomId}>{value.classroomName}</option>)}</SelectField>
      {classroomId && date && <ClassroomExams key={`${classroomId}/${date}`} classroomId={classroomId} date={date} />}</> : <p>{t('exams.empty')}</p>}
  </Frame>;
}

export function GuardianExamHistoryPanel({ childId,date }: { childId: string;date?: string }) {
  const { t }=useLocale(); const [subjectId,setSubjectId]=useState(''); const [typeId,setTypeId]=useState(''); const [from,setFrom]=useState(''); const [until,setUntil]=useState('');
  const catalog=useScoped<{ subjects: ExamCatalogItem[]; types: ExamCatalogItem[] }>('exams/catalog');
  const query=new URLSearchParams({ ...(subjectId ? { subjectId } : {}),...(typeId ? { typeId } : {}),...((date || from) ? { from: date || from } : {}),...((date || until) ? { until: date || until } : {}) }).toString();
  const state=useScoped<{ items: ExamHistoryEntry[]; total: number }>(`exams/children/${childId}/history${query ? `?${query}` : ''}`);
  if (state.error==='learning.disabled') return null;
  return <section><h2>{t(date ? 'exams.title' : 'exams.historyTitle')}</h2>
    {!date && catalog.data && <><SelectField label={t('exams.filterSubject')} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">{t('exams.allSubjects')}</option>{catalog.data.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
      <SelectField label={t('exams.filterType')} value={typeId} onChange={(e) => setTypeId(e.target.value)}><option value="">{t('exams.allTypes')}</option>{catalog.data.types.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField></>}
    {!date && <><TextField label={t('exams.filterFrom')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
    <TextField label={t('exams.filterUntil')} type="date" min={from} value={until} onChange={(e) => setUntil(e.target.value)} /></>}
    {state.error && <p role="alert">{t(state.error)}</p>}
    <ul>{state.data?.items.map((item) => <li key={item.exam.id}>{formatDateOnly(item.exam.assessedOn)} — {item.exam.subjectName} ({item.exam.typeName}): {item.result ? (item.result.outcome==='CHILD_ABSENT' ? t('exams.childAbsent') : item.exam.gradeFormat==='NUMERIC' ? `${item.result.score} / ${item.exam.maximumMarks}` : item.result.label) : t('exams.missing')}{item.result?.comment && ` — ${item.result.comment}`}</li>)}</ul>
  </section>;
}
