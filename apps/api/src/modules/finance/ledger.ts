import { randomUUID } from 'node:crypto';
import { postObligation,type Transaction } from '@nursery/db';
import { feeCategoryInputSchema,obligationInputSchema,financeQuerySchema,outstandingQuerySchema,type OutstandingPage,type CollectionOptions,type Capability,type Child } from '@nursery/contracts';
import { cairoIsoDate } from '@nursery/domain';
import { denied,requireCapability,requireRecord,requireBranch,type Policy } from '../organization/policy.js';
import { resolveChild,requireChild,requireGuardianChild } from '../children/policy.js';
import { FinancialCore,financeScope,invalid } from './core.js';

export type DueItem={id:string;obligation_id:string;child_id:string;branch_id:string;classroom_id:string|null;child_code:string;child_name:string;category_name:string;category_kind:string;remaining:string;issued_on:string;due_on:string};
export class LedgerService {
  constructor(readonly core:FinancialCore) {}
  async parentOptions(token:string) {
    return this.core.children.withPolicy(token,async(tx,p)=>{
      if(p.account.kind!=='GUARDIAN'||p.account.mustChangePassword) throw denied();
      const enabled=Boolean((await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount);
      const children=enabled?(await tx.query<{id:string;fullName:string}>(`select c.id,c.full_name as "fullName" from children c join guardian_child_links l on l.child_id=c.id where l.guardian_id=$1 and l.active and l.can_read and l.can_finance and c.status='ACTIVE' order by c.id for share of c,l`,[p.account.id])).rows:[];
      return {enabled,children};
    });
  }
  async collectionOptions(token:string):Promise<CollectionOptions> {
    return this.core.children.withPolicy(token,async(tx,p)=>{
      requireCapability(p,'finance.read');
      const canCollect=p.account.capabilities.includes('payments.record') && Boolean((await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount);
      const branches=(await tx.query<CollectionOptions['branches'][number]>('select id,code,name from branches where ($1::boolean or id=any($2::uuid[])) order by code',[p.account.kind==='SYSTEM',p.scope.branchIds])).rows;
      const classrooms=(await tx.query<CollectionOptions['classrooms'][number]>('select id,branch_id as "branchId",name from classrooms where ($1::boolean or branch_id=any($2::uuid[])) and ($3::boolean or id=any($4::uuid[])) order by name',[p.account.kind==='SYSTEM',p.scope.branchIds,p.account.kind==='SYSTEM'||p.scope.mode==='BRANCH',p.scope.classroomIds])).rows;
      // Destination identities are available to scoped collectors; branch cash balances are never included.
      const accounts=canCollect ? (await tx.query<CollectionOptions['accounts'][number]>(`select a.id,a.branch_id as "branchId",a.code,a.name,a.type,d.account_id=a.id as "isDefault" from treasury_accounts a join branch_treasury_defaults d on d.branch_id=a.branch_id where ($1::boolean or a.branch_id=any($2::uuid[])) order by a.code`,[p.account.kind==='SYSTEM',p.scope.branchIds])).rows:[];
      const categories=(await tx.query<CollectionOptions['categories'][number]>('select id,name from fee_categories order by name limit 100')).rows;
      const canRemind=p.account.capabilities.includes('billing.manage') && Boolean((await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount);
      return {canCollect,canRemind,scopeMode:p.scope.mode,branches,classrooms,categories,accounts};
    });
  }
  async outstanding(token:string,raw:unknown):Promise<OutstandingPage> {
    const q=outstandingQuerySchema.parse(raw);
    return this.core.children.withPolicy(token,async(tx,p)=>{
      let predicate:string;let values:unknown[];
      if(p.account.kind==='GUARDIAN') {
        if(!q.childId||q.branchId||q.classroomId||q.categoryId) throw denied();
        await this.core.enabled(tx);await requireGuardianChild(tx,p,q.childId,'read');await requireGuardianChild(tx,p,q.childId,'finance');
        predicate='o.child_id=$1';values=[q.childId];
      } else {
        const scope=financeScope(p,'finance.read','o');predicate=scope.sql;values=[...scope.values];
        if(q.branchId) requireBranch(p,q.branchId);
        for(const [key,column] of [['branchId','branch_id'],['classroomId','classroom_id'],['categoryId','category_id'],['childId','child_id']] as const) if(q[key]) {values.push(q[key]);predicate+=` and o.${column}=$${values.length}`;}
      }
      values.push(cairoIsoDate());const today=values.length;
      let filter='true';
      if(q.status) {values.push(q.status);filter+=` and status=$${values.length}`;}
      if(q.timing) filter+=q.timing==='OVERDUE'?' and overdue':' and remaining::numeric>0 and not overdue';
      values.push(q.limit,q.offset);
      return (await tx.query<OutstandingPage>(`with scoped as (
        select b.id,b.obligation_id as "obligationId",o.child_id as "childId",o.child_code as "childCode",o.child_name as "childName",o.branch_id as "branchId",o.classroom_id as "classroomId",o.category_id as "categoryId",o.category_name as "categoryName",o.category_kind as "categoryKind",o.description,b.due_on::text as "dueOn",b.amount::text,b.allocated::text,b.credited::text,b.adjustments::text,b.remaining::text,
        case when b.remaining=0 then 'PAID' when b.allocated+b.credited>0 then 'PARTIAL' else 'UNPAID' end as status,
        (b.remaining>0 and b.due_on<$${today}::date) as overdue
        from installment_balances b join obligations o on o.id=b.obligation_id where ${predicate}
      ),visible as (select * from scoped where ${filter})
      select coalesce((select sum(remaining::numeric)::text from visible),'0') as "totalRemaining",(select count(*)::int from visible) as "totalCount",
      coalesce((select json_agg(page) from (select * from visible order by "dueOn",id limit $${values.length-1} offset $${values.length}) page),'[]') as items`,values)).rows[0];
    });
  }
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
      return postObligation(tx,p.account.id,child,input);
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
