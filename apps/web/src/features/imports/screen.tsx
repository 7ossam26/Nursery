import { useEffect,useRef,useState,type FormEvent } from 'react';
import { importColumnHelp,importErrorHelp,importKindTitles,importSheetTitles,importText,type ImportBatch,type ImportCommitResult,type ImportKind,type ImportOptions,type ImportPreview } from '@nursery/contracts';
import { formatDateOnly,formatEgp,piastres,cairoIsoDate } from '@nursery/domain';
import { Button,SelectField } from '../../components/controls.js';
import { Card,ResponsiveTable } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { AuthError } from '../auth/client.js';
import { errorKey,useScoped } from '../children/scoped.js';

const money=(v:string)=>formatEgp(piastres(BigInt(v)));
const when=(iso:string,locale:string)=>`${formatDateOnly(cairoIsoDate(iso))} ${new Date(iso).toLocaleTimeString(locale,{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit'})}`;
function Preview({preview}:{preview:ImportPreview}) {
 const {t,locale}=useLocale();const seat=(s:ImportPreview['seats']['parent'])=>t('imports.seatDetail',{required:s.required,reserved:s.reserved,capacity:s.capacity===null?t('imports.unlimited'):s.capacity});
 const creates=([['guardians','imports.guardians'],['children','imports.children'],['links','imports.links'],['obligations','imports.obligations'],['employees','imports.employees'],['logins','imports.logins'],['assignments','imports.assignments']] as const).filter(([k])=>preview.creates[k]>0);
 return <section aria-label={t('imports.preview')}>
  <p>{t('imports.rowCounts')}: {Object.entries(preview.rowCounts).map(([s,n])=>`${importText(locale,importSheetTitles,s)} ${n}`).join(' · ')}</p>
  {creates.length>0&&<p>{t('imports.creates')}: {creates.map(([k,key])=>`${t(key)} ${preview.creates[k]}`).join(' · ')}{preview.creates.obligations>0&&<> · {t('imports.obligationsTotal')}: {money(preview.obligationsTotal)}</>}</p>}
  {(preview.seats.parent.required>0||preview.seats.employee.required>0)&&<p>{t('imports.seats')}: {preview.seats.parent.required>0&&<>{t('imports.seatParent')} — {seat(preview.seats.parent)}</>}{preview.seats.employee.required>0&&<>{t('imports.seatEmployee')} — {seat(preview.seats.employee)}</>}</p>}
  {preview.warnings.map(w=><p key={w} role="status">{t('imports.CAPACITY_EXCEEDED',{code:w.split(':')[1]??''})}</p>)}
  {preview.errorCount===0?<p role="status">{t('imports.noErrors')}</p>:<><p role="alert">{t('imports.errorCount',{count:preview.errorCount})}</p><ResponsiveTable caption={t('imports.errors')} rows={preview.errors.map((e,i)=>({...e,id:i}))} rowKey={e=>String(e.id)} columns={[
   {key:'sheet',heading:t('imports.sheet'),cell:e=>importText(locale,importSheetTitles,e.sheet)},{key:'row',heading:t('imports.row'),cell:e=>e.row??'—'},{key:'column',heading:t('imports.column'),cell:e=>e.column?<span title={importText(locale,importColumnHelp,e.column)}>{e.column}</span>:'—'},{key:'code',heading:t('imports.problem'),cell:e=>importText(locale,importErrorHelp,e.code)}]}/></>}
  {preview.rows.length>0&&<ResponsiveTable caption={t('imports.rows')} rows={preview.rows.map((r,i)=>({...r,id:i}))} rowKey={r=>String(r.id)} columns={[{key:'sheet',heading:t('imports.sheet'),cell:r=>importText(locale,importSheetTitles,r.sheet)},{key:'row',heading:t('imports.row'),cell:r=>r.row},{key:'key',heading:t('imports.key'),cell:r=>r.key},{key:'label',heading:t('imports.label'),cell:r=>r.label},{key:'detail',heading:t('imports.detail'),cell:r=>r.detail}]}/>}
 </section>;
}
function Credentials({result,onDismiss}:{result:ImportCommitResult;onDismiss:()=>void}) {
 const {t}=useLocale();
 return <div role="status"><h3>{t('imports.credentials')}</h3><p>{t('imports.credentialsHelp')}</p><ResponsiveTable caption={t('imports.credentials')} rows={result.credentials!} rowKey={c=>c.username} columns={[{key:'u',heading:t('imports.username'),cell:c=><code dir="ltr">{c.username}</code>},{key:'p',heading:t('imports.temporaryPassword'),cell:c=><code className="auth-temporary" dir="ltr">{c.temporaryPassword}</code>}]}/><Button variant="secondary" onClick={onDismiss}>{t('imports.dismissCredentials')}</Button></div>;
}
// Frozen operation ID and preview hash; an uncertain outcome is resolved from the batch status before any retry.
function Batch({initial,onDone}:{initial:ImportBatch;onDone:()=>void}) {
 const {t,locale}=useLocale(),auth=useAuth();const [batch,setBatch]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState<MessageKey|null>(null),[uncertain,setUncertain]=useState(false),[canRetry,setCanRetry]=useState(false),[result,setResult]=useState<ImportCommitResult|null>(initial.result);
 const pending=useRef<{operationId:string;expectedPreviewHash:string}|null>(null);const generation=useRef(0);
 useEffect(()=>{const clear=()=>{generation.current++;setResult(r=>r&&r.credentials?{...r,credentials:null}:r);};window.addEventListener('nursery:scope-refresh',clear);document.addEventListener('visibilitychange',clear);return()=>{window.removeEventListener('nursery:scope-refresh',clear);document.removeEventListener('visibilitychange',clear);};},[]);
 // A refresh never replaces a result already shown: the redacted stored result would erase one-time credentials.
 async function reload() {const fresh=await auth.client.business<ImportBatch>(`imports/${batch.id}`);setBatch(fresh);if(fresh.result) setResult(previous=>previous??fresh.result);return fresh;}
 async function send() {
  if(!pending.current||busy) return;setBusy(true);setMessage(null);const started=generation.current;
  try {const r=await auth.client.business<ImportCommitResult>(`imports/${batch.id}/commit`,'POST',pending.current);if(started!==generation.current) r.credentials=null;setResult(r);pending.current=null;setUncertain(false);setCanRetry(false);setMessage('imports.committed');await reload().catch(()=>undefined);onDone();}
  catch(error) {auth.handleError(error);if(!(error instanceof AuthError)||['INTERNAL_ERROR','DATABASE_UNAVAILABLE'].includes(error.detail.code)) {setUncertain(true);setCanRetry(false);setMessage('imports.uncertain');} else {pending.current=null;setUncertain(false);setCanRetry(false);setMessage(error.detail.code==='STALE_VERSION'?'imports.stale':errorKey(error));if(['STALE_VERSION','VALIDATION_ERROR','IDEMPOTENCY_CONFLICT'].includes(error.detail.code)) await reload().catch(()=>undefined);}}
  finally {setBusy(false);}
 }
 function commit() {if(pending.current||busy||!batch.previewHash) return;pending.current={operationId:crypto.randomUUID(),expectedPreviewHash:batch.previewHash};void send();}
 async function check() {if(busy) return;setBusy(true);try {const fresh=await reload();if(fresh.status==='COMMITTED') {pending.current=null;setUncertain(false);setCanRetry(false);setMessage('imports.committed');onDone();} else {setCanRetry(true);setMessage('imports.notFound');}} catch(error) {auth.handleError(error);setMessage(errorKey(error));} finally {setBusy(false);}}
 return <Card title={`${importText(locale,importKindTitles,batch.kind)} — ${batch.fileName}`}>
  <p>{t('imports.status')}: {t(`imports.${batch.status}`)} · {t('imports.templateVersion')}: {batch.templateVersion} · {t('imports.created')}: {when(batch.createdAt,locale)}{batch.status==='PREVIEWED'&&<> · {t('imports.expires')}: {when(batch.expiresAt,locale)}</>}</p>
  {message&&<p role={message==='imports.committed'?'status':'alert'}>{t(message)}</p>}
  {batch.status==='EXPIRED'&&<p role="alert">{t('imports.expired')}</p>}
  {batch.preview&&batch.status!=='COMMITTED'&&<Preview preview={batch.preview}/>}
  {batch.status==='PREVIEWED'&&!uncertain&&!canRetry&&<Button disabled={busy||!batch.preview?.canCommit||!batch.previewHash} onClick={commit}>{t(busy?'imports.committing':'imports.commit')}</Button>}
  {uncertain&&<Button disabled={busy} onClick={()=>void check()}>{t('imports.checkStatus')}</Button>}{canRetry&&<Button disabled={busy} onClick={()=>void send()}>{t('imports.retry')}</Button>}
  {result&&<section aria-label={t('imports.result')}><h2>{t('imports.result')}</h2><p>{([['guardians','imports.guardians'],['children','imports.children'],['links','imports.links'],['obligations','imports.obligations'],['employees','imports.employees'],['logins','imports.logins'],['assignments','imports.assignments']] as const).filter(([k])=>result.creates[k]>0).map(([k,key])=>`${t(key)} ${result.creates[k]}`).join(' · ')}{result.creates.obligations>0&&<> · {t('imports.obligationsTotal')}: {money(result.obligationsTotal)}</>}</p>{result.credentials&&result.credentials.length>0&&<Credentials result={result} onDismiss={()=>setResult({...result,credentials:null})}/>}</section>}
 </Card>;
}
// The open batch renders outside the options record: a background options refresh must never unmount a preview or a one-time credential result.
export function ImportsScreen() {
 const {t,locale}=useLocale(),auth=useAuth(),options=useScoped<ImportOptions>('imports/options');
 const [kind,setKind]=useState<ImportKind>('PARENTS_CHILDREN'),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<MessageKey|null>(null),[batch,setBatch]=useState<ImportBatch|null>(null);const fileInput=useRef<HTMLInputElement|null>(null);
 const kinds=options.data?.kinds??[];const selected=kinds.find(k=>k.kind===kind)??kinds.find(k=>k.enabled);
 async function download() {if(!selected||busy) return;setBusy(true);setError(null);try {const {bytes,filename}=await auth.client.downloadFile(`imports/templates/${selected.kind}`);const url=URL.createObjectURL(bytes);try {const a=document.createElement('a');a.href=url;a.download=filename;a.click();} finally {URL.revokeObjectURL(url);}} catch(e) {setError(errorKey(e));auth.handleError(e);} finally {setBusy(false);}}
 async function upload(e:FormEvent) {
  e.preventDefault();if(!selected||busy) return;const limit=options.data?.limits.maxFileBytes??0;
  if(!file||file.size>limit||!file.name.toLowerCase().endsWith('.xlsx')) {setError('imports.invalidFile');return;}
  setBusy(true);setError(null);
  try {const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
   setBatch(await auth.client.business<ImportBatch>('imports','POST',{kind:selected.kind,fileName:file.name,contentBase64:base64}));options.reload();}
  catch(caught) {setError(errorKey(caught));auth.handleError(caught);}
  finally {setBusy(false);setFile(null);if(fileInput.current) fileInput.current.value='';}
 }
 async function open(id:string) {setBusy(true);setError(null);try {setBatch(await auth.client.business<ImportBatch>(`imports/${id}`));} catch(caught) {setError(errorKey(caught));auth.handleError(caught);} finally {setBusy(false);}}
 return <main className="organization-page"><h1>{t('imports.title')}</h1><p>{t('imports.help')}</p>
  {options.error&&<p role="alert">{t(options.error)}</p>}{!options.data&&!options.error&&<p role="status">{t('state.loading')}</p>}
  {options.data&&<>
   <Card title={t('imports.template')}><p>{t('imports.limits',{rows:options.data.limits.maxRowsPerSheet,kb:Math.floor(options.data.limits.maxFileBytes/1024)})}</p>
    <form onSubmit={upload}><fieldset disabled={busy} className="organization-fields"><legend>{t('imports.kind')}</legend>
     <SelectField label={t('imports.kind')} value={selected?.kind??''} onChange={e=>setKind(e.target.value as ImportKind)}>{kinds.map(k=><option key={k.kind} value={k.kind} disabled={!k.enabled}>{importText(locale,importKindTitles,k.kind)} (v{k.templateVersion})</option>)}</SelectField>
     {selected&&!selected.enabled&&<p role="status">{t('imports.disabledKind')}</p>}
     {selected?.enabled&&<><p>{Object.entries(selected.sheets).map(([s,keys])=>`${importText(locale,importSheetTitles,s)}: ${keys.join(', ')}`).join(' · ')}</p><Button type="button" variant="secondary" disabled={busy} onClick={()=>void download()}>{t('imports.template')}</Button>
     <label>{t('imports.file')}<input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>setFile(e.target.files?.[0]??null)}/></label><Button type="submit" disabled={busy||!file}>{t(busy?'imports.uploading':'imports.upload')}</Button></>}
    </fieldset></form>{error&&<p role="alert">{t(error)}</p>}</Card>
   <Card title={t('imports.recent')}>{options.data.recent.length===0?<p>{t('state.emptyBody')}</p>:<ResponsiveTable caption={t('imports.recent')} rows={options.data.recent} rowKey={r=>r.id} columns={[{key:'kind',heading:t('imports.kind'),cell:r=>importText(locale,importKindTitles,r.kind)},{key:'file',heading:t('imports.file'),cell:r=>r.fileName},{key:'status',heading:t('imports.status'),cell:r=>t(`imports.${r.status}`)},{key:'created',heading:t('imports.created'),cell:r=>when(r.createdAt,locale)},{key:'open',heading:t('imports.open'),cell:r=><Button variant="secondary" disabled={busy} onClick={()=>void open(r.id)}>{t('imports.open')}</Button>}]}/>}</Card>
  </>}
  {batch&&<><Batch key={batch.id} initial={batch} onDone={()=>options.reload()}/><Button variant="secondary" onClick={()=>setBatch(null)}>{t('imports.new')}</Button></>}
 </main>;
}
