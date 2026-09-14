import { useRef,useState,type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button,SelectField,TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { LanguageSwitcher } from '../../layout/AppShell.js';
import { agreementDraftSchema,type AgreementTerms,type BillingAgreement,type BillingAllocation,type CatchupPreview } from '@nursery/contracts';
import { piastres,formatDateOnly,billingAllocations,cairoIsoDate,egpToPiastres,formatEgp,monthStart,nextMonth } from '@nursery/domain';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';
import { errorKey,useScoped } from '../children/scoped.js';
type Choice={id:string;code:string;name:string};
type Agreement=BillingAgreement&{childNames:Record<string,string>;endedOn:string|null;prices:{effective_from:string;normal_amount:string;agreed_amount:string;allocations:BillingAllocation[]}[];pauses:{from_period:string;until_period:string;reason:string}[]};
type Send=(path:string,body:Record<string,unknown>,done?:()=>void)=>void;
const money=(amount:string)=>formatEgp(piastres(BigInt(amount)));
function Shares({allocations,names}:{allocations:BillingAllocation[];names:Record<string,string>}) {
 return <ul>{allocations.map(s=><li key={s.childId}>{names[s.childId]??s.childId}: <span dir="ltr">{money(s.amount)}</span>{s.installments.length>0&&<ul>{s.installments.map((i,n)=><li key={n}><span dir="ltr">{formatDateOnly(i.dueOn)} — {money(i.amount)}</span></li>)}</ul>}</li>)}</ul>;
}
function DraftForm({initialChildIds,send}:{initialChildIds:string[];send:Send}) {
 const {t}=useLocale();const categories=useScoped<{id:string;name:string;kind:string}[]>('finance/categories');
 const [search,setSearch]=useState(''),[offset,setOffset]=useState(0),[selected,setSelected]=useState<Choice[]|null>(null);
 const choices=useScoped<Choice[]>(`billing/options?search=${encodeURIComponent(search)}&offset=${offset}`);
 const initial=useScoped<Choice[]>(initialChildIds.length?`billing/options?ids=${initialChildIds.join(',')}`:'billing/options?ids=00000000-0000-4000-8000-000000000000');
 const children=selected??initial.data??[];
 const [mode,setMode]=useState<AgreementTerms['mode']>('MONTHLY'),[category,setCategory]=useState(''),[description,setDescription]=useState('');
 const [normal,setNormal]=useState(''),[agreed,setAgreed]=useState(''),[discount,setDiscount]=useState(false);
 const [start,setStart]=useState(cairoIsoDate()),[end,setEnd]=useState(''),[first,setFirst]=useState(cairoIsoDate().slice(0,7)),[day,setDay]=useState('1'),[firstAmount,setFirstAmount]=useState('');
 const [from,setFrom]=useState(''),[until,setUntil]=useState('');
 const [dues,setDues]=useState([{dueOn:cairoIsoDate(),amount:''}]);const [error,setError]=useState(false);
 const filtered=categories.data?.filter(c=>c.kind===(mode==='ADDITIONAL'?'ADDITIONAL':'TUITION'))??[];
 const categoryId=filtered.some(c=>c.id===category)?category:filtered[0]?.id??'';
 function input() {return agreementDraftSchema.parse({operationId:crypto.randomUUID(),terms:{mode,categoryId,description,childIds:children.map(c=>c.id),normalAmount:egpToPiastres(normal),agreedAmount:egpToPiastres(discount&&mode!=='ADDITIONAL'?agreed:normal),startsOn:start,endsOn:end||null,firstAgreedAmount:mode==='MONTHLY'&&firstAmount?egpToPiastres(firstAmount):null,firstPeriod:mode==='MONTHLY'?first+'-01':null,dueDay:mode==='MONTHLY'?Number(day):null,serviceFrom:mode==='MONTHLY'?null:from||null,serviceUntil:mode==='MONTHLY'?null:until||null,installments:mode==='MONTHLY'?[]:dues.map(i=>({dueOn:i.dueOn,amount:egpToPiastres(i.amount)}))}});}
 let preview:BillingAllocation[]=[];let difference:string|null=null;
 try {const v=input();preview=billingAllocations(v.terms);difference=(BigInt(v.terms.normalAmount)-BigInt(v.terms.agreedAmount)).toString();} catch { /* Incomplete drafts do not fabricate totals. */ }
 function submit(e:FormEvent) {e.preventDefault();try {const v=input();setError(false);send('billing/agreements',v);} catch {setError(true);} }
 return <form onSubmit={submit}><fieldset className="organization-fields"><legend>{t('billing.draft')}</legend><p>{t('billing.help')}</p>
 {(categories.error||choices.error||initial.error)&&<p role="alert">{t(categories.error||choices.error||initial.error!)}</p>}{error&&<p role="alert">{t('finance.invalid')}</p>}
 <TextField label={t('children.search')} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}} />
 <SelectField label={t('billing.child')} value="" onChange={e=>{const c=choices.data?.find(c=>c.id===e.target.value);if(c&&!children.some(x=>x.id===c.id)) setSelected([...children,c]);}}><option value="">{t('billing.child')}</option>{choices.data?.map(c=><option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</SelectField>
 <Button onClick={()=>setOffset(offset-20)} disabled={!offset}>{t('hub.previous')}</Button><Button onClick={()=>setOffset(offset+20)} disabled={choices.data?.length!==20}>{t('hub.next')}</Button>
 <p>{t('billing.selected')}</p>{children.map(c=><p key={c.id}>{c.code} — {c.name} <Button onClick={()=>setSelected(children.filter(x=>x.id!==c.id))}>{t('billing.remove')}</Button></p>)}
 <SelectField label={t('billing.mode')} value={mode} onChange={e=>{setMode(e.target.value as AgreementTerms['mode']);setCategory('');setDues([{dueOn:start,amount:''}]);}}>{(['MONTHLY','FIXED','ADDITIONAL'] as const).map(m=><option key={m} value={m}>{t(`billing.${m}`)}</option>)}</SelectField>
 <SelectField label={t('billing.category')} required value={categoryId} onChange={e=>setCategory(e.target.value)}><option value="">{t('billing.category')}</option>{filtered.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
 <TextField label={t('billing.description')} required maxLength={120} value={description} onChange={e=>setDescription(e.target.value)} />
 <TextField label={t(mode==='ADDITIONAL'?'billing.amount':'billing.normal')} required inputMode="decimal" dir="ltr" value={normal} onChange={e=>setNormal(e.target.value)} />
 {mode!=='ADDITIONAL'&&<><Button onClick={()=>{setDiscount(true);setAgreed(normal);}}>{t('billing.addDiscount')}</Button>{discount&&<TextField label={t('billing.agreed')} required inputMode="decimal" dir="ltr" value={agreed} onChange={e=>setAgreed(e.target.value)} />}</>}
 <TextField label={t('billing.start')} type="date" required value={start} onChange={e=>{setStart(e.target.value);setFirst(e.target.value.slice(0,7));}} />
 {mode==='MONTHLY'?<><TextField label={t('billing.firstAmount')} inputMode="decimal" dir="ltr" value={firstAmount} onChange={e=>setFirstAmount(e.target.value)} /><TextField label={t('billing.end')} type="date" value={end} onChange={e=>setEnd(e.target.value)} /><TextField label={t('billing.first')} type="month" required value={first} onChange={e=>setFirst(e.target.value)} /><TextField label={t('billing.day')} type="number" min={1} max={31} required value={day} onChange={e=>setDay(e.target.value)} /></>:<>
 <p>{t(mode==='ADDITIONAL'?'billing.periodHelp':'billing.scheduleHelp')}</p><TextField label={t('billing.from')} type="date" required={mode==='FIXED'} value={from} onChange={e=>setFrom(e.target.value)} /><TextField label={t('billing.until')} type="date" required={mode==='FIXED'} value={until} onChange={e=>setUntil(e.target.value)} />
 <fieldset><legend>{t('billing.installments')}</legend>{dues.map((due,i)=><div key={i}><TextField label={`${t('billing.due')} ${i+1}`} type="date" required value={due.dueOn} onChange={e=>setDues(dues.map((v,n)=>n===i?{...v,dueOn:e.target.value}:v))} /><TextField label={`${t('billing.amount')} ${i+1}`} required inputMode="decimal" dir="ltr" value={due.amount} onChange={e=>setDues(dues.map((v,n)=>n===i?{...v,amount:e.target.value}:v))} />{dues.length>1&&<Button onClick={()=>setDues(dues.filter((_,n)=>n!==i))}>{t('billing.remove')}</Button>}</div>)}{mode==='FIXED'&&<Button disabled={dues.length>=120} onClick={()=>setDues([...dues,{dueOn:start,amount:''}])}>{t('billing.addDue')}</Button>}</fieldset></>}
 {difference!==null&&<><p>{t('billing.discount')}: <span dir="ltr">{money(difference)}</span></p><Shares allocations={preview} names={Object.fromEntries(children.map(c=>[c.id,c.name]))} /></>}
 <Button type="submit">{t('billing.draft')}</Button></fieldset></form>;
}
function AgreementControls({a,send}:{a:Agreement;send:Send}) {
 const {t}=useLocale();const auth=useAuth();const [preview,setPreview]=useState<CatchupPreview|null>(null),[error,setError]=useState<MessageKey|null>(null);
 const [effective,setEffective]=useState(nextMonth(monthStart(cairoIsoDate())).slice(0,7)),[normal,setNormal]=useState(''),[agreed,setAgreed]=useState(''),[reason,setReason]=useState('');
 const [from,setFrom]=useState(effective),[until,setUntil]=useState(effective),[end,setEnd]=useState(cairoIsoDate());
 const action=(kind:string,body:Record<string,unknown>={})=>send(`billing/agreements/${a.id}/${kind}`,{operationId:crypto.randomUUID(),expectedVersion:a.version,...body},()=>setPreview(null));
 return <>{a.status==='DRAFT'?<Button onClick={()=>action('approve')}>{t('billing.approve')}</Button>:a.terms.mode==='MONTHLY'&&<>
 <Button onClick={async()=>{try {setPreview(await auth.client.business<CatchupPreview>(`billing/agreements/${a.id}/catchup`));} catch(e) {auth.handleError(e);setError(errorKey(e));}}}>{t('billing.preview')}</Button>
 {error&&<p role="alert">{t(error)}</p>}{preview&&<>{preview.periods.length?<><p>{t('billing.catchupHelp')}</p>{preview.periods.map(p=><div key={p.period}><p dir="ltr">{formatDateOnly(p.period)}</p><Shares allocations={p.allocations} names={a.childNames} /></div>)}<Button onClick={()=>action('catchup',{previewHash:preview.previewHash})}>{t('billing.catchup')}</Button></>:<p>{t('billing.noCatchup')}</p>}</>}
 {!a.endedOn&&<details><summary>{t('billing.price')} / {t('billing.pause')} / {t('billing.endAction')}</summary><TextField label={t('billing.reason')} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} />
 <form onSubmit={e=>{e.preventDefault();try {action('price',{effectiveFrom:effective+'-01',price:{normalAmount:egpToPiastres(normal),agreedAmount:egpToPiastres(agreed)},reason});} catch {setError('finance.invalid');}}}><TextField label={t('billing.effective')} type="month" required value={effective} onChange={e=>setEffective(e.target.value)} /><TextField label={t('billing.normal')} required value={normal} onChange={e=>setNormal(e.target.value)} /><TextField label={t('billing.agreed')} required value={agreed} onChange={e=>setAgreed(e.target.value)} /><Button type="submit">{t('billing.price')}</Button></form>
 <form onSubmit={e=>{e.preventDefault();action('pause',{from:from+'-01',until:until+'-01',reason});}}><p>{t('billing.pauseHelp')}</p><TextField label={t('billing.pauseFrom')} type="month" required value={from} onChange={e=>setFrom(e.target.value)} /><TextField label={t('billing.pauseUntil')} type="month" required value={until} onChange={e=>setUntil(e.target.value)} /><Button type="submit">{t('billing.pause')}</Button></form>
 <form onSubmit={e=>{e.preventDefault();action('end',{endsOn:end,reason});}}><TextField label={t('billing.endDate')} type="date" required min={cairoIsoDate()} value={end} onChange={e=>setEnd(e.target.value)} /><Button type="submit">{t('billing.endAction')}</Button></form></details>}
 </>}</>;
}
export function BillingWorkspace({initialChildIds=[]}:{initialChildIds?:string[]}) {
 const {t}=useLocale();const auth=useAuth();const [offset,setOffset]=useState(0);const list=useScoped<Agreement[]>(`billing/agreements?limit=20&offset=${offset}`);
 const canManage=auth.session?.account.capabilities.includes('billing.manage');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[canRetry,setCanRetry]=useState(false),[message,setMessage]=useState<MessageKey|null>(null);
 const pending=useRef<{path:string;body:Record<string,unknown>;done?:()=>void}|null>(null);
 const [code,setCode]=useState(''),[name,setName]=useState(''),[kind,setKind]=useState('TUITION'),[catalogRevision,setCatalogRevision]=useState(0);
 function success() {pending.current?.done?.();pending.current=null;setUncertain(false);setCanRetry(false);setMessage('billing.saved');list.reload();}
 async function transmit() {
  if(!pending.current) return;setBusy(true);setMessage(null);
  try {await auth.client.business(pending.current.path,'POST',pending.current.body);success();}
  catch(e) {auth.handleError(e);if(!(e instanceof AuthError)||['INTERNAL_ERROR','DATABASE_UNAVAILABLE'].includes(e.detail.code)) {setUncertain(true);setCanRetry(false);setMessage('finance.uncertain');} else {pending.current=null;setUncertain(false);setMessage(errorKey(e));}}
  finally {setBusy(false);}
 }
 const send:Send=(path,body,done)=>{if(pending.current||busy) return;pending.current={path,body,done};void transmit();};
 async function check() {if(!pending.current) return;setBusy(true);try {const r=await auth.client.business<{status:string}>(`finance/operations/${pending.current.body.operationId}`);if(r.status==='COMMITTED') success();else {setCanRetry(true);setMessage('finance.notFound');}} catch(e) {auth.handleError(e);setMessage(errorKey(e));} finally {setBusy(false);} }
 return <>{(message||list.error)&&<p role="status">{t(message||list.error!)}</p>}{uncertain&&<><Button disabled={busy} onClick={()=>{void check();}}>{t('finance.check')}</Button>{canRetry&&<Button disabled={busy} onClick={()=>{void transmit();}}>{t('finance.retry')}</Button>}</>}
 <fieldset disabled={busy||uncertain} className="organization-fields"><legend>{t('billing.title')}</legend>
 {canManage&&<><details><summary>{t('billing.createCategory')}</summary><form onSubmit={e=>{e.preventDefault();send('finance/categories',{operationId:crypto.randomUUID(),code,name,kind},()=>setCatalogRevision(v=>v+1));}}><TextField label={t('billing.catalogCode')} required maxLength={32} value={code} onChange={e=>setCode(e.target.value)} /><TextField label={t('billing.catalogName')} required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /><SelectField label={t('billing.catalogKind')} value={kind} onChange={e=>setKind(e.target.value)}><option value="TUITION">{t('billing.tuition')}</option><option value="ADDITIONAL">{t('billing.additional')}</option></SelectField><Button type="submit">{t('billing.createCategory')}</Button></form></details><DraftForm key={catalogRevision} initialChildIds={initialChildIds} send={send} /></>}
 {list.data?.length===0&&<p>{t('billing.empty')}</p>}{list.data?.map(a=><Card key={a.id} title={a.terms.description}><p>{t(`billing.${a.status}`)} — {t(`billing.${a.terms.mode}`)}</p><p>{t('billing.discount')}: <span dir="ltr">{money((BigInt(a.terms.normalAmount)-BigInt(a.terms.agreedAmount)).toString())}</span></p><p dir="ltr">{formatDateOnly(a.terms.startsOn)}{a.terms.endsOn&&` – ${formatDateOnly(a.terms.endsOn)}`}</p><Shares allocations={a.allocations} names={a.childNames} />{a.firstAllocations&&<><p>{t('billing.firstAmount')}</p><Shares allocations={a.firstAllocations} names={a.childNames} /></>}{a.endedOn&&<p>{t('billing.ended')} <span dir="ltr">{formatDateOnly(a.endedOn)}</span></p>}
 {a.prices.map(p=><div key={p.effective_from}><p>{t('billing.prices')}: {formatDateOnly(p.effective_from)}</p><Shares allocations={p.allocations} names={a.childNames} /></div>)}{a.pauses.map((p,i)=><p key={i}>{t('billing.pauses')}: {formatDateOnly(p.from_period)} – {formatDateOnly(p.until_period)} — {p.reason}</p>)}
 {canManage&&<AgreementControls a={a} send={send} />}</Card>)}
 <Button disabled={!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button disabled={list.data?.length!==20} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button><Button onClick={()=>list.reload()}>{t('children.refresh')}</Button>
 </fieldset></>;
}
export function BillingScreen() {const {t}=useLocale();return <main className="organization-page"><LanguageSwitcher /><Link to="/account">{t('auth.account')}</Link><h1>{t('billing.title')}</h1><BillingWorkspace /></main>;}


