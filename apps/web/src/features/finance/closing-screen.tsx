import { PageHeader } from '../../components/data-display.js';
import { useEffect,useState,type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ClosingOptions,DailyClosing } from '@nursery/contracts';
import { cairoIsoDate,egpToPiastres,formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import { Button,DateField,SelectField,TextField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { useScoped } from '../children/scoped.js';
import { useFinancialOperation } from './use-operation.js';
import { OperationNotice } from './spending-screen.js';

const money=(v:string)=>formatEgp(piastres(BigInt(v)));
function CountForm({accountId,op}:{accountId:string;op:ReturnType<typeof useFinancialOperation>}) {
 const {t}=useLocale(),[on,setOn]=useState(cairoIsoDate()),[counted,setCounted]=useState(''),[reason,setReason]=useState('');
 const current=useScoped<{revision:number;action:'COUNTED'|'REOPENED'|null}>(`finance/closing-current?accountId=${accountId}&on=${on}`);
 function count(e:FormEvent) {e.preventDefault();if(!current.data) return;try {op.submit('finance/closings',{accountId,on,countedAmount:egpToPiastres(counted),reason,expectedRevision:current.data.revision});}catch {op.invalid();}}
 return <>{current.error&&<p className="inline-notice inline-notice--danger" role="alert">{t(current.error)}</p>}<form className="form-stack" onSubmit={count}><fieldset className="organization-fields" disabled={op.locked}><legend>{t('closing.record')}</legend><DateField label={t('spending.date')} required value={on} onValueChange={setOn}/><TextField label={t('closing.counted')} required inputMode="decimal" value={counted} onChange={e=>setCounted(e.target.value)}/><TextField label={t('spending.reason')} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/><Button icon="check" type="submit" disabled={!current.data||current.data.action==='COUNTED'}>{t('closing.record')}</Button></fieldset></form></>;
}
export function ClosingScreen() {
 const {t}=useLocale(),options=useScoped<ClosingOptions>('finance/closing-options');
 const [account,setAccount]=useState(''),[reason,setReason]=useState(''),[offset,setOffset]=useState(0);
 const accountId=account||options.data?.accounts[0]?.id||'',history=useScoped<DailyClosing[]>(`finance/closings?limit=20&offset=${offset}${accountId?`&accountId=${accountId}`:''}`);
 const [selected,setSelected]=useState<DailyClosing|null>(null),[action,setAction]=useState<'reopen'|'adjust'>('reopen'),[confirmed,setConfirmed]=useState(false);
 const op=useFinancialOperation(()=>{history.reload();options.reload();setSelected(null);setConfirmed(false);});
 useEffect(()=>{const clear=()=>{setSelected(null);setReason('');setConfirmed(false);};window.addEventListener('blur',clear);window.addEventListener('nursery:scope-refresh',clear);document.addEventListener('visibilitychange',clear);return()=>{window.removeEventListener('blur',clear);window.removeEventListener('nursery:scope-refresh',clear);document.removeEventListener('visibilitychange',clear);};},[]);
 useEffect(()=>{if(options.error||options.data&&(!options.data.canCorrect||!options.data.accounts.some(a=>a.id===accountId))) {setSelected(null);setConfirmed(false);}},[options.data,options.error,accountId]);
 function correct(e:FormEvent) {e.preventDefault();if(!selected||action==='adjust'&&!confirmed) return;op.submit(`finance/closings/${selected.id}/${action}`,{expectedRevision:selected.revision,reason,...(action==='adjust'?{effectiveOn:cairoIsoDate()}:{})});}
 return <main className="organization-page"><PageHeader description={t('closing.help')} actions={<><Link className="button button--outline" to="/administration/treasury">{t('finance.title')}</Link></>} title={t('closing.title')} icon="wallet" /><OperationNotice op={op}/>{(options.error||history.error)&&<p className="inline-notice inline-notice--danger" role="alert">{t(options.error||history.error!)}</p>}
 {options.data&&<><SelectField label={t('spending.destination')} value={accountId} disabled={op.locked} onChange={e=>{setAccount(e.target.value);setOffset(0);setSelected(null);}}>{options.data.accounts.map(a=><option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}</SelectField>
 {options.data.canCount&&accountId&&<CountForm key={accountId} accountId={accountId} op={op}/>}
 {history.data?.map(c=><Card key={c.id} title={`${c.accountCode} — ${formatDateOnly(c.on)}`}><p>{t(`closing.${c.action}`)} — {t('closing.revision')} {c.revision}</p><p>{t('closing.expected')}: {money(c.expected)}</p><p>{t('closing.counted')}: {money(c.counted)}</p><p>{t('closing.difference')}: {money(c.difference)}</p><p>{c.actor} — {c.reason}</p>{c.adjustmentDate&&<p>{t('closing.adjusted')} {formatDateOnly(c.adjustmentDate)}</p>}{c.isCurrent&&c.action==='COUNTED'&&options.data!.canCorrect&&<><div className="action-group"><Button disabled={op.locked} onClick={()=>{setSelected(c);setAction('reopen');setReason('');}}>{t('closing.reopen')}</Button>{c.difference!=='0'&&!c.adjustmentId&&<Button disabled={op.locked} onClick={()=>{setSelected(c);setAction('adjust');setReason('');setConfirmed(false);}}>{t('closing.adjust')}</Button>}</div></>}</Card>)}
 <div className="action-group"><Button icon="back" variant="secondary" disabled={offset===0||op.locked} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button icon="arrow" variant="secondary" disabled={history.data?.length!==20||op.locked} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></div>
 {selected&&<form className="form-stack" onSubmit={correct}><fieldset className="organization-fields" disabled={op.locked}><legend>{t(action==='reopen'?'closing.reopen':'closing.adjust')} — {selected.accountCode}</legend><p>{formatDateOnly(selected.on)} — {t('closing.difference')}: {money(selected.difference)}</p><TextField label={t('spending.reason')} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/>{action==='adjust'&&<><p>{formatDateOnly(cairoIsoDate())}</p><label className="choice-field"><input type="checkbox" checked={confirmed} required onChange={e=>setConfirmed(e.target.checked)}/>{t('closing.confirm')}</label></>}<Button type="submit">{t(action==='reopen'?'closing.reopen':'closing.adjust')}</Button></fieldset></form>}</>}
 </main>;
}
