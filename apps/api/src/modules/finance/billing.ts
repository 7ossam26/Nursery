import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { agreementDraftSchema,agreementActionSchema,agreementPriceSchema,agreementPauseSchema,agreementEndSchema,agreementCatchupSchema,financeQuerySchema,type BillingAgreement,type Capability } from '@nursery/contracts';
import { billingAllocations,cairoIsoDate,monthStart } from '@nursery/domain';
import { lockAgreement,generateAgreement,issueBillingPeriod,billingCatchupPreview,agreementProjection,type AgreementRow,type Transaction } from '@nursery/db';
import { requireCapability,stale,denied,type Policy } from '../organization/policy.js';
import { resolveChild,requireChild,staffChildScope } from '../children/policy.js';
import { FinancialCore,invalid } from './core.js';
export class BillingService {
 constructor(readonly core:FinancialCore) {}
 async options(token:string,raw:unknown) {
  const q=z.object({search:z.string().trim().max(100).default(''),offset:z.coerce.number().int().min(0).max(100000).default(0),ids:z.string().max(800).optional()}).strict().parse(raw);
  const ids=q.ids?z.array(z.uuid()).max(20).parse(q.ids.split(',')):null;
  return this.core.children.withPolicy(token,async(tx,p)=>{
   const scope=staffChildScope(p,'billing.manage');
   return (await tx.query<{id:string;code:string;name:string}>(`select c.id,c.code,c.full_name as name from children c where ${scope.sql} and c.status<>'ARCHIVED' and (c.code ilike $5 or c.full_name ilike $5) and ($6::uuid[] is null or c.id=any($6)) order by c.code,c.id limit 20 offset $7`,[...scope.values,`%${q.search}%`,ids,q.offset])).rows;
  });
 }
 async authorize(tx:Transaction,p:Policy,a:AgreementRow,capability:Capability='billing.manage') {
  const resources=[];
  for(const id of [...a.terms.childIds].sort()) {const c=await resolveChild(tx,id);requireChild(p,capability,c);resources.push({childId:id,branchId:c.branchId,classroomId:c.classroomId??undefined});}
  return resources;
 }
 async draft(token:string,raw:unknown) {
  const input=agreementDraftSchema.parse(raw),terms=input.terms;
  return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'BILLING_DRAFT',input,'billing.manage',async()=>{
   await this.core.lockChildren(tx,terms.childIds);
   for(const id of terms.childIds) if((await resolveChild(tx,id)).status==='ARCHIVED') throw invalid();
   return this.authorize(tx,p,{terms} as AgreementRow);
  },async()=>{
   const category=(await tx.query<{kind:string}>('select kind from fee_categories where id=$1',[terms.categoryId])).rows[0];
   if(!category||(terms.mode==='ADDITIONAL'?category.kind!=='ADDITIONAL':category.kind!=='TUITION')) throw invalid();
   const id=randomUUID(),allocations=billingAllocations(terms),firstAllocations=terms.firstAgreedAmount!=null?billingAllocations({...terms,agreedAmount:terms.firstAgreedAmount}):null;
   await tx.query("insert into billing_agreements(id,actor_id,status,terms,allocations,first_allocations) values($1,$2,'DRAFT',$3,$4,$5)",[id,p.account.id,JSON.stringify(terms),JSON.stringify(allocations),firstAllocations?JSON.stringify(firstAllocations):null]);
   for(const childId of terms.childIds) await tx.query('insert into billing_children(agreement_id,child_id) values($1,$2)',[id,childId]);
   return {id,version:1,status:'DRAFT' as const,terms,allocations,firstAllocations};
  },async()=>{await this.authorize(tx,p,{terms} as AgreementRow);}));
 }
 private async action<T>(token:string,id:string,input:{operationId:string;expectedVersion:number},name:string,work:(tx:Transaction,p:Policy,a:AgreementRow)=>Promise<T>) {
  let a:AgreementRow;
  return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,name,{id,...input},'billing.manage',async()=>{
   const row=await lockAgreement(tx,id);if(!row) throw denied();a=row;
   const resources=await this.authorize(tx,p,a);if(a.version!==input.expectedVersion) throw stale();return resources;
  },async()=>{const result=await work(tx,p,a);await tx.query('update billing_agreements set version=version+1 where id=$1',[id]);return {version:a.version+1,...result};},async()=>{const row=await lockAgreement(tx,id);if(!row) throw denied();await this.authorize(tx,p,row);}));
 }
 async approve(token:string,id:string,raw:unknown) {
  return this.action(token,id,agreementActionSchema.parse(raw),'BILLING_APPROVE',async(tx,p,a)=>{
   if(a.status!=='DRAFT') throw invalid();
   for(const childId of a.terms.childIds) if((await resolveChild(tx,childId)).status==='ARCHIVED') throw invalid();
   // The approver becomes the durable authority of generated obligations.
   a.actor_id=p.account.id;a.status='APPROVED';a.next_period=a.terms.firstPeriod;
   await tx.query("update billing_agreements set status='APPROVED',actor_id=$2,next_period=$3 where id=$1",[id,p.account.id,a.next_period]);
   if(a.terms.mode==='MONTHLY') await generateAgreement(tx,a,cairoIsoDate(),true);
   else await issueBillingPeriod(tx,a,a.terms.startsOn,a.allocations,cairoIsoDate());
   return {id};
  });
 }
 async price(token:string,id:string,raw:unknown) {
  const input=agreementPriceSchema.parse(raw);
  return this.action(token,id,input,'BILLING_PRICE',async(tx,p,a)=>{
   if(a.status!=='APPROVED'||a.terms.mode!=='MONTHLY'||input.effectiveFrom<=monthStart(cairoIsoDate())||input.effectiveFrom<=a.terms.firstPeriod!||a.ended_on) throw invalid();
   if((await tx.query('select 1 from recurrence_occurrences where agreement_id=$1 and service_period_start>=$2',[id,input.effectiveFrom])).rowCount) throw invalid();
   const allocations=billingAllocations({...a.terms,...input.price});
   await tx.query('insert into agreement_versions(id,agreement_id,effective_from,normal_amount,agreed_amount,allocations,reason,actor_id) values($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,input.effectiveFrom,input.price.normalAmount,input.price.agreedAmount,JSON.stringify(allocations),input.reason,p.account.id]);
   return {allocations};
  });
 }
 async pause(token:string,id:string,raw:unknown) {
  const input=agreementPauseSchema.parse(raw);
  return this.action(token,id,input,'BILLING_PAUSE',async(tx,p,a)=>{
   if(a.status!=='APPROVED'||a.terms.mode!=='MONTHLY'||input.from<=monthStart(cairoIsoDate())||a.ended_on) throw invalid();
   if((await tx.query('select 1 from recurrence_occurrences where agreement_id=$1 and service_period_start between $2 and $3',[id,input.from,input.until])).rowCount) throw invalid();
   await tx.query('insert into billing_pauses(id,agreement_id,from_period,until_period,reason,actor_id) values($1,$2,$3,$4,$5,$6)',[randomUUID(),id,input.from,input.until,input.reason,p.account.id]);return {id};
  });
 }
 async end(token:string,id:string,raw:unknown) {
  const input=agreementEndSchema.parse(raw);
  return this.action(token,id,input,'BILLING_END',async(tx,_p,a)=>{
   if(a.status!=='APPROVED'||a.terms.mode!=='MONTHLY'||input.endsOn<cairoIsoDate()||a.ended_on) throw invalid();
   await tx.query('update billing_agreements set ended_on=$2 where id=$1',[id,input.endsOn]);return {id};
  });
 }
 async preview(token:string,id:string) {
  return this.core.children.withPolicy(token,async(tx,p)=>{await this.core.enabled(tx);const a=await lockAgreement(tx,id);if(!a) throw denied();await this.authorize(tx,p,a);return billingCatchupPreview(tx,a);});
 }
 async catchup(token:string,id:string,raw:unknown) {
  const input=agreementCatchupSchema.parse(raw);
  return this.action(token,id,input,'BILLING_CATCHUP',async(tx,p,a)=>{
   const preview=await billingCatchupPreview(tx,a);if(preview.previewHash!==input.previewHash||!preview.periods.length) throw stale();
   for(const period of preview.periods) {
    await issueBillingPeriod(tx,a,period.period,period.allocations,cairoIsoDate());
    await tx.query("update billing_periods set state='GENERATED' where agreement_id=$1 and period=$2",[id,period.period]);
   }
   await tx.query('insert into billing_catchup_approvals(id,agreement_id,actor_id,preview_hash,periods) values($1,$2,$3,$4,$5)',[randomUUID(),id,p.account.id,input.previewHash,JSON.stringify(preview.periods)]);return {periods:preview.periods.length};
  });
 }
 async list(token:string,raw:unknown) {
  const q=financeQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'finance.read');const scope=staffChildScope(p,'finance.read');
   const rows=(await tx.query<AgreementRow>(`select ${agreementProjection} from billing_agreements a where not exists(select 1 from billing_children b join children c on c.id=b.child_id where b.agreement_id=a.id and not (${scope.sql})) and ($7::uuid is null or exists(select 1 from billing_children b join children c on c.id=b.child_id where b.agreement_id=a.id and c.branch_id=$7)) order by a.id limit $5 offset $6`,[...scope.values,q.limit,q.offset,q.branchId??null])).rows;
   const items=[];
   for(const a of rows) items.push({...this.dto(a),childNames:Object.fromEntries((await tx.query<{id:string;full_name:string}>('select id,full_name from children where id=any($1::uuid[])',[a.terms.childIds])).rows.map(c=>[c.id,c.full_name])),endedOn:a.ended_on,prices:(await tx.query('select effective_from::text,normal_amount::text,agreed_amount::text,allocations from agreement_versions where agreement_id=$1 order by effective_from',[a.id])).rows,pauses:(await tx.query('select from_period::text,until_period::text,reason from billing_pauses where agreement_id=$1 order by from_period',[a.id])).rows});
   return items;
  });
 }
 dto(a:AgreementRow):BillingAgreement {return {id:a.id,version:a.version,status:a.status,terms:a.terms,allocations:a.allocations,firstAllocations:a.first_allocations};}
}
