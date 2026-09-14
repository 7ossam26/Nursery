import { expect,it } from 'vitest';
import { billingAllocations,monthlyDue,nextMonth } from './billing.js';
import { cairoIsoDate } from './index.js';
import { agreementTermsSchema } from '@nursery/contracts';
it('calendar dates clamp leap/short months and ignore Cairo DST duration',()=>{
 expect(monthlyDue('2024-02-01',31)).toBe('2024-02-29');expect(monthlyDue('2025-02-01',31)).toBe('2025-02-28');
 expect(monthlyDue('2026-04-01',31)).toBe('2026-04-30');expect(nextMonth('2026-12-01')).toBe('2027-01-01');
 expect(cairoIsoDate('2026-04-30T21:30:00Z')).toBe('2026-05-01');expect(cairoIsoDate('2026-10-31T22:30:00Z')).toBe('2026-11-01');
});
it('A13/A14 installment matrix conserves family rows and fixed child totals',()=>{
 const ids=['00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
 const terms=agreementTermsSchema.parse({mode:'FIXED',categoryId:ids[0],description:'Tuition',childIds:ids,normalAmount:'12000',agreedAmount:'10001',startsOn:'2026-01-01',endsOn:null,firstPeriod:null,dueDay:null,serviceFrom:'2026-01-01',serviceUntil:'2026-12-31',installments:[{amount:'3334',dueOn:'2026-01-01'},{amount:'3334',dueOn:'2026-02-01'},{amount:'3333',dueOn:'2026-03-01'}]});
 const shares=billingAllocations(terms);expect(shares.map(s=>s.amount)).toEqual(['3334','3334','3333']);
 for(const share of shares) expect(share.installments.reduce((s,i)=>s+BigInt(i.amount),0n).toString()).toBe(share.amount);
 for(let i=0;i<3;i++) expect(shares.reduce((s,c)=>s+BigInt(c.installments[i].amount),0n).toString()).toBe(terms.installments[i].amount);
 expect(billingAllocations({...terms,agreedAmount:'800000',normalAmount:'1000000',childIds:ids.slice(0,2),installments:[]}).map(s=>s.amount)).toEqual(['400000','400000']);
 expect(agreementTermsSchema.safeParse({...terms,agreedAmount:'12001'}).success).toBe(false);
});
