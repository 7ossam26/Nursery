import type { Receipt } from '@nursery/contracts';
import { formatDateOnly,formatEgp,piastres } from '@nursery/domain';
import { Card } from '../../components/surfaces.js';
import { useLocale } from '../../i18n/LocaleProvider.js';

export function ReceiptCard({receipt}:{receipt:Receipt}) {
 const {t}=useLocale();
 return <Card title={receipt.reference}>
  <p>{t(receipt.kind==='CREDIT'?'collections.creditType':'collections.paymentType')} — {t(`finance.${receipt.method}`)} — {receipt.branchCode} / {receipt.accountCode}</p>
  <p>{receipt.payerName} — <bdi dir="ltr">{formatDateOnly(receipt.collectedOn)} · {formatEgp(piastres(BigInt(receipt.amount)))}</bdi></p>
  <a href={`/api/v1/finance/receipts/${receipt.id}/download`}>{t('collections.download')}</a>
 </Card>;
}
