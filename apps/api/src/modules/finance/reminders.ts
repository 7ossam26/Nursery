import { emitDueReminders } from '@nursery/db';
import { z } from 'zod';
import { cairoIsoDate } from '@nursery/domain';
import { financeQuerySchema } from '@nursery/contracts';
import { financeScope,invalid } from './core.js';
import type { LedgerService } from './ledger.js';

export class ReminderService {
 constructor(readonly ledger:LedgerService) {}
 async resend(token:string,id:string,raw:unknown) {
  const input=z.object({operationId:z.uuid().transform(v=>v.toLowerCase())}).strict().parse(raw);let rows:Awaited<ReturnType<LedgerService['lockDue']>>;
  return this.ledger.core.children.withPolicy(token,(tx,p)=>this.ledger.core.operation(tx,p,input.operationId,'REMINDER_RESEND',{id,...input},'billing.manage',async()=>{
   rows=await this.ledger.lockDue(tx,p,[id],'billing.manage');return rows.map(r=>({branchId:r.branch_id,classroomId:r.classroom_id??undefined,childId:r.child_id}));
  },async()=>{
   if(rows[0].due_on>=cairoIsoDate()||BigInt(rows[0].remaining)<=0n) throw invalid();
   let notices=0,batch:number;
   do {batch=(await emitDueReminders(tx,cairoIsoDate(),[id],`${p.account.id}/${input.operationId}`,p.account.id)).notices;notices+=batch;}while(batch===200);
   return {notices};
  }));
 }
 async inbox(token:string,raw:unknown) {
  const q=financeQuerySchema.omit({branchId:true}).parse(raw);
  return this.ledger.core.children.withPolicy(token,async(tx,p)=>{
   await this.ledger.core.enabled(tx);const scope=financeScope(p,'finance.read','o');
   return (await tx.query(`select n.id,o.child_id as "childId",o.child_name as "childName",o.category_name as "categoryName",b.due_on::text as "dueOn",b.remaining::text from finance_reminders n join installment_balances b on b.id=n.installment_id join receivable_obligations o on o.id=b.obligation_id where ${scope.sql} and n.recipient_id=$5 and b.remaining>0 and b.due_on<$6::date order by n.created_at desc,n.id limit $7 offset $8`,[...scope.values,p.account.id,cairoIsoDate(),q.limit,q.offset])).rows;
  });
 }
}
