import { splitPiastres } from './money.js';
import type { AgreementTerms,BillingAllocation } from '@nursery/contracts';
export const monthStart=(date:string)=>date.slice(0,7)+'-01';
export function nextMonth(month:string) {
 const [year,m]=month.split('-').map(Number);return `${year+(m===12?1:0)}`.padStart(4,'0')+'-'+`${m===12?1:m+1}`.padStart(2,'0')+'-01';
}
export function monthlyDue(month:string,day:number) {
 const [year,m]=month.split('-').map(Number);const last=new Date(Date.UTC(year,m,0)).getUTCDate();
 return month.slice(0,8)+String(Math.min(day,last)).padStart(2,'0');
}
// Allocate the family total once, then distribute each due portion against those
// fixed child targets. Rotating the remainder prevents a child schedule exceeding its share.
export function billingAllocations(terms:AgreementTerms):BillingAllocation[] {
 const shares=splitPiastres(BigInt(terms.agreedAmount),terms.childIds).map(s=>({...s,installments:[] as BillingAllocation['installments']}));
 let cursor=0;
 for(const due of terms.installments) {
  const amount=BigInt(due.amount),count=BigInt(shares.length),base=amount/count,remainder=Number(amount%count);
  const amounts=shares.map(()=>base);
  for(let i=0;i<remainder;i++) amounts[(cursor+i)%shares.length]++;
  cursor=(cursor+remainder)%shares.length;
  shares.forEach((s,i)=>s.installments.push({dueOn:due.dueOn,amount:amounts[i].toString()}));
 }
 return shares;
}
