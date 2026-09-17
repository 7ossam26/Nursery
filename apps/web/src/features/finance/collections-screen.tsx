import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Link,useSearchParams } from 'react-router';
import type { CollectionInput,CreditReceiptInput,CollectionOptions,OutstandingItem,OutstandingPage,PaymentResult,Receipt } from '@nursery/contracts';
import { cairoIsoDate,egpToPiastres,formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import { Button,DateField,SelectField,TextField } from '../../components/controls.js';
import { Card, Skeleton } from '../../components/surfaces.js';
import { StatCard,StatGrid, PageHeader, EmptyState , Badge } from '../../components/data-display.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';
import { errorKey,useScoped } from '../children/scoped.js';
import { connectivity } from '../connectivity/bus.js';
import { ReceiptCard } from './receipt-card.js';

const money=(amount:string)=>formatEgp(piastres(BigInt(amount)));
type CollectionResult=PaymentResult|{receiptId:string;creditId:string}|{notices:number};
export function CollectionsScreen() {
 const [query]=useSearchParams();const childId=query.get('childId');
 const {t}=useLocale(),auth=useAuth();const options=useScoped<CollectionOptions>('finance/collection-options');
 const [filters,setFilters]=useState({branchId:'',classroomId:'',categoryId:'',status:'',timing:''}),[offset,setOffset]=useState(0);
 const params=new URLSearchParams({limit:'20',offset:String(offset)});for(const [key,value] of Object.entries(filters)) if(value) params.set(key,value);
 if(childId) params.set('childId',childId);
 const balances=useScoped<OutstandingPage>(`finance/outstanding?${params}`);
 const [selected,setSelected]=useState<{item:OutstandingItem;amount:string}[]>([]),[destinations,setDestinations]=useState<Record<string,string>>({});
 const [payer,setPayer]=useState(''),[external,setExternal]=useState(''),[date,setDate]=useState(cairoIsoDate()),[confirmed,setConfirmed]=useState(false);
 const [credit,setCredit]=useState(false),[creditReason,setCreditReason]=useState('');
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[canRetry,setCanRetry]=useState(false),[message,setMessage]=useState<MessageKey|null>(null),[receiptIds,setReceiptIds]=useState<string[]>([]);
 const pending=useRef<{path:string;input:CollectionInput|CreditReceiptInput|{operationId:string};kind:'COLLECT'|'CREDIT_RECEIPT'|'REMINDER_RESEND'}|null>(null);const locked=busy||uncertain;
 useEffect(()=>{
  const clear=()=>{setSelected([]);setReceiptIds([]);setConfirmed(false);};
  window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);window.addEventListener('nursery:scope-refresh',clear);
  return()=>{window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);window.removeEventListener('nursery:scope-refresh',clear);};
 },[]);
 useEffect(()=>{
  if(selected.length&&(options.error==='auth.forbidden'||(options.data&&(!options.data.canCollect||selected.some(({item})=>!options.data!.branches.some(b=>b.id===item.branchId)||(options.data!.scopeMode==='CLASSROOM'&&!options.data!.classrooms.some(c=>c.id===item.classroomId))))))) {setSelected([]);setReceiptIds([]);setConfirmed(false);}
 },[options.data,options.error,selected]);
 function saved(result:CollectionResult) {if(pending.current?.kind==='COLLECT'||pending.current?.kind==='CREDIT_RECEIPT') {setReceiptIds(pending.current.kind==='COLLECT'?(result as PaymentResult).receiptIds:[(result as {receiptId:string}).receiptId]);setSelected([]);setConfirmed(false);setMessage(pending.current.kind==='COLLECT'?'collections.saved':'collections.creditSaved');}else setMessage('collections.reminded');pending.current=null;setUncertain(false);setCanRetry(false);balances.reload();}
 async function send() {
  if(!pending.current) return;setBusy(true);setMessage(null);
  try {saved(await auth.client.business<CollectionResult>(pending.current.path,'POST',pending.current.input));}
  catch(error) {auth.handleError(error);if(!(error instanceof AuthError)||['INTERNAL_ERROR','DATABASE_UNAVAILABLE'].includes(error.detail.code)) {setUncertain(true);setCanRetry(false);setMessage('finance.uncertain');} else {pending.current=null;setUncertain(false);setMessage(errorKey(error));balances.reload();}}
  finally {setBusy(false);}
 }
 async function check() {
  if(!pending.current) return;setBusy(true);
  try {const result=await auth.client.business<{status:'COMMITTED'|'NOT_FOUND';result:CollectionResult}>(`finance/operations/${pending.current.input.operationId}`);if(result.status==='COMMITTED') saved(result.result);else {setCanRetry(true);setMessage('finance.notFound');}}
  catch(error) {auth.handleError(error);setMessage(errorKey(error));} finally {setBusy(false);}
 }
 function submit(event:FormEvent) {
  event.preventDefault();if(pending.current||busy||!confirmed||!options.data) return;
  if(connectivity.state==='offline') {setMessage('network.offline');return;}
  try {
   if(credit) {
    if(selected.length!==1||!creditReason.trim()) throw new Error();
    const {item,amount}=selected[0],account=options.data.accounts.find(a=>a.id===destinations[item.branchId]&&a.branchId===item.branchId);const value=egpToPiastres(amount);
    if(!account||BigInt(value)<=0n) throw new Error();
    pending.current={path:'finance/credit-receipts',kind:'CREDIT_RECEIPT',input:{operationId:crypto.randomUUID(),childId:item.childId,accountId:account.id,method:account.type,amount:value,collectedOn:date,payerName:payer,externalReference:external,reason:creditReason,confirmedCredit:true}};void send();return;
   }
   const groups:CollectionInput['groups']=[];
   for(const {item,amount} of selected) {
    const value=egpToPiastres(amount);const account=options.data.accounts.find(a=>a.id===destinations[item.branchId]&&a.branchId===item.branchId);
    if(!account||BigInt(value)<=0n||BigInt(value)>BigInt(item.remaining)) throw new Error();
    let group=groups.find(g=>g.branchId===item.branchId);
    if(!group) {group={branchId:item.branchId,accountId:account.id,method:account.type,amount:'0',allocations:[]};groups.push(group);}
    group.amount=(BigInt(group.amount)+BigInt(value)).toString();group.allocations.push({installmentId:item.id,amount:value});
   }
   if(!groups.length) throw new Error();
   pending.current={path:'payments',kind:'COLLECT',input:{operationId:crypto.randomUUID(),collectedOn:date,payerName:payer,externalReference:external,groups}};void send();
  } catch {setMessage('finance.invalid');}
 }
 function select(item:OutstandingItem) {
  if(locked||selected.some(s=>s.item.id===item.id)) return;
  setSelected([...selected,{item,amount:(BigInt(item.remaining)/100n).toString()+'.'+(BigInt(item.remaining)%100n).toString().padStart(2,'0')}]);
  const account=options.data?.accounts.find(a=>a.branchId===item.branchId&&a.isDefault);
  if(account) setDestinations(previous=>({...previous,[item.branchId]:previous[item.branchId]||account.id}));
  setCredit(false);setConfirmed(false);setMessage(null);setReceiptIds([]);
 }
 function remind(item:OutstandingItem) {if(locked||pending.current) return;pending.current={path:`finance/installments/${item.id}/reminders`,kind:'REMINDER_RESEND',input:{operationId:crypto.randomUUID()}};void send();}
 return <main className="organization-page"><PageHeader actions={<><Link className="button button--outline" to="/administration/child-transfers">{t('childTransfer.title')}</Link></>} title={t('collections.title')} icon="wallet" />
 {(options.error||balances.error)&&<p className="inline-notice inline-notice--danger" role="alert">{t(options.error||balances.error!)}</p>}{!options.data&&!options.error&&<Skeleton label={t('state.loading')} />}{message&&<p className="inline-notice" role={uncertain?'alert':'status'}>{t(message)}</p>}
 {!balances.data&&!balances.error&&<Skeleton label={t('state.loading')} />}
 {uncertain&&<><div className="action-group"><Button variant="secondary" disabled={busy} onClick={()=>{void check();}}>{t('finance.check')}</Button>{canRetry&&<Button loading={busy} icon="refresh" variant="secondary" disabled={busy} onClick={()=>{void send();}}>{t('finance.retry')}</Button>}</div></>}
 {options.data&&<fieldset className="organization-fields" disabled={locked}>
 {(['branchId','classroomId','categoryId','status','timing'] as const).map(key=><SelectField key={key} label={t(key==='branchId'?'finance.branch':`collections.${key==='classroomId'?'classroom':key==='categoryId'?'category':key}`)} value={filters[key]} onChange={e=>{setFilters(previous=>({...previous,[key]:e.target.value,...(key==='branchId'?{classroomId:''}:{})}));setOffset(0);}}><option value="">{t('collections.all')}</option>
 {key==='branchId'?options.data!.branches.map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>):key==='classroomId'?options.data!.classrooms.filter(c=>!filters.branchId||c.branchId===filters.branchId).map(c=><option key={c.id} value={c.id}>{c.name}</option>):key==='categoryId'?options.data!.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>):(key==='status'?['UNPAID','PARTIAL','PAID'] as const:['OVERDUE','UPCOMING'] as const).map(s=><option key={s} value={s}>{t(`collections.${s}`)}</option>)}</SelectField>)}
 </fieldset>}
 {balances.data&&<><StatGrid label={t('collections.title')}><StatCard tone="magenta" icon="wallet" label={t('collections.total')} value={money(balances.data.totalRemaining)} numeric/><StatCard tone="cyan" icon="children" label={t('collections.count')} countTo={balances.data.totalCount} value={balances.data.totalCount} numeric/></StatGrid>{balances.data.items.length===0&&<EmptyState title={t('collections.empty')} art="sky" />}
 {balances.data.items.map(item=><Card key={item.id} title={`${item.childCode} — ${item.childName}`}><p>{item.categoryName} — {item.description}</p><p><Badge tone={item.status==='PAID'?'success':item.overdue?'warning':'neutral'}>{t(`collections.${item.status}`)}</Badge>{item.overdue&&` · ${t('collections.OVERDUE')}`}</p><p>{t('collections.due')}: <bdi dir="ltr">{formatDateOnly(item.dueOn)}</bdi></p><p>{t('collections.remaining')}: <bdi dir="ltr">{money(item.remaining)}</bdi></p><div className="action-group">{options.data?.canCollect&&BigInt(item.remaining)>0n&&<Button disabled={locked||selected.some(s=>s.item.id===item.id)} onClick={()=>select(item)}>{t('collections.collect')}</Button>}{options.data?.canRemind&&item.overdue&&<Button disabled={locked} onClick={()=>remind(item)}>{t('collections.resend')}</Button>}</div></Card>)}
 <div className="action-group"><Button icon="back" variant="secondary" disabled={locked||!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button icon="arrow" variant="secondary" disabled={locked||offset+20>=balances.data.totalCount} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></div></>}
 {selected.length>0&&options.data&&<form className="form-stack" onSubmit={submit}><fieldset className="organization-fields" disabled={locked}><legend>{t('collections.review')}</legend>
 {selected.length===1&&<label className="choice-field"><input type="checkbox" checked={credit} onChange={e=>{setCredit(e.target.checked);setConfirmed(false);}}/>{t('collections.credit')}</label>}{credit&&<><p>{t('collections.creditHelp')}</p><TextField label={t('collections.creditReason')} required maxLength={500} value={creditReason} onChange={e=>setCreditReason(e.target.value)}/></>}
 {selected.map(({item,amount},index)=><TextField key={item.id} label={`${item.childName} — ${item.categoryName} — ${t('collections.amount')}`} dir="ltr" inputMode="decimal" required value={amount} onChange={e=>{setSelected(previous=>previous.map((s,i)=>i===index?{...s,amount:e.target.value}:s));setConfirmed(false);}}/>)}
 {[...new Set(selected.map(s=>s.item.branchId))].map(branchId=><SelectField key={branchId} label={`${options.data!.branches.find(b=>b.id===branchId)?.name} — ${t('finance.type')}`} required value={destinations[branchId]||''} onChange={e=>{setDestinations(previous=>({...previous,[branchId]:e.target.value}));setConfirmed(false);}}><option value="">{t('collections.noDestination')}</option>{options.data!.accounts.filter(a=>a.branchId===branchId).map(a=><option key={a.id} value={a.id}>{a.code} — {a.name} — {t(`finance.${a.type}`)}</option>)}</SelectField>)}
 <TextField label={t('collections.payer')} required maxLength={120} value={payer} onChange={e=>setPayer(e.target.value)}/><TextField label={t('collections.external')} maxLength={120} value={external} onChange={e=>setExternal(e.target.value)}/><DateField label={t('collections.date')} required value={date} onValueChange={setDate}/>
 <label className="choice-field"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('collections.confirm')}</label><div className="action-group"><Button type="submit" disabled={!confirmed}>{t(credit?'collections.recordCredit':'collections.submit')}</Button><Button variant="secondary" onClick={()=>{setSelected([]);setConfirmed(false);}}>{t('collections.cancel')}</Button></div>
 </fieldset></form>}
 {receiptIds.length>0&&<section className="workspace-section"><h2>{t('collections.receipts')}</h2>{receiptIds.map(id=><ReceiptReference key={id} id={id}/>)}</section>}
 <ReceiptHistory key={filters.branchId} branchId={filters.branchId}/>
 <FinanceReminderInbox/>
 </main>;
}
function ReceiptReference({id}:{id:string}) {const receipt=useScoped<Receipt>(`finance/receipts/${id}`);return receipt.data?<ReceiptCard receipt={receipt.data}/>:null;}
function FinanceReminderInbox() {const {t}=useLocale();const [offset,setOffset]=useState(0);const notices=useScoped<{id:string;childName:string;categoryName:string;remaining:string;dueOn:string}[]>(`finance/reminders?limit=20&offset=${offset}`);return notices.data?.length?<section className="workspace-section"><h2>{t('collections.notices')}</h2>{notices.data.map(n=><p key={n.id}>{n.childName} — {n.categoryName} — <bdi dir="ltr">{formatDateOnly(n.dueOn)} · {money(n.remaining)}</bdi></p>)}<div className="action-group"><Button icon="back" variant="secondary" disabled={!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button icon="arrow" variant="secondary" disabled={notices.data.length!==20} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></div></section>:null;}
function ReceiptHistory({branchId}:{branchId:string}) {const {t}=useLocale();const [offset,setOffset]=useState(0);const receipts=useScoped<Receipt[]>(`finance/receipts?limit=20&offset=${offset}${branchId?`&branchId=${branchId}`:''}`);return receipts.data?<section className="workspace-section"><h2>{t('collections.history')}</h2>{receipts.data.map(receipt=><ReceiptCard key={receipt.id} receipt={receipt}/>)}<div className="action-group"><Button icon="back" variant="secondary" disabled={!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button icon="arrow" variant="secondary" disabled={receipts.data.length!==20} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></div></section>:null;}
