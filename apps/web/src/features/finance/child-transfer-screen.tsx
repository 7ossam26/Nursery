import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Child,ChildrenOptions,ChildTransferPreview,ChildTransferPage } from '@nursery/contracts';
import { cairoIsoDate,formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import { Button,SelectField,TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { errorKey,useScoped } from '../children/scoped.js';
import { useAuth } from '../auth/AuthProvider.js';
import { useFinancialOperation } from './use-operation.js';
import { OperationNotice } from './spending-screen.js';
import type { MessageKey } from '../../i18n/catalogs.js';
const money=(v:string)=>formatEgp(piastres(BigInt(v)));

export function ChildTransferHistory({childId,branchId='',refresh=0}:{childId?:string;branchId?:string;refresh?:number}) {
 const {t}=useLocale(),[offset,setOffset]=useState(0);
 const path=childId?`parent/children/${childId}/branch-transfers`:'finance/child-transfers';
 const history=useScoped<ChildTransferPage>(`${path}?limit=20&offset=${offset}${branchId?`&branchId=${branchId}`:''}`);
 const reload=useRef(history.reload);reload.current=history.reload;useEffect(()=>{reload.current();},[refresh]);
 return <section><h2>{t('childTransfer.history')}</h2>{history.error&&<p role="alert">{t(history.error)}</p>}{history.data&&<>
 {branchId&&<><p>{t('childTransfer.in')}: {money(history.data.totalIn)}</p><p>{t('childTransfer.out')}: {money(history.data.totalOut)}</p></>}
 {!history.data.items.length&&<p>{t('childTransfer.empty')}</p>}{history.data.items.map(row=><Card key={row.id} title={`${row.childCode} — ${row.childName}`}><p>{row.sourceBranchCode} → {row.destinationBranchCode} · {formatDateOnly(row.effectiveOn)}</p><p>{t('childTransfer.amount')}: {money(row.amount)}</p><p>{row.reason}</p>{!childId&&<p>{row.actor}</p>}{row.items.map(item=><p key={item.installmentId}>{item.categoryName} · {formatDateOnly(item.dueOn)} · {money(item.remaining)}<br/>{t('childTransfer.reference')}: <bdi>{item.obligationId}</bdi></p>)}</Card>)}
 <Button disabled={!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button disabled={offset+20>=history.data.totalCount} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></>}</section>;
}
export function ChildTransferScreen() {
 const {t}=useLocale(),auth=useAuth(),options=useScoped<ChildrenOptions>('children/options');
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[childId,setChildId]=useState(''),[destination,setDestination]=useState(''),[classroom,setClassroom]=useState(''),[reason,setReason]=useState(''),[branch,setBranch]=useState(''),[refresh,setRefresh]=useState(0);
 const children=useScoped<{items:Child[];total:number}>(`children?search=${encodeURIComponent(search)}&limit=20&offset=${offset}`),child=children.data?.items.find(c=>c.id===childId);
 const [preview,setPreview]=useState<ChildTransferPreview|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<MessageKey|null>(null);const generation=useRef(0);
 const op=useFinancialOperation(()=>{setPreview(null);setConfirmed(false);children.reload();setRefresh(r=>r+1);});
 const locked=op.locked||busy,canTransfer=options.data?.integration.finance.enabled&&['children.manage','billing.manage','finance.read'].every(c=>options.data?.capabilities.includes(c));
 useEffect(()=>{generation.current++;setPreview(null);setConfirmed(false);},[childId,child?.version,child?.branchId,destination,classroom]);
 useEffect(()=>{const clear=()=>{generation.current++;setPreview(null);setConfirmed(false);};window.addEventListener('blur',clear);window.addEventListener('nursery:scope-refresh',clear);document.addEventListener('visibilitychange',clear);return()=>{generation.current++;window.removeEventListener('blur',clear);window.removeEventListener('nursery:scope-refresh',clear);document.removeEventListener('visibilitychange',clear);};},[]);
 const input=()=>({childId:child!.id,sourceBranchId:child!.branchId,destinationBranchId:destination,destinationClassroomId:classroom||null,effectiveOn:cairoIsoDate(),expectedVersion:child!.version});
 async function review(e:FormEvent){e.preventDefault();if(!child||locked)return;const current=++generation.current;setBusy(true);setError(null);setPreview(null);try{const result=await auth.client.business<ChildTransferPreview>('finance/child-transfers/preview','POST',input());if(current===generation.current)setPreview(result);}catch(caught){auth.handleError(caught);setError(errorKey(caught));}finally{setBusy(false);}}
 function commit(e:FormEvent){e.preventDefault();if(!child||!preview||!confirmed||locked)return;op.submit(`children/${child.id}/branch-transfers`,{...input(),reason});}
 const name=(id:string)=>options.data?.branches.find(b=>b.id===id)?.name||id;
 return <main className="organization-page"><Link to="/administration/collections">{t('collections.title')}</Link><h1>{t('childTransfer.title')}</h1><p>{t('childTransfer.help')}</p><OperationNotice op={op}/>{(error||options.error||children.error)&&<p role="alert">{t(error||options.error||children.error!)}</p>}
 {canTransfer&&<><fieldset className="organization-fields" disabled={locked}><TextField label={t('children.search')} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);setChildId('');}}/><SelectField label={t('hub.child')} value={childId} onChange={e=>setChildId(e.target.value)}><option value="">{t('childTransfer.choose')}</option>{children.data?.items.filter(c=>c.status!=='ARCHIVED').map(c=><option key={c.id} value={c.id}>{c.code} — {c.fullName}</option>)}</SelectField><Button disabled={!offset} onClick={()=>{setOffset(offset-20);setChildId('');}}>{t('hub.previous')}</Button><Button disabled={!children.data||offset+20>=children.data.total} onClick={()=>{setOffset(offset+20);setChildId('');}}>{t('hub.next')}</Button></fieldset>
 {child&&<form onSubmit={review}><fieldset className="organization-fields" disabled={locked}><legend>{t('childTransfer.preview')}</legend><p>{t('childTransfer.source')}: {name(child.branchId)}</p><SelectField label={t('childTransfer.destination')} required value={destination} onChange={e=>{setDestination(e.target.value);setClassroom('');}}><option value="">{t('finance.branch')}</option>{options.data!.branches.filter(b=>b.id!==child.branchId).map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</SelectField><SelectField label={t('childTransfer.classroom')} value={classroom} onChange={e=>setClassroom(e.target.value)}><option value="">{t('childTransfer.none')}</option>{options.data!.classrooms.filter(c=>c.branchId===destination).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</SelectField><p>{t('childTransfer.today')} {formatDateOnly(cairoIsoDate())}</p><Button type="submit" disabled={!destination}>{t('childTransfer.preview')}</Button></fieldset></form>}
 {preview&&child&&<form onSubmit={commit}><fieldset className="organization-fields" disabled={locked}><legend>{t('childTransfer.review')}</legend><p>{preview.childName} · {name(preview.sourceBranchId)} → {name(preview.destinationBranchId)}</p><p>{t('childTransfer.amount')}: <bdi>{money(preview.amount)}</bdi></p>{preview.items.map(i=><p key={i.installmentId}>{i.categoryName} · {formatDateOnly(i.dueOn)} · {money(i.remaining)}<br/>{t('childTransfer.reference')}: <bdi>{i.obligationId}</bdi></p>)}{preview.warnings.map(w=><p key={w}>{t(w as MessageKey)}</p>)}<TextField label={t('spending.reason')} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/><label><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('childTransfer.confirm')}</label><Button type="submit" disabled={!confirmed}>{t('childTransfer.commit')}</Button></fieldset></form>}</>}
 {options.data&&<SelectField label={t('finance.branch')} value={branch} onChange={e=>setBranch(e.target.value)}><option value="">{t('collections.all')}</option>{options.data.branches.map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</SelectField>}<ChildTransferHistory key={branch} branchId={branch} refresh={refresh}/></main>;
}
