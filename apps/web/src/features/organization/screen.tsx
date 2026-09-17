import { PageHeader } from '../../components/data-display.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AgeGroup, Branch, Capability, Classroom, OrganizationContext, Role, StaffAssignment } from '@nursery/contracts';
import { Button, SelectField, TextField } from '../../components/controls.js';
import { Card, Skeleton } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { catalogs, type MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';

type Tab = 'branches' | 'classrooms' | 'age-groups' | 'roles' | 'staff';
type Row = Branch | Classroom | AgeGroup | Role | StaffAssignment;
type Page = { items: Row[]; total: number };
function Choices({ label, options, value, onChange }: { label: string; options: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  return <fieldset className="organization-choices"><legend>{label}</legend>{options.map((option) => <label className="choice-field" key={option.id}><input type="checkbox" checked={value.includes(option.id)} onChange={(e) => onChange(e.target.checked ? [...value,option.id] : value.filter((id) => id !== option.id))} />{option.name}</label>)}</fieldset>;
}
function CatalogForm({ tab, row, context, submit, cancel, busy }: { tab: Exclude<Tab,'staff'>; row: Row | null; context: OrganizationContext; submit: (value: unknown) => void; cancel: () => void; busy: boolean }) {
  const { t } = useLocale();
  const [name,setName] = useState(row && 'name' in row ? row.name : '');
  const [code,setCode] = useState(row && 'code' in row ? row.code : '');
  const [branchId,setBranch] = useState(row && 'branchId' in row ? row.branchId : context.branches[0]?.id ?? '');
  const [ageGroupId,setAge] = useState(row && 'ageGroupId' in row ? row.ageGroupId ?? '' : '');
  const [capacity,setCapacity] = useState(row && 'capacity' in row ? row.capacity : 20);
  const [minMonths,setMin] = useState(row && 'minMonths' in row ? row.minMonths : 0);
  const [maxMonths,setMax] = useState(row && 'maxMonths' in row ? row.maxMonths : 72);
  const [capabilities,setCapabilities] = useState<string[]>(row && 'capabilities' in row ? row.capabilities : []);
  function save(e: FormEvent) { e.preventDefault(); submit(tab === 'roles' ? { name,capabilities } : tab === 'classrooms' ? { code,name,branchId,ageGroupId: ageGroupId || null,capacity } : tab === 'age-groups' ? { code,name,minMonths,maxMonths } : { code,name }); }
  return <form className="form-stack" onSubmit={save} aria-busy={busy}><fieldset disabled={busy} className="organization-fields"><legend>{t(`organization.${tab}`)}</legend>
    <TextField label={t('organization.name')} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
    {tab !== 'roles' && <TextField label={t('organization.code')} value={code} onChange={(e) => setCode(e.target.value)} required maxLength={32} pattern="[A-Za-z0-9_-]+" />}
    {tab === 'classrooms' && <>
      <SelectField label={t('organization.branch')} value={branchId} onChange={(e) => setBranch(e.target.value)} required disabled={Boolean(row)}>{context.branches.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</SelectField>
      <SelectField label={t('organization.ageGroup')} value={ageGroupId} onChange={(e) => setAge(e.target.value)}><option value="">{t('organization.none')}</option>{context.ageGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</SelectField>
      <TextField label={t('organization.capacity')} hint={t('organization.capacityHelp')} type="number" min={1} max={1000} required value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
    </>}
    {tab === 'age-groups' && <><TextField label={t('organization.minMonths')} type="number" required min={0} max={216} value={minMonths} onChange={(e) => setMin(Number(e.target.value))} /><TextField label={t('organization.maxMonths')} type="number" required min={minMonths} max={216} value={maxMonths} onChange={(e) => setMax(Number(e.target.value))} /></>}
    {tab === 'roles' && <Choices label={t('organization.capabilities')} options={context.capabilities.filter((c) => !c.reserved).map((c) => ({ id: c.key,name: t(`organization.cap.${c.key}`) }))} value={capabilities} onChange={setCapabilities} />}
    <div className="action-group"><Button loading={busy} icon="check" type="submit">{t('organization.save')}</Button><Button variant="secondary" onClick={cancel}>{t('organization.cancel')}</Button></div>
  </fieldset></form>;
}
function StaffForm({ row, context, submit, cancel, busy }: { row: StaffAssignment; context: OrganizationContext; submit: (value: unknown, action?: string) => void; cancel: () => void; busy: boolean }) {
  const { t } = useLocale(); const [roleIds,setRoles] = useState(row.roleIds); const [branchIds,setBranches] = useState(row.branchIds); const [classroomIds,setClasses] = useState(row.classroomIds); const [scopeMode,setMode] = useState(row.scopeMode); const [delegation,setDelegation] = useState(row.delegatedRoleIds); const [sensitive,setSensitive] = useState(row.sensitiveFinancialEdit);
  const system = context.account.kind === 'SYSTEM';
  return <div><h2>{row.username}</h2><p>{t('organization.assignmentHelp')}</p>
    <form className="form-stack" onSubmit={(e) => { e.preventDefault(); submit({ expectedVersion: row.version,roleIds,branchIds,classroomIds,scopeMode },'assignments'); }} aria-busy={busy}><fieldset disabled={busy} className="organization-fields"><legend>{t('organization.staff')}</legend>
      <Choices label={t('organization.roles')} options={context.assignableRoles} value={roleIds} onChange={setRoles} />
      <Choices label={t('organization.branches')} options={context.branches} value={branchIds} onChange={(ids) => { setBranches(ids); setClasses(classroomIds.filter((id) => context.classrooms.some((c) => c.id === id && ids.includes(c.branchId)))); }} />
      <SelectField label={t('organization.mode')} value={scopeMode} onChange={(e) => setMode(e.target.value as 'BRANCH' | 'CLASSROOM')}><option value="CLASSROOM">{t('organization.classroomMode')}</option><option value="BRANCH">{t('organization.branchMode')}</option></SelectField>
      <Choices label={t('organization.classrooms')} options={context.classrooms.filter((c) => branchIds.includes(c.branchId)).map((c) => ({ id: c.id,name: `${context.branches.find((b) => b.id === c.branchId)?.code} / ${c.name}` }))} value={classroomIds} onChange={setClasses} />
      <Button loading={busy} icon="check" type="submit">{t('organization.save')}</Button>
    </fieldset></form>
    {system && <><form className="form-stack" onSubmit={(e) => { e.preventDefault(); submit({ expectedVersion: row.version,roleIds: delegation },'delegation'); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('organization.delegation')}</legend><Choices label={t('organization.roles')} options={context.assignableRoles} value={delegation} onChange={setDelegation} /><Button loading={busy} icon="check" type="submit">{t('organization.save')}</Button></fieldset></form>
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); submit({ expectedVersion: row.version,sensitiveFinancialEdit: sensitive },'grant'); }}><fieldset disabled={busy} className="organization-fields"><legend>{t('organization.sensitive')}</legend><p>{t('organization.sensitiveHelp')}</p><label className="choice-field"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />{t('organization.sensitive')}</label><Button loading={busy} icon="check" type="submit">{t('organization.save')}</Button></fieldset></form></>}
    <Button variant="secondary" disabled={busy} onClick={cancel}>{t('organization.cancel')}</Button>
  </div>;
}

export function OrganizationScreen() {
  const auth = useAuth(); const { t } = useLocale(); const [context,setContext] = useState<OrganizationContext | null>(null); const [page,setPage] = useState<Page | null>(null);
  const [tab,setTab] = useState<Tab>('branches'); const [branch,setBranch] = useState(''); const [offset,setOffset] = useState(0); const [editing,setEditing] = useState<{ row: Row | null } | null>(null);
  const [busy,setBusy] = useState(false); const [error,setError] = useState<MessageKey | null>(null); const [notice,setNotice] = useState<MessageKey | null>(null); const [refresh,setRefresh] = useState(0);
  const generation = useRef(0); const policyRevision = useRef<number | undefined>(undefined); const latestAuth = useRef(auth); latestAuth.current = auth;
  useEffect(() => {
    let alive = true; let polling = false;
    const clear = () => { generation.current++; setContext(null); setPage(null); setEditing(null); };
    async function check() {
      if (polling || !alive || document.visibilityState === 'hidden') return;
      polling = true; const started = generation.current;
      try {
        const next = await auth.client.organization<OrganizationContext>('context');
        if (!alive || started !== generation.current) return;
        if (policyRevision.current !== next.account.scope?.revision) {
          const previous = policyRevision.current; policyRevision.current = next.account.scope?.revision;
          generation.current++; setPage(null); setEditing(null); setOffset(0); setBranch('');
          if (previous !== undefined) setNotice('organization.changed');
          setRefresh((v) => v+1);
        }
        setContext(next); setError(null);
      } catch (caught) { if (alive && started === generation.current) { clear(); latestAuth.current.handleError(caught); setError(caught instanceof AuthError && caught.detail.messageKey in catalogs.en ? caught.detail.messageKey as MessageKey : 'auth.networkError'); } }
      finally { polling = false; }
    }
    const visibility = () => { clear(); if (document.visibilityState !== 'hidden') void check(); };
    const focus = () => { clear(); void check(); };
    void check(); const timer = window.setInterval(() => { void check(); },5000);
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',visibility);
    return () => { alive = false; generation.current++; clearInterval(timer); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',visibility); };
  }, [auth.client]);
  const revision = context?.account.scope?.revision;
  useEffect(() => {
    if (!context) return;
    let alive = true; const started = generation.current; setPage(null);
    const allowed = tab !== 'roles' && tab !== 'staff' || context.account.capabilities.includes(tab === 'roles' ? 'roles.define' : 'users.assign_roles');
    if (!allowed) { setTab('branches'); return; }
    const query = new URLSearchParams({ limit: '20',offset: String(offset),...(branch ? { branchId: branch } : {}) });
    void auth.client.organization<Page>(`${tab}?${query}`).then((next) => { if (alive && started === generation.current) setPage(next); }).catch((caught: unknown) => { if (alive && started === generation.current) { setPage(null); latestAuth.current.handleError(caught); setError(caught instanceof AuthError && caught.detail.messageKey in catalogs.en ? caught.detail.messageKey as MessageKey : 'auth.networkError'); } });
    return () => { alive = false; };
    // Context is refreshed every poll; its revision is the relevant dependency for scoped data.
  }, [auth.client,tab,branch,offset,refresh,revision,Boolean(context)]);
  const can = (key: Capability) => context?.account.capabilities.includes(key) ?? false;
  const manager = can('organization.manage') && (context?.account.kind === 'SYSTEM' || context?.account.scope?.mode === 'BRANCH');
  const editable = tab === 'roles' ? can('roles.define') : tab === 'staff' ? can('users.assign_roles') : manager;
  async function save(value: unknown, action?: string) {
    if (!editing) return; setBusy(true); setError(null); setNotice(null);
    const started = generation.current;
    try {
      const row = editing.row; const path = `${tab}${row ? `/${row.id}` : ''}${action ? `/${action}` : ''}`;
      await auth.client.organization(path,row ? 'PUT' : 'POST', row && !action ? { expectedVersion: row.version,value } : value);
      if (started !== generation.current) return;
      setEditing(null); setPage(null); setNotice('organization.saved');
      const next = await auth.client.organization<OrganizationContext>('context');
      if (started !== generation.current) return;
      policyRevision.current = next.account.scope?.revision; setContext(next); setRefresh((v) => v+1);
    } catch (caught) { latestAuth.current.handleError(caught); setError(caught instanceof AuthError && caught.detail.messageKey in catalogs.en ? caught.detail.messageKey as MessageKey : 'auth.networkError'); }
    finally { setBusy(false); }
  }
  return <main className="organization-page"><PageHeader title={t('organization.title')} icon="classroom" actions={context && !editing && editable && tab !== 'staff' && <Button icon="plus" onClick={() => setEditing({ row: null })}>{t('organization.new')}</Button>} />
    {error && <p className="inline-notice inline-notice--danger" role="alert">{t(error)}</p>}{notice && <p className="inline-notice" role="status">{t(notice)}</p>}
    {!context ? <p className="inline-notice" role="status">{t(error ? 'state.noPermissionBody' : 'state.loading')}</p> : <>
      <nav className="action-group" aria-label={t('organization.title')}>{(['branches','classrooms','age-groups','roles','staff'] as const).filter((v) => v !== 'roles' && v !== 'staff' || can(v === 'roles' ? 'roles.define' : 'users.assign_roles')).map((v) => <Button variant={tab === v ? 'primary' : 'secondary'} key={v} aria-pressed={tab === v} onClick={() => { setTab(v); setEditing(null); setOffset(0); setError(null); }}>{t(`organization.${v}`)}</Button>)}</nav>
      <SelectField label={t('organization.scope')} value={branch} onChange={(e) => { generation.current++; setPage(null); setBranch(e.target.value); setOffset(0); setEditing(null); }}><option value="">{t('organization.all')}</option>{context.branches.map((b) => <option value={b.id} key={b.id}>{b.code} — {b.name}</option>)}</SelectField>
      {editing ? <Card>{tab === 'staff' ? <StaffForm row={editing.row as StaffAssignment} context={context} busy={busy} submit={(v,a) => { void save(v,a); }} cancel={() => setEditing(null)} /> : <CatalogForm tab={tab} row={editing.row} context={context} busy={busy} submit={(v) => { void save(v); }} cancel={() => setEditing(null)} />}</Card> : <>
        {page ? <><p>{t('organization.total',{ count: page.total })}</p><div className="organization-records">{page.items.map((row) => <Card key={row.id} title={'username' in row ? row.username : row.name}>
          {'code' in row && <p dir="ltr">{row.code}</p>}{'capacity' in row && <p>{t('organization.capacity')}: {row.capacity}</p>}
          {'capabilities' in row && <ul className="record-list">{row.capabilities.map((c) => <li key={c}>{t(`organization.cap.${c}`)}</li>)}</ul>}
          {editable && (tab !== 'age-groups' || context.account.kind === 'SYSTEM') && <Button icon="edit" variant="secondary" onClick={() => setEditing({ row })}>{t('organization.edit')}</Button>}
        </Card>)}</div><div className="organization-pagination"><Button icon="back" variant="secondary" disabled={!offset} onClick={() => setOffset(offset-20)}>{t('organization.previous')}</Button><Button icon="arrow" variant="secondary" disabled={offset+20 >= page.total} onClick={() => setOffset(offset+20)}>{t('organization.next')}</Button><Button icon="refresh" variant="secondary" onClick={() => { setError(null); setRefresh((v) => v+1); }}>{t('organization.refresh')}</Button></div></> : <Skeleton label={t('state.loading')} />}
      </>}
    </>}
  </main>;
}
