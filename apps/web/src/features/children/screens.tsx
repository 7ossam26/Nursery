import { BillingWorkspace } from '../finance/billing-screen.js';
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { errorKey, useScoped } from './scoped.js';
import { ChildSafetyPanel, GuardianSafetyPanel } from '../safety/screens.js';
import { Link, useParams,useSearchParams } from 'react-router';
import { ParentFrame } from '../communication/screens.js';
import { onboardingInputSchema, learningDateSchema, defaultLinkPermissions, MAX_DOCUMENT_BYTES, type Child, type ChildDetail, type ChildrenOptions, type GuardianOption, type GuardianLink, type GuardianChild, type GuardianChildDetail, type LinkPermissions, type OnboardingInput, type OnboardingResult } from '@nursery/contracts';
import { Button, SelectField, TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { cairoIsoDate,formatDateOnly } from '@nursery/domain';
import { DailyLearningPanel } from '../learning/screens.js';
import { GuardianAttendancePanel } from '../attendance/screens.js';
import { GuardianExamHistoryPanel } from '../exams/screens.js';
import { GuardianHomeworkHistoryPanel } from '../homework/screens.js';

function Frame({ children }: { children: ReactNode }) { const { t } = useLocale(); return <main className="organization-page"><header><h1>{t('children.title')}</h1></header>{children}</main>; }
function Permissions({ value,onChange }: { value: LinkPermissions; onChange: (v: LinkPermissions) => void }) {
  const { t } = useLocale(); return <fieldset className="organization-choices"><legend>{t('children.guardians')}</legend>{(['read','finance','pickup','notify'] as const).map((key) => <label key={key}><input type="checkbox" checked={value[key]} onChange={(e) => onChange({ ...value,[key]: e.target.checked })} />{t(`children.${key}`)}</label>)}</fieldset>;
}
function Contacts({ value,onChange }: { value: OnboardingInput['children'][number]['child']['contacts']; onChange: (v: OnboardingInput['children'][number]['child']['contacts']) => void }) {
  const { t } = useLocale(); return <fieldset className="organization-fields"><legend>{t('children.contacts')}</legend>{value.map((c,i) => <fieldset className="organization-fields" key={i}><legend>{t('children.contacts')} {i+1}</legend>
    <TextField label={t('children.fullName')} required maxLength={160} value={c.fullName} onChange={(e) => onChange(value.map((v,n) => n===i ? { ...v,fullName: e.target.value } : v))} />
    <TextField label={t('children.mobile')} type="tel" required maxLength={40} value={c.mobile} onChange={(e) => onChange(value.map((v,n) => n===i ? { ...v,mobile: e.target.value } : v))} />
    <TextField label={t('children.relationship')} required maxLength={80} value={c.relationship} onChange={(e) => onChange(value.map((v,n) => n===i ? { ...v,relationship: e.target.value } : v))} />
    <Button variant="secondary" onClick={() => onChange(value.filter((_,n) => n!==i))}>{t('children.remove')}</Button>
  </fieldset>)}<Button variant="secondary" disabled={value.length>=10} onClick={() => onChange([...value,{ fullName: '',mobile: '',relationship: '' }])}>{t('children.addContact')}</Button></fieldset>;
}
function Placement({ child,options,onChange }: { child: OnboardingInput['children'][number]['child']; options: ChildrenOptions; onChange: (v: typeof child) => void }) {
  const { t } = useLocale(); return <>
    <SelectField label={t('children.branch')} required value={child.branchId} onChange={(e) => onChange({ ...child,branchId: e.target.value,classroomId: null })}><option value="">{t('children.branch')}</option>{options.branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</SelectField>
    <SelectField label={t('children.classroom')} hint={t('children.classroomHelp')} value={child.classroomId ?? ''} onChange={(e) => onChange({ ...child,classroomId: e.target.value || null })}><option value="">{t('children.unassigned')}</option>{options.classrooms.filter((c) => c.branchId===child.branchId).map((c) => <option key={c.id} value={c.id}>{c.name} — {t('children.occupancy',{ count: c.occupancy,capacity: c.capacity })}</option>)}</SelectField>
  </>;
}
function GuardianPicker({ value,onChange,onSelect }: { value: string; onChange: (id: string) => void; onSelect?: (guardian: GuardianOption) => void }) {
  const { t } = useLocale(); const [search,setSearch] = useState(''); const state = useScoped<{ items: GuardianOption[]; total: number }>(`guardians?search=${encodeURIComponent(search)}&limit=100`);
  return <><TextField label={t('children.guardianSearch')} value={search} maxLength={100} onChange={(e) => setSearch(e.target.value)} />
    {state.error && <p role="alert">{t(state.error)}</p>}<SelectField label={t('children.chooseGuardian')} required value={value} onChange={(e) => { const found = state.data?.items.find((g) => g.id===e.target.value); onChange(e.target.value); if (found) onSelect?.(found); }}><option value="">{t('children.chooseGuardian')}</option>{state.data?.items.map((g) => <option key={g.id} value={g.id}>{g.fullName} — {g.username}</option>)}</SelectField>
  </>;
}
function Onboarding({ options,done,cancel }: { options: ChildrenOptions; done: (result: OnboardingResult) => void; cancel: () => void }) {
  const auth = useAuth(); const { t } = useLocale();
  const newChild = (): OnboardingInput['children'][number] => ({ child: { code: '',fullName: '',birthDate: '',branchId: options.branches[0]?.id ?? '',classroomId: null,contacts: [] },links: [{ guardianIndex: 0,relationship: '',permissions: { ...defaultLinkPermissions } }] });
  const canProvision = options.capabilities.includes('users.create_parent');
  const blankGuardian = (): OnboardingInput['guardians'][number] => canProvision ? { kind: 'NEW',username: '',profile: { fullName: '',mobile: '' } } : { kind: 'EXISTING',accountId: '' };
  const [guardians,setGuardians] = useState<OnboardingInput['guardians']>([blankGuardian()]);
  const [children,setChildren] = useState<OnboardingInput['children']>([newChild()]); const [step,setStep] = useState(0); const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null);
  const operation = useRef(crypto.randomUUID());
  function changeGuardian(i: number,g: OnboardingInput['guardians'][number]) { setGuardians(guardians.map((v,n) => n===i ? g : v)); operation.current = crypto.randomUUID(); }
  function changeChild(i: number,c: OnboardingInput['children'][number]) { setChildren(children.map((v,n) => n===i ? c : v)); operation.current = crypto.randomUUID(); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (step===0) { setStep(1); return; }
    const parsed = onboardingInputSchema.safeParse({ operationId: operation.current,guardians,children });
    if (!parsed.success) { setError('children.invalid'); return; }
    if (step===1) { setStep(2); return; }
    setBusy(true);
    try { done(await auth.client.business<OnboardingResult>('children/onboarding','POST',parsed.data)); }
    catch (caught) { setError(errorKey(caught)); auth.handleError(caught); }
    finally { setBusy(false); }
  }
  return <Card title={t('children.onboard')}><p>{t('children.initialPasswordHelp')}</p><p>{t('children.noLaterSteps')}</p>{error && <p role="alert">{t(error)}</p>}
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy} className="organization-fields"><legend>{t(step===0 ? 'children.parents' : step===1 ? 'children.childFields' : 'children.review')}</legend>
      {step===0 && <>{guardians.map((g,i) => <fieldset key={i} className="organization-fields"><legend>{t('children.parents')} {i+1}</legend>
        <SelectField label={t('children.kind')} value={g.kind} onChange={(e) => changeGuardian(i,e.target.value==='NEW' ? { kind: 'NEW',username: '',profile: { fullName: '',mobile: '' } } : { kind: 'EXISTING',accountId: '' })}><option value="NEW" disabled={!canProvision}>{t('children.newGuardian')}</option><option value="EXISTING">{t('children.existingGuardian')}</option></SelectField>
        {g.kind==='NEW' ? <><TextField label={t('children.fullName')} value={g.profile.fullName} required maxLength={160} onChange={(e) => changeGuardian(i,{ ...g,profile: { ...g.profile,fullName: e.target.value } })} /><TextField label={t('children.mobile')} value={g.profile.mobile} type="tel" required minLength={7} maxLength={40} onChange={(e) => changeGuardian(i,{ ...g,profile: { ...g.profile,mobile: e.target.value } })} /><TextField label={t('children.username')} required maxLength={64} value={g.username} onChange={(e) => changeGuardian(i,{ ...g,username: e.target.value })} /></> : <><GuardianPicker value={g.accountId} onChange={(id) => changeGuardian(i,{ kind: 'EXISTING',accountId: id })} onSelect={(target) => changeGuardian(i,target.mobile ? { kind: 'EXISTING',accountId: target.id } : { kind: 'EXISTING',accountId: target.id,profile: { fullName: '',mobile: '' } })} />{g.profile && <><TextField label={t('children.fullName')} required maxLength={160} value={g.profile.fullName} onChange={(e) => changeGuardian(i,{ ...g,profile: { fullName: e.target.value,mobile: g.profile!.mobile } })} /><TextField label={t('children.mobile')} required minLength={7} maxLength={40} value={g.profile.mobile} onChange={(e) => changeGuardian(i,{ ...g,profile: { fullName: g.profile!.fullName,mobile: e.target.value } })} /></>}</>}
      </fieldset>)}<Button variant="secondary" disabled={guardians.length>=4} onClick={() => { setGuardians([...guardians,blankGuardian()]); operation.current=crypto.randomUUID(); }}>{t('children.addGuardian')}</Button></>}
      {step===1 && <>{children.map((c,i) => <fieldset className="organization-fields" key={i}><legend>{t('children.childFields')} {i+1}</legend>
        <TextField label={t('children.fullName')} required maxLength={160} value={c.child.fullName} onChange={(e) => changeChild(i,{ ...c,child: { ...c.child,fullName: e.target.value } })} />
        <TextField label={t('children.code')} required maxLength={32} pattern="[A-Za-z0-9_-]+" value={c.child.code} onChange={(e) => changeChild(i,{ ...c,child: { ...c.child,code: e.target.value } })} />
        <TextField label={t('children.birthDate')} type="date" required value={c.child.birthDate} onChange={(e) => changeChild(i,{ ...c,child: { ...c.child,birthDate: e.target.value } })} />
        <Placement child={c.child} options={options} onChange={(v) => changeChild(i,{ ...c,child: v })} />
        <Contacts value={c.child.contacts} onChange={(v) => changeChild(i,{ ...c,child: { ...c.child,contacts: v } })} />
        {guardians.map((g,n) => { const link = c.links.find((l) => l.guardianIndex===n); return <fieldset className="organization-fields" key={n}><legend>{g.kind==='NEW' ? g.profile.fullName : `${t('children.parents')} ${n+1}`}</legend>
          <label><input type="checkbox" checked={Boolean(link)} onChange={(e) => changeChild(i,{ ...c,links: e.target.checked ? [...c.links,{ guardianIndex: n,relationship: '',permissions: { ...defaultLinkPermissions } }] : c.links.filter((l) => l.guardianIndex!==n) })} />{t('children.link')}</label>
          {link && <><TextField label={t('children.relationship')} required maxLength={80} value={link.relationship} onChange={(e) => changeChild(i,{ ...c,links: c.links.map((l) => l===link ? { ...l,relationship: e.target.value } : l) })} /><Permissions value={link.permissions} onChange={(v) => changeChild(i,{ ...c,links: c.links.map((l) => l===link ? { ...l,permissions: v } : l) })} /></>}
        </fieldset>; })}
        {children.length>1 && <Button variant="secondary" onClick={() => { setChildren(children.filter((_,n) => n!==i)); operation.current=crypto.randomUUID(); }}>{t('children.remove')}</Button>}
      </fieldset>)}<Button variant="secondary" disabled={children.length>=10} onClick={() => { setChildren([...children,newChild()]); operation.current=crypto.randomUUID(); }}>{t('children.addChild')}</Button></>}
      {step===2 && <><ul>{guardians.map((g,i) => <li key={i}>{g.kind==='NEW' ? `${g.profile.fullName} — ${g.username}` : g.accountId}</li>)}</ul><ul>{children.map((c,i) => <li key={i}>{c.child.fullName} — {c.child.code} — {options.branches.find((b) => b.id===c.child.branchId)?.name} — {options.classrooms.find((cl) => cl.id===c.child.classroomId)?.name ?? t('children.unassigned')}</li>)}</ul></>}
      <Button type="submit">{t(step===2 ? 'children.review' : 'children.next')}</Button>{step>0 && <Button variant="secondary" onClick={() => setStep(step-1)}>{t('children.back')}</Button>}<Button variant="secondary" onClick={cancel}>{t('organization.cancel')}</Button>
    </fieldset></form>
  </Card>;
}

