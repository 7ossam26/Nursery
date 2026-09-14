import { useState } from 'react';
import type { Receipt } from '@nursery/contracts';
import { formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import { Button } from '../../components/controls.js';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import type { MessageKey } from '../../i18n/catalogs.js';
import { useAuth } from '../auth/AuthProvider.js';
import { errorKey } from '../children/scoped.js';

export function ReceiptCard({receipt}:{receipt:Receipt}) {
 const {t}=useLocale();const auth=useAuth();const [busy,setBusy]=useState(false);const [error,setError]=useState<MessageKey|null>(null);
 // The PDF is fetched through the authenticated client so a revoked session gets the access message
 // instead of a raw error document; the temporary object URL is released immediately.
 async function download() {
  if(busy) return;setBusy(true);setError(null);
  try {const {bytes,filename}=await auth.client.downloadFile(`finance/receipts/${receipt.id}/download`);if(typeof URL.createObjectURL!=='function') return;const url=URL.createObjectURL(bytes);try {const a=document.createElement('a');a.href=url;a.download=filename;a.click();} finally {URL.revokeObjectURL(url);}}
  catch(caught) {setError(errorKey(caught));auth.handleError(caught);} finally {setBusy(false);}
 }
 return <Card title={receipt.reference}>
  <p>{t(receipt.kind==='CREDIT'?'collections.creditType':'collections.paymentType')} — {t(`finance.${receipt.method}`)} — {receipt.branchCode} / {receipt.accountCode}</p>
  <p>{receipt.payerName} — <bdi dir="ltr">{formatDateOnly(receipt.collectedOn)} · {formatEgp(piastres(BigInt(receipt.amount)))}</bdi></p>
  {error&&<p role="alert">{t(error)}</p>}
  <Button variant="secondary" disabled={busy} onClick={()=>{void download();}}>{t('collections.download')}</Button>
 </Card>;
}
