import { randomUUID } from 'node:crypto';
import { childTransferPreviewSchema,childTransferInputSchema,financeQuerySchema,capacityWarnings,type ChildTransferInput,type ChildTransferPreview,type ChildTransferPage } from '@nursery/contracts';
import { cairoIsoDate } from '@nursery/domain';
import type { Transaction } from '@nursery/db';
import { requireRecord,requireCapability,requireBranch,denied,stale,type Policy } from '../organization/policy.js';
import { resolveChild,requireChild,requireGuardianChild } from '../children/policy.js';
import { FinancialCore,invalid } from './core.js';

type PreviewInput=Omit<ChildTransferInput,'operationId'|'reason'>;
export class ChildTransferService {
 constructor(readonly core:FinancialCore) {}
 private async prepare(tx:Transaction,p:Policy,input:PreviewInput) {
  await this.core.enabled(tx);
  const child=await resolveChild(tx,input.childId,true);
  for(const capability of ['children.manage','billing.manage','finance.read'] as const) {
   requireChild(p,capability,child);
   requireRecord(p,capability,{branchId:input.destinationBranchId,classroomId:input.destinationClassroomId??undefined});
  }
  if(child.version!==input.expectedVersion||child.branchId!==input.sourceBranchId) throw stale();
  if(child.status==='ARCHIVED'||input.effectiveOn!==cairoIsoDate()||input.destinationBranchId===child.branchId) throw invalid();
  if(!(await tx.query('select 1 from branches where id=$1',[input.destinationBranchId])).rowCount) throw denied();
  let warnings:string[]=[];
  if(input.destinationClassroomId) {
   const room=(await tx.query<{capacity:number;branch_id:string}>('select capacity,branch_id from classrooms where id=$1',[input.destinationClassroomId])).rows[0];
   if(!room||room.branch_id!==input.destinationBranchId) throw denied();
   const count=(await tx.query<{n:number}>("select count(*)::int n from children where classroom_id=$1 and status='ACTIVE'",[input.destinationClassroomId])).rows[0].n;
   warnings=capacityWarnings(room.capacity,count+(child.status==='ACTIVE'?1:0));
  }
  // Target child precedes sorted agreements, obligations, installments. A worker must
  // own every agreement child before taking its agreement lock; no sibling is acquired here.
  await tx.query('select a.id from billing_agreements a join billing_children b on b.agreement_id=a.id where b.child_id=$1 order by a.id for update of a',[child.id]);
  await tx.query('select id from obligations where child_id=$1 order by id for update',[child.id]);
  await tx.query('select i.id from installments i join obligations o on o.id=i.obligation_id where o.child_id=$1 order by i.id for update of i',[child.id]);
  const owners=(await tx.query<{branchId:string;classroomId:string|null}>('select distinct branch_id as "branchId",classroom_id as "classroomId" from receivable_obligations where child_id=$1',[child.id])).rows;
  const resources=owners.map(o=>({branchId:o.branchId,classroomId:o.classroomId??undefined,childId:child.id}));
  for(const resource of resources) for(const capability of ['children.manage','billing.manage','finance.read'] as const) requireRecord(p,capability,resource);
  const items=(await tx.query<ChildTransferPreview['items'][number]>(`select b.id as "installmentId",o.id as "obligationId",o.category_name as "categoryName",b.due_on::text as "dueOn",b.remaining::text
   from installment_balances b join receivable_obligations o on o.id=b.obligation_id where o.child_id=$1 and b.remaining>0 order by b.due_on,b.id`,[child.id])).rows;
  return {child,resources,preview:{childId:child.id,childCode:child.code,childName:child.fullName,sourceBranchId:child.branchId,sourceClassroomId:child.classroomId,destinationBranchId:input.destinationBranchId,destinationClassroomId:input.destinationClassroomId,effectiveOn:input.effectiveOn,amount:items.reduce((n,i)=>n+BigInt(i.remaining),0n).toString(),items,warnings}};
 }
 async preview(token:string,raw:unknown) {
  const input=childTransferPreviewSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>(await this.prepare(tx,p,input)).preview);
 }
 async transfer(token:string,raw:unknown) {
  const input=childTransferInputSchema.parse(raw);let prepared:Awaited<ReturnType<ChildTransferService['prepare']>>;
  return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'CHILD_BRANCH_TRANSFER',input,'children.manage',async()=>{
   prepared=await this.prepare(tx,p,input);
   return [...prepared.resources,{branchId:input.sourceBranchId,classroomId:prepared.child.classroomId??undefined,childId:input.childId},{branchId:input.destinationBranchId,classroomId:input.destinationClassroomId??undefined,childId:input.childId}];
  },async()=>{
   const {child,preview}=prepared,id=randomUUID();
   await tx.query(`insert into child_branch_transfers(id,child_id,child_code,child_name,source_branch_id,destination_branch_id,source_classroom_id,destination_classroom_id,effective_on,amount,reason,actor_id,operation_id)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,child.id,child.code,child.fullName,child.branchId,input.destinationBranchId,child.classroomId,input.destinationClassroomId,input.effectiveOn,preview.amount,input.reason,p.account.id,input.operationId]);
   await tx.query('insert into receivable_ownership(obligation_id,transfer_id) select id,$2 from obligations where child_id=$1',[child.id,id]);
   for(const item of preview.items) await tx.query('insert into transferred_due_items(transfer_id,installment_id,amount,due_on) values($1,$2,$3,$4)',[id,item.installmentId,item.remaining,item.dueOn]);
   await tx.query('update children set branch_id=$2,classroom_id=$3,version=version+1 where id=$1',[child.id,input.destinationBranchId,input.destinationClassroomId]);
   await tx.query('insert into child_classroom_history(id,child_id,actor_id,branch_id,previous_classroom_id,classroom_id,effective_on,reason,child_name_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),child.id,p.account.id,input.destinationBranchId,child.classroomId,input.destinationClassroomId,input.effectiveOn,input.reason,child.fullName]);
   await this.core.children.audit(tx,p,child,'child.branch_transferred',child,{transferId:id,...preview,reason:input.reason});
   await tx.query("insert into child_integration_events(id,child_id,kind,effective_on,payload) values($1,$2,'child.branch_transferred',$3,$4)",[randomUUID(),child.id,input.effectiveOn,JSON.stringify({transferId:id,sourceBranchId:child.branchId,destinationBranchId:input.destinationBranchId,transportAction:'REVIEW_REQUIRED',eventAction:'REVIEW_REQUIRED',automaticEnrollment:false,feeAction:'PRESERVE_EXISTING_REFERENCES'})]);
   return {id,version:child.version+1,...preview};
  },async()=>{
   // Replay retains the original transfer even after a later move, but needs all original authority.
   const old=(await tx.query<{resources:{branchId:string;classroomId?:string;childId?:string}[]}>('select resources from financial_operations where actor_id=$1 and operation_id=$2',[p.account.id,input.operationId])).rows[0];
   if(!old) throw denied();
   for(const capability of ['billing.manage','finance.read'] as const) for(const resource of old.resources) requireRecord(p,capability,resource);
  }),[],true);
 }
 async history(token:string,raw:unknown,childId?:string):Promise<ChildTransferPage> {
  const q=financeQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   let predicate:string,values:unknown[];
   if(p.account.kind==='GUARDIAN') {
    if(!childId||q.branchId) throw denied();await this.core.enabled(tx);await requireGuardianChild(tx,p,childId,'read');await requireGuardianChild(tx,p,childId,'finance');
    predicate='t.child_id=$1';values=[childId];
   } else {
    requireCapability(p,'finance.read');if(q.branchId) requireBranch(p,q.branchId);
    predicate=`(($1::boolean or t.source_branch_id=any($2::uuid[])) and ($3::boolean or t.source_classroom_id=any($4::uuid[])) or ($1::boolean or t.destination_branch_id=any($2::uuid[])) and ($3::boolean or t.destination_classroom_id=any($4::uuid[])))`;
    values=[p.account.kind==='SYSTEM',p.scope.branchIds,p.account.kind==='SYSTEM'||p.scope.mode==='BRANCH',p.scope.classroomIds];
    if(childId){values.push(childId);predicate+=` and t.child_id=$${values.length}`;}
   }
   values.push(q.branchId??null);const branch=values.length;
   predicate+=` and ($${branch}::uuid is null or t.source_branch_id=$${branch} or t.destination_branch_id=$${branch})`;
   values.push(q.limit,q.offset);
   return (await tx.query<ChildTransferPage>(`with visible as (select t.* from child_branch_transfers t where ${predicate})
    select (select count(*)::int from visible) as "totalCount",
    coalesce((select sum(amount)::text from visible where destination_branch_id=$${branch}),'0') as "totalIn",
    coalesce((select sum(amount)::text from visible where source_branch_id=$${branch}),'0') as "totalOut",
    coalesce((select json_agg(page) from (select t.id,(select code from branches where id=t.source_branch_id) as "sourceBranchCode",(select code from branches where id=t.destination_branch_id) as "destinationBranchCode",t.child_id as "childId",t.child_code as "childCode",t.child_name as "childName",t.source_branch_id as "sourceBranchId",t.destination_branch_id as "destinationBranchId",t.source_classroom_id as "sourceClassroomId",t.destination_classroom_id as "destinationClassroomId",t.effective_on::text as "effectiveOn",t.amount::text,t.reason,a.username_normalized as actor,
     coalesce((select json_agg(json_build_object('installmentId',x.installment_id,'obligationId',o.id,'categoryName',o.category_name,'dueOn',x.due_on::text,'remaining',x.amount::text) order by x.due_on,x.installment_id) from transferred_due_items x join installments i on i.id=x.installment_id join obligations o on o.id=i.obligation_id where x.transfer_id=t.id),'[]') as items
     from visible t join accounts a on a.id=t.actor_id order by t.sequence desc limit $${values.length-1} offset $${values.length}) page),'[]') as items`,values)).rows[0];
  });
 }
}