export function ChildrenScreen() {
  const { t } = useLocale(); const [search,setSearch] = useState(''); const [branch,setBranch] = useState(''); const [status,setStatus] = useState(''); const [offset,setOffset] = useState(0); const [creating,setCreating] = useState(false); const [result,setResult] = useState<OnboardingResult | null>(null);
  const options = useScoped<ChildrenOptions>('children/options'); const page = useScoped<{ items: Child[]; total: number }>(`children?${new URLSearchParams({ search,limit: '20',offset: String(offset),...(branch ? { branchId: branch } : {}),...(status ? { status } : {}) })}`);
  useEffect(() => { if (options.error || page.error) { setResult(null); setCreating(false); } },[options.error,page.error]);
  useEffect(() => { const clear = () => { setResult(null); setCreating(false); }; window.addEventListener('blur',clear); document.addEventListener('visibilitychange',clear); return () => { window.removeEventListener('blur',clear); document.removeEventListener('visibilitychange',clear); }; },[]);
  const canCreate = options.data && ['children.manage','guardians.manage'].every((c) => options.data!.capabilities.includes(c));
  return <Frame>{(options.error || page.error) && <p role="alert">{t(options.error ?? page.error!)}</p>}
    {result && <Card title={t(result.replayed ? 'children.replayed' : 'children.created')}>
      {result.warnings.length>0 && <p role="status">{t('children.capacityWarning')}</p>}
      {result.credentials.length>0 && <><h2>{t('children.credentials')}</h2><p>{t('children.credentialsHelp')}</p>{result.credentials.map((c) => <p key={c.id}>{c.username}: <code className="auth-temporary" dir="ltr">{c.temporaryPassword}</code></p>)}<Button onClick={() => setResult(null)}>{t('children.dismiss')}</Button></>}
      {options.data?.integration.finance.enabled && options.data.capabilities.includes('billing.manage') && <section><h2>{t('billing.onboarding')}</h2><p>{t('billing.onboardingHelp')}</p><BillingWorkspace initialChildIds={result.childIds} /></section>}
      {options.data?.integration.finance.enabled && options.data.capabilities.includes('payments.record') && options.data.capabilities.includes('finance.read') && <section><h2>{t('collections.initial')}</h2><p>{t('collections.initialHelp')}</p>{result.childIds.map((id,index)=><Link key={id} to={`/administration/collections?childId=${id}`}>{t('collections.initial')} — {index+1}</Link>)}</section>}
      {options.data?.integration.transport.enabled && options.data.capabilities.includes('transport.manage') && <section><h2>{t('transport.onboarding')}</h2><p>{t('transport.onboardingHelp')}</p>{result.childIds.map((id,index)=><Link key={id} to={`/administration/transport?childId=${id}`}>{t('transport.openSetup')} — {index+1}</Link>)}</section>}
      {result.childIds.map((id) => <Link key={id} to={`/administration/children/${id}`}>{t('children.open')}</Link>)}
    </Card>}
    {options.data && page.data ? <>
      {creating && canCreate ? <Onboarding options={options.data} cancel={() => setCreating(false)} done={(v) => { setResult(v); setCreating(false); page.reload(); options.reload(); }} /> : <>
        {canCreate && <Button onClick={() => { setResult(null); setCreating(true); }}>{t('children.onboard')}</Button>}
        <TextField label={t('children.search')} maxLength={100} value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        <SelectField label={t('children.branch')} value={branch} onChange={(e) => { setBranch(e.target.value); setOffset(0); }}><option value="">{t('children.all')}</option>{options.data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectField>
        <SelectField label={t('children.status')} value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="">{t('children.all')}</option>{(['ACTIVE','PAUSED','ARCHIVED'] as const).map((s) => <option key={s} value={s}>{t(`children.${s}`)}</option>)}</SelectField>
        <p>{t('children.count',{ count: page.data.total })}</p><div className="organization-records">{page.data.items.map((c) => <Card key={c.id} title={c.fullName}><p>{c.code} — {t(`children.${c.status}`)}</p><Link to={`/administration/children/${c.id}`}>{t('children.open')}</Link></Card>)}</div>
        <div className="organization-pagination"><Button disabled={!offset} onClick={() => setOffset(offset-20)}>{t('children.previous')}</Button><Button disabled={offset+20>=page.data.total} onClick={() => setOffset(offset+20)}>{t('children.nextPage')}</Button><Button onClick={() => { page.reload(); options.reload(); }}>{t('children.refresh')}</Button></div>
      </>}
    </> : <p role="status">{t('state.loading')}</p>}
  </Frame>;
}

function LinkEditor({ link,child,save,busy }: { link?: GuardianLink; child: Child; save: (path: string,value: unknown) => Promise<void>; busy: boolean }) {
  const { t } = useLocale(); const [id,setId] = useState(link?.id ?? ''); const [relationship,setRelationship] = useState(link?.relationship ?? ''); const [permissions,setPermissions] = useState(link?.permissions ?? { ...defaultLinkPermissions }); const [active,setActive] = useState(link?.active ?? true);
  return <form onSubmit={(e) => { e.preventDefault(); void save(`children/${child.id}/guardian-links`,{ expectedChildVersion: child.version,accountId: id,relationship,permissions,active }); }}><fieldset disabled={busy} className="organization-fields"><legend>{link?.fullName ?? t('children.addGuardian')}</legend>
    {!link && <GuardianPicker value={id} onChange={setId} />}<TextField label={t('children.relationship')} required maxLength={80} value={relationship} onChange={(e) => setRelationship(e.target.value)} /><Permissions value={permissions} onChange={setPermissions} /><label><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{t('children.activeLink')}</label><Button type="submit">{t('children.saveLink')}</Button>
  </fieldset></form>;
}
function GuardianProfileEditor({ guardian,save,busy }: { guardian: GuardianLink; save: (path: string,value: unknown) => Promise<void>; busy: boolean }) {
  const { t } = useLocale(); const [fullName,setName] = useState(guardian.fullName); const [mobile,setMobile] = useState(guardian.mobile);
  return <form onSubmit={(e) => { e.preventDefault(); void save(`guardians/${guardian.id}`,{ expectedVersion: guardian.version,profile: { fullName,mobile } }); }}><fieldset disabled={busy} className="organization-fields"><legend>{guardian.username}</legend><TextField label={t('children.fullName')} required maxLength={160} value={fullName} onChange={(e) => setName(e.target.value)} /><TextField label={t('children.mobile')} required minLength={7} maxLength={40} value={mobile} onChange={(e) => setMobile(e.target.value)} /><Button type="submit">{t('children.save')}</Button></fieldset></form>;
}
function ChildEditor({ detail,options,reload }: { detail: ChildDetail; options: ChildrenOptions; reload: () => void }) {
  const auth = useAuth(); const { t } = useLocale(); const child = detail.child;
  const [fullName,setName] = useState(child.fullName); const [birthDate,setBirth] = useState(child.birthDate); const [contacts,setContacts] = useState(detail.contacts);
  const [status,setStatus] = useState<Child['status']>(child.status==='ACTIVE' ? 'PAUSED' : 'ACTIVE'); const [reason,setReason] = useState(''); const [message,setMessage] = useState(child.publicMessage ?? ''); const [classroom,setClassroom] = useState(child.classroomId ?? ''); const [moveReason,setMoveReason] = useState('');
  const [docName,setDocName] = useState(''); const [expiry,setExpiry] = useState(''); const [file,setFile] = useState<File | null>(null); const fileInput = useRef<HTMLInputElement | null>(null); const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null); const [notice,setNotice] = useState<MessageKey | null>(null);
  const can = (cap: string) => options.capabilities.includes(cap);
  async function save(path: string,value: unknown,method = 'PUT') {
    setBusy(true); setError(null); setNotice(null);
    try { const result = await auth.client.business<{ warnings?: string[] } | undefined>(path,method,value); setNotice(result?.warnings?.length ? 'children.capacityWarning' : 'children.saved'); reload(); }
    catch (caught) { setError(errorKey(caught)); auth.handleError(caught); } finally { setBusy(false); }
  }
  async function upload(e: FormEvent) {
    e.preventDefault(); if (!file || file.size>MAX_DOCUMENT_BYTES || !['application/pdf','image/png','image/jpeg'].includes(file.type)) { setError('children.invalidDocument'); return; }
    try {
      const base64 = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      await save(`children/${child.id}/documents`,{ name: docName,expiresOn: expiry || null,mimeType: file.type,contentBase64: base64 },'POST');
    } catch { setError('children.invalidDocument'); }
    finally { setFile(null); if (fileInput.current) fileInput.current.value=''; }
  }
  return <>{error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}
    <Card title={child.fullName}><p>{child.code} — {t(`children.${child.status}`)}</p><p>{formatDateOnly(child.birthDate)}</p></Card>
    {can('children.manage') && <>
      <Card title={t('children.edit')}><form onSubmit={(e) => { e.preventDefault(); void save(`children/${child.id}`,{ expectedVersion: child.version,fullName,birthDate,contacts }); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('children.childFields')}</legend><TextField label={t('children.fullName')} value={fullName} required maxLength={160} onChange={(e) => setName(e.target.value)} /><TextField label={t('children.birthDate')} type="date" value={birthDate} required onChange={(e) => setBirth(e.target.value)} /><Contacts value={contacts} onChange={setContacts} /><Button type="submit">{t('children.save')}</Button></fieldset></form></Card>
      {child.status!=='ARCHIVED' && <><Card title={t('children.lifecycle')}><p>{t('children.lifecycleHelp')}</p><form onSubmit={(e) => { e.preventDefault(); void save(`children/${child.id}/lifecycle`,{ expectedVersion: child.version,status,reason,publicMessage: message || null },'POST'); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('children.lifecycle')}</legend><SelectField label={t('children.status')} value={status} onChange={(e) => setStatus(e.target.value as Child['status'])}>{(['ACTIVE','PAUSED','ARCHIVED'] as const).filter((s) => s!==child.status).map((s) => <option key={s} value={s}>{t(`children.${s}`)}</option>)}</SelectField><TextField label={t('children.reason')} value={reason} required maxLength={500} onChange={(e) => setReason(e.target.value)} /><TextField label={t('children.publicMessage')} value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} /><Button type="submit">{t('children.lifecycle')}</Button></fieldset></form></Card>
        <Card title={t('children.move')}><form onSubmit={(e) => { e.preventDefault(); void save(`children/${child.id}/classroom-moves`,{ expectedVersion: child.version,classroomId: classroom || null,reason: moveReason },'POST'); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('children.move')}</legend><SelectField label={t('children.classroom')} value={classroom} onChange={(e) => setClassroom(e.target.value)}><option value="">{t('children.unassigned')}</option>{options.classrooms.filter((c) => c.branchId===child.branchId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField><TextField label={t('children.reason')} required maxLength={500} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} /><Button type="submit">{t('children.move')}</Button></fieldset></form></Card></>}
    </>}
    <Card title={t('children.history')}><ul>{detail.statusHistory.map((h,i) => <li key={i}>{formatDateOnly(h.effectiveOn)} — {h.newStatus in { ACTIVE: 1,PAUSED: 1,ARCHIVED: 1 } ? t(`children.${h.newStatus as Child['status']}`) : h.newStatus} — {h.reason}</li>)}</ul></Card>
    <Card title={t('children.classHistory')}><ul>{detail.classroomHistory.map((h,i) => <li key={i}>{formatDateOnly(h.effectiveOn)} — {options.classrooms.find((c) => c.id===h.classroomId)?.name ?? t('children.unassigned')} — {h.reason}</li>)}</ul></Card>
    {can('guardians.manage') && <Card title={t('children.guardians')}>{detail.guardians.map((l) => <div key={`${l.id}:${l.version}`}><GuardianProfileEditor guardian={l} save={save} busy={busy} /><LinkEditor link={l} child={child} save={save} busy={busy} /></div>)}<LinkEditor child={child} save={save} busy={busy} /></Card>}
    {can('documents.manage') && <Card title={t('children.documents')}><p>{t('children.fileHelp')}</p><ul>{detail.documents.map((d) => <li key={d.id}>{d.name} {d.expiresOn && `— ${formatDateOnly(d.expiresOn)}`} <a href={`/api/v1/child-documents/${d.id}/download`}>{t('children.download')}</a> <Button variant="secondary" disabled={busy} onClick={() => { void save(`child-documents/${d.id}/retire`,{},'POST'); }}>{t('children.retire')}</Button></li>)}</ul>
      <form onSubmit={(e) => { void upload(e); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('children.upload')}</legend><TextField label={t('children.documentName')} required maxLength={160} value={docName} onChange={(e) => setDocName(e.target.value)} /><TextField label={t('children.expiry')} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /><label>{t('children.file')}<input type="file" ref={fileInput} accept="application/pdf,image/png,image/jpeg" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label><Button type="submit">{t('children.upload')}</Button></fieldset></form>
    </Card>}
  </>;
}
export function ChildDetailScreen() {
  const { id } = useParams(); const { t } = useLocale(); const state = useScoped<ChildDetail>(`children/${encodeURIComponent(id ?? '')}`); const options = useScoped<ChildrenOptions>('children/options');
  return <Frame><Link to="/administration/children">{t('children.back')}</Link>{(state.error || options.error) && <p role="alert">{t(state.error ?? options.error!)}</p>}{state.data && options.data ? <><ChildEditor key={`${state.data.child.id}:${state.data.child.version}`} detail={state.data} options={options.data} reload={() => { state.reload(); options.reload(); }} /><ChildSafetyPanel childId={state.data.child.id} /></> : <p role="status">{t('state.loading')}</p>}</Frame>;
}
export function GuardianChildrenScreen() {
  const { t } = useLocale(); const state = useScoped<GuardianChild[]>('parent/children');
  return <ParentFrame>{state.error && <p role="alert">{t(state.error)}</p>}{state.data ? <>{!state.data.length && <p>{t('children.noChildren')}</p>}<div className="organization-records">{state.data.map((c) => <Card key={c.id} title={c.fullName}>{c.status==='PAUSED' ? <p>{c.publicMessage || t('children.contactNursery')}</p> : <Link to={`/parent/children/${c.id}`}>{t('children.open')}</Link>}</Card>)}</div></> : <p role="status">{t('state.loading')}</p>}</ParentFrame>;
}
export function GuardianChildScreen() {
  const { id } = useParams(); const [query]=useSearchParams(); const date=learningDateSchema.safeParse({ date: query.get('date') }); const { t } = useLocale(); const state = useScoped<GuardianChildDetail>(`parent/children/${encodeURIComponent(id ?? '')}`);
  return <ParentFrame><Link to="/parent/children">{t('children.back')}</Link>{state.error && <p role="alert">{t(state.error)}</p>}{state.data ? <><Card title={state.data.child.fullName}><p>{formatDateOnly(state.data.child.birthDate)}</p></Card>{date.success && date.data.date<=cairoIsoDate() && <DailyLearningPanel key={`${state.data.child.id}/${date.data.date}`} childId={state.data.child.id} date={date.data.date} guardian />}<GuardianAttendancePanel childId={state.data.child.id} /><GuardianExamHistoryPanel childId={state.data.child.id} /><GuardianHomeworkHistoryPanel childId={state.data.child.id} /><GuardianSafetyPanel childId={state.data.child.id} /></> : <p role="status">{t('state.loading')}</p>}</ParentFrame>;
}
