import { randomUUID } from 'node:crypto';
import type { Transaction } from './index.js';
import { obligationInputSchema,type Child } from '@nursery/contracts';
import type { z } from 'zod';
export async function postObligation(tx:Transaction,actorId:string,child:Child,raw:z.infer<typeof obligationInputSchema>) {
 const input=obligationInputSchema.parse(raw);
 if(input.installments.reduce((s,i)=>s+BigInt(i.amount),0n)!==BigInt(input.amount)) throw new RangeError('Invalid installment sum');
 const category=(await tx.query<{name:string;kind:string}>('select name,kind from fee_categories where id=$1',[input.categoryId])).rows[0];
 if(!category||(category.kind==='BUS'&&input.installments.length!==1)) throw new RangeError('Invalid category');
 const id=randomUUID(),installmentIds:string[]=[];
 await tx.query(`insert into obligations(id,child_id,branch_id,classroom_id,category_id,category_name,category_kind,child_code,child_name,amount,description,source_reference,issued_on,service_from,service_until,actor_id)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[id,child.id,child.branchId,child.classroomId,input.categoryId,category.name,category.kind,child.code,child.fullName,input.amount,input.description,input.sourceReference,input.issuedOn,input.serviceFrom,input.serviceUntil,actorId]);
 for(const [index,i] of input.installments.entries()) {const dueId=randomUUID();installmentIds.push(dueId);await tx.query('insert into installments(id,obligation_id,position,due_on,amount) values($1,$2,$3,$4,$5)',[dueId,id,index+1,i.dueOn,i.amount]);}
 return {id,installmentIds};
}
