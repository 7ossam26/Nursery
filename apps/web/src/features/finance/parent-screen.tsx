import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { OutstandingPage,Receipt } from '@nursery/contracts';
import { formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import { Button,SelectField } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { useScoped } from '../children/scoped.js';
import { ParentFrame } from '../communication/screens.js';
import { ReceiptCard } from './receipt-card.js';
const money=(amount:string)=>formatEgp(piastres(BigInt(amount)));
export function ParentPaymentsScreen() {
 const {t}=useLocale();const [query]=useSearchParams();const [selected,setSelected]=useState(query.get('childId')||'');
 const options=useScoped<{enabled:boolean;children:{id:string;fullName:string}[]}>('parent/payment-options');
 const childId=options.data?.children.some(c=>c.id===selected)?selected:options.data?.children[0]?.id;
 return <ParentFrame><h1>{t('collections.parent')}</h1>{options.error&&<p role="alert">{t(options.error)}</p>}{!options.data&&!options.error&&<p role="status">{t('state.loading')}</p>}
 {options.data&&!options.data.enabled&&<p>{t('finance.disabled')}</p>}{options.data?.enabled&&options.data.children.length===0&&<p>{t('state.noPermissionBody')}</p>}
 {!!options.data?.children.length&&<SelectField label={t('hub.child')} value={childId} onChange={e=>setSelected(e.target.value)}>{options.data.children.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</SelectField>}{childId&&<ParentChildPayments key={childId} childId={childId}/>}</ParentFrame>;
}
function ParentChildPayments({childId}:{childId:string}) {
 const {t}=useLocale();const [offset,setOffset]=useState(0),[receiptOffset,setReceiptOffset]=useState(0);
 const balances=useScoped<OutstandingPage>(`finance/outstanding?childId=${childId}&limit=20&offset=${offset}`),receipts=useScoped<Receipt[]>(`parent/children/${childId}/receipts?limit=20&offset=${receiptOffset}`);
 return <>{(balances.error||receipts.error)&&<p role="alert">{t(balances.error||receipts.error!)}</p>}{balances.data&&<><p>{t('collections.remaining')}: <bdi dir="ltr">{money(balances.data.totalRemaining)}</bdi></p>{balances.data.items.length===0&&<p>{t('collections.empty')}</p>}{balances.data.items.map(item=><Card key={item.id} title={item.categoryName}><p>{item.description}</p><p>{t(`collections.${item.status}`)}{item.overdue&&` · ${t('collections.OVERDUE')}`}</p><p><bdi dir="ltr">{formatDateOnly(item.dueOn)}</bdi> · <bdi dir="ltr">{money(item.remaining)}</bdi></p></Card>)}<Button disabled={!offset} onClick={()=>setOffset(offset-20)}>{t('hub.previous')}</Button><Button disabled={offset+20>=balances.data.totalCount} onClick={()=>setOffset(offset+20)}>{t('hub.next')}</Button></>}
 {receipts.data&&<section><h2>{t('collections.receipts')}</h2>{receipts.data.map(receipt=><ReceiptCard key={receipt.id} receipt={receipt}/>)}<Button disabled={!receiptOffset} onClick={()=>setReceiptOffset(receiptOffset-20)}>{t('hub.previous')}</Button><Button disabled={receipts.data.length!==20} onClick={()=>setReceiptOffset(receiptOffset+20)}>{t('hub.next')}</Button></section>}</>;
}
