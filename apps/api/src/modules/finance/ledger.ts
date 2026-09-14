import { randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import { feeCategoryInputSchema,obligationInputSchema,financeQuerySchema,type Capability,type Child } from '@nursery/contracts';
import { denied,requireCapability,requireRecord,requireBranch,type Policy } from '../organization/policy.js';
import { resolveChild,requireChild,requireGuardianChild } from '../children/policy.js';
import { FinancialCore,financeScope,invalid } from './core.js';

export type DueItem={id:string;obligation_id:string;child_id:string;branch_id:string;classroom_id:string|null;child_code:string;child_name:string;category_name:string;category_kind:string;remaining:string;issued_on:string;due_on:string};
export class LedgerService {
  constructor(readonly core:FinancialCore) {}
  async category(token:string,raw:unknown) {
    const input=feeCategoryInputSchema.parse(raw);
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'CATEGORY_CREATE',input,'billing.manage',async()=>{
      // Fee catalog management is a shared installation setting explicitly granted by billing.manage.
      requireCapability(p,'billing.manage'); return [];
    },async()=>{const id=randomUUID();await tx.query('insert into fee_categories(id,code,name,kind) values($1,$2,$3,$4)',[id,input.code,input.name,input.kind]);return {id};}));
  }
  async categories(token:string) {
    return this.core.children.withPolicy(token,async(tx,p)=>{requireCapability(p,'finance.read');return (await tx.query<{id:string;code:string;name:string;kind:string}>('select id,code,name,kind from fee_categories order by code limit 100')).rows;});
  }
  async createObligation(token:string,raw:unknown) {
    const input=obligationInputSchema.parse(raw); let child:Child;
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'OBLIGATION_CREATE',input,'billing.manage',async()=>{
      child=await resolveChild(tx,input.childId,true); requireChild(p,'billing.manage',child);
      return [{branchId:child.branchId,classroomId:child.classroomId??undefined,childId:child.id}];
    },async()=>{
      this.core.date(input.issuedOn);
      if(input.installments.reduce((sum,i)=>sum+BigInt(i.amount),0n)!==BigInt(input.amount)) throw invalid();
      const category=(await tx.query<{name:string;kind:string}>('select name,kind from fee_categories where id=$1',[input.categoryId])).rows[0]; if(!category) throw invalid();
      if(category.kind==='BUS'&&input.installments.length!==1) throw invalid();
      const id=randomUUID();const installmentIds:string[]=[];
      await tx.query(`insert into obligations(id,child_id,branch_id,classroom_id,category_id,category_name,category_kind,child_code,child_name,amount,description,source_reference,issued_on,service_from,service_until,actor_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,[id,child.id,child.branchId,child.classroomId,input.categoryId,category.name,category.kind,child.code,child.fullName,input.amount,input.description,input.sourceReference,input.issuedOn,input.serviceFrom,input.serviceUntil,p.account.id]);
      for(const [index,i] of input.installments.entries()) {const dueId=randomUUID();installmentIds.push(dueId);await tx.query('insert into installments(id,obligation_id,position,due_on,amount) values($1,$2,$3,$4,$5)',[dueId,id,index+1,i.dueOn,i.amount]);}
      return {id,installmentIds};
    }));
  }
  // All settlement adapters lock this same hierarchy before reading canonical balances.
  async lockDue(tx:Transaction,p:Policy,ids:string[],capability:Capability='payments.record',extraChildIds:string[]=[]):Promise<DueItem[]> {
    const unique=[...new Set(ids)].sort();
    if(unique.length!==ids.length) throw invalid();
    const witnesses=(await tx.query<{child_id:string;obligation_id:string}>('select o.child_id,o.id as obligation_id from installments i join obligations o on o.id=i.obligation_id where i.id=any($1::uuid[])',[unique])).rows;
    if(witnesses.length!==ids.length) throw denied();
    await this.core.lockChildren(tx,[...witnesses.map(w=>w.child_id),...extraChildIds]);
    await tx.query('select id from obligations where id=any($1::uuid[]) order by id for update',[[...new Set(witnesses.map(w=>w.obligation_id))].sort()]);
    await tx.query('select id from installments where id=any($1::uuid[]) order by id for update',[unique]);
    const rows=(await tx.query<DueItem>(`select b.id,b.obligation_id,o.child_id,o.branch_id,o.classroom_id,o.child_code,o.child_name,o.category_name,o.category_kind,b.remaining::text,o.issued_on::text,b.due_on::text
      from installment_balances b join obligations o on o.id=b.obligation_id where b.id=any($1::uuid[]) order by b.id`,[unique])).rows;
    for(const row of rows) requireRecord(p,capability,{branchId:row.branch_id,classroomId:row.classroom_id??undefined,childId:row.child_id});
    return rows;
  }
  validateAllocation(row:DueItem,amount:string,date:string) {
    if(BigInt(amount)<=0n || BigInt(amount)>BigInt(row.remaining) || date<row.issued_on || (row.category_kind==='BUS'&&BigInt(amount)!==BigInt(row.remaining))) throw invalid();
  }
  async balances(token:string,raw:unknown,childId?:string) {
    const q=financeQuerySchema.parse(raw);
    return this.core.children.withPolicy(token,async(tx,p)=>{
      let predicate:string;let values:unknown[];
      if(p.account.kind==='GUARDIAN') {
        if(!childId||q.branchId) throw denied();await this.core.enabled(tx);
        await requireGuardianChild(tx,p,childId,'read');await requireGuardianChild(tx,p,childId,'finance');
        predicate='o.child_id=$1';values=[childId];
      } else {
        const scope=financeScope(p,'finance.read','o');predicate=scope.sql;values=[...scope.values];
        if(q.branchId) {requireBranch(p,q.branchId);values.push(q.branchId);predicate+=` and o.branch_id=$${values.length}`;}
        if(childId) {values.push(childId);predicate+=` and o.child_id=$${values.length}`;}
      }
      values.push(q.limit,q.offset);
      return (await tx.query<{totalRemaining:string;items:unknown[]}>(`with visible as (select o.id,o.child_id as "childId",o.branch_id as "branchId",o.child_code as "childCode",o.child_name as "childName",o.category_name as "categoryName",o.description,o.amount::text,b.remaining::text,
        (select json_agg(json_build_object('id',i.id,'dueOn',i.due_on::text,'amount',i.amount::text,'allocated',i.allocated::text,'credited',i.credited::text,'adjustments',i.adjustments::text,'remaining',i.remaining::text) order by i.position) from installment_balances i where i.obligation_id=o.id) as installments
        from obligations o join obligation_balances b on b.id=o.id where ${predicate})
        select coalesce((select sum(remaining::numeric)::text from visible),'0') as "totalRemaining",coalesce((select json_agg(page) from (select * from visible order by id limit $${values.length-1} offset $${values.length}) page),'[]') as items`,values)).rows[0];
    });
  }
}
