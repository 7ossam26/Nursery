import { useRef,useState,type FormEvent } from 'react';
import { Link } from 'react-router';
import { cairoIsoDate,egpToPiastres,formatEgp,piastres,formatDateOnly } from '@nursery/domain';
import type { FinanceOptions,TreasuryAccount } from '@nursery/contracts';
import { Button,SelectField,TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { LanguageSwitcher } from '../../layout/AppShell.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';
import { errorKey,useScoped } from '../children/scoped.js';

export function TreasuryScreen() {
 const {t}=useLocale();const auth=useAuth();const options=useScoped<FinanceOptions>('finance/options');
 const [branch,setBranch]=useState('');const [offset,setOffset]=useState(0);const branchId=branch||options.data?.branches[0]?.id||'';
 const accounts=useScoped<TreasuryAccount[]>(`finance/accounts?limit=20&offset=${offset}${branchId ? `&branchId=${branchId}`:''}`);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState<MessageKey|null>(null);const [uncertain,setUncertain]=useState(false);const [canRetry,setCanRetry]=useState(false);
 const pending=useRef<{path:string;body:{operationId:string}&Record<string,unknown>}|null>(null);
 const [code,setCode]=useState(''),[name,setName]=useState(''),[type,setType]=useState<TreasuryAccount['type']>('CASH'),[opening,setOpening]=useState('0.00'),[date,setDate]=useState(cairoIsoDate()),[reason,setReason]=useState('');
 async function send() {
  if(!pending.current) return;setBusy(true);setMessage(null);
  try {await auth.client.business(pending.current.path,'POST',pending.current.body);pending.current=null;setUncertain(false);setCanRetry(false);setMessage('finance.saved');accounts.reload();}
  catch(error) {auth.handleError(error);if(!(error instanceof AuthError)||error.detail.code==='INTERNAL_ERROR'||error.detail.code==='DATABASE_UNAVAILABLE') {setUncertain(true);setCanRetry(false);setMessage('finance.uncertain');} else {pending.current=null;setUncertain(false);setMessage(errorKey(error));}}
  finally {setBusy(false);}
 }
 async function check() {
  if(!pending.current) return;setBusy(true);
  try {const result=await auth.client.business<{status:'COMMITTED'|'NOT_FOUND'}>(`finance/operations/${pending.current.body.operationId}`);if(result.status==='COMMITTED') {pending.current=null;setUncertain(false);setMessage('finance.saved');accounts.reload();} else {setCanRetry(true);setMessage('finance.notFound');}}
  catch(error) {setMessage(errorKey(error));auth.handleError(error);} finally {setBusy(false);}
 }
 function create(e:FormEvent) {
  e.preventDefault();if(pending.current||busy) return;
  try {pending.current={path:'finance/accounts',body:{operationId:crypto.randomUUID(),branchId,code,name,type,openingAmount:egpToPiastres(opening),openedOn:date,reason}};void send();} catch {setMessage('finance.invalid');}
 }
 function makeDefault(a:TreasuryAccount) {if(pending.current||busy) return;pending.current={path:`finance/branches/${a.branchId}/default-account`,body:{operationId:crypto.randomUUID(),accountId:a.id,expectedVersion:a.defaultVersion}};void send();}
 return <main className="organization-page"><LanguageSwitcher /><Link to="/account">{t('auth.account')}</Link><Link to="/administration/expenses">{t('spending.title')}</Link><Link to="/administration/transfers">{t('transfer.title')}</Link><Link to="/administration/closing">{t('closing.title')}</Link><Link to="/administration/corrections">{t('corrections.title')}</Link><h1>{t('finance.title')}</h1>
 {(options.error||accounts.error)&&<p role="alert">{t(options.error||accounts.error!)}</p>}{message&&<p role={uncertain?'alert':'status'}>{t(message)}</p>}
 {uncertain&&<><Button disabled={busy} onClick={()=>{void check();}}>{t('finance.check')}</Button>{canRetry&&<Button disabled={busy} onClick={()=>{void send();}}>{t('finance.retry')}</Button>}</>}
 {options.data&&<><SelectField label={t('finance.branch')} value={branchId} disabled={busy||uncertain} onChange={e=>{setBranch(e.target.value);setOffset(0);}}>{options.data.branches.map(b=><option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}</SelectField>
 {options.data.canManage&&branchId&&<form onSubmit={create}><fieldset className="organization-fields" disabled={busy||uncertain}><legend>{t('finance.create')}</legend><p>{t('finance.help')}</p>
 <TextField label={t('finance.code')} required maxLength={32} value={code} onChange={e=>setCode(e.target.value)} pattern="[A-Za-z0-9_-]+" />
 <TextField label={t('finance.name')} required maxLength={120} value={name} onChange={e=>setName(e.target.value)} />
 <SelectField label={t('finance.type')} value={type} onChange={e=>setType(e.target.value as TreasuryAccount['type'])}>{(['CASH','BANK','WALLET'] as const).map(k=><option key={k} value={k}>{t(`finance.${k}`)}</option>)}</SelectField>
 <TextField label={t('finance.opening')} required inputMode="decimal" dir="ltr" value={opening} onChange={e=>setOpening(e.target.value)} />
 <TextField label={t('finance.date')} type="date" required max={cairoIsoDate()} value={date} onChange={e=>setDate(e.target.value)} />
 <TextField label={t('finance.reason')} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /><Button type="submit">{t('finance.create')}</Button></fieldset></form>}
 {accounts.data?.length===0&&<p>{t('finance.empty')}</p>}{accounts.data?.map(a=><Card key={a.id} title={`${a.code} — ${a.name}`}><p>{t(`finance.${a.type}`)}</p><p dir="ltr">{formatEgp(piastres(BigInt(a.balance)))}</p><p dir="ltr">{formatDateOnly(a.openedOn)}</p>{a.isDefault ? <p>{t('finance.default')}</p>:a.type==='CASH'&&options.data?.canManage&&<Button disabled={busy||uncertain} onClick={()=>makeDefault(a)}>{t('finance.makeDefault')}</Button>}</Card>)}
 <Button disabled={!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button disabled={accounts.data?.length!==20} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></>}
 </main>;
}
