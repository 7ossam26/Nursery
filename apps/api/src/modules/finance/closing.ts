import { randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import { closingInputSchema,reopenInputSchema,closingAdjustmentInputSchema,closingQuerySchema,closingCurrentQuerySchema,signedAmountSchema,type DailyClosing,type ClosingOptions } from '@nursery/contracts';
import { cairoIsoDate } from '@nursery/domain';
import { requireCapability,requireRecord,requireSensitiveCorrection,requireBranch,denied,stale,type Policy } from '../organization/policy.js';
import { FinancialCore,invalid } from './core.js';
import { TreasuryService } from './treasury.js';
import { SafeError } from '../../errors.js';

type Head={id:string;account_id:string;business_date:string;revision:number;action:'COUNTED'|'REOPENED';expected:string;counted:string;difference:string;branch_id:string};
export class ClosingService {
 constructor(readonly core:FinancialCore,readonly treasury:TreasuryService) {}
 async options(token:string):Promise<ClosingOptions> {
  return this.core.children.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'finance.read');if(p.account.kind!=='SYSTEM'&&p.scope.mode!=='BRANCH') throw denied();const enabled=Boolean((await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount),canCount=enabled&&p.account.capabilities.includes('treasury.close');
   return {canCount,canCorrect:canCount&&p.sensitiveFinancialEdit&&p.account.capabilities.includes('finance.correct'),accounts:(await tx.query<ClosingOptions['accounts'][number]>(`select a.id,a.code,a.name,a.branch_id as "branchId",b.balance::text from treasury_accounts a join treasury_balances b on b.id=a.id where a.type='CASH' and ($1::boolean or a.branch_id=any($2::uuid[])) order by a.code limit 100`,[p.account.kind==='SYSTEM',p.scope.branchIds])).rows};
  });
 }
 async assertOpen(tx:Transaction,accountId:string,date:string,exemptId:string|null=null) {
  await this.core.cashDateOpen(tx,[accountId],date,exemptId);
 }
 async current(token:string,raw:unknown) {
  const q=closingCurrentQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   const a=(await tx.query<{branch_id:string}>('select branch_id from treasury_accounts where id=$1',[q.accountId])).rows[0];if(!a) throw denied();requireRecord(p,'finance.read',{branchId:a.branch_id});
   const h=await this.head(tx,q.accountId,q.on);return {id:h?.id??null,revision:h?.revision??0,action:h?.action??null};
  });
 }
 async head(tx:Transaction,accountId:string,on:string) {
  return (await tx.query<Head>('select c.id,c.account_id,c.business_date::text,c.revision,c.action,c.expected::text,c.counted::text,c.difference::text,a.branch_id from daily_closing_heads c join treasury_accounts a on a.id=c.account_id where c.account_id=$1 and c.business_date=$2',[accountId,on])).rows[0];
 }
 async lockHead(tx:Transaction,p:Policy,id:string,sensitive:boolean):Promise<Head> {
  const owner=(await tx.query<{account_id:string;business_date:string}>('select account_id,business_date::text from daily_closings where id=$1',[id])).rows[0];if(!owner) throw denied();
  const [a]=await this.treasury.lockAccounts(tx,p,[owner.account_id]);requireRecord(p,'treasury.close',{branchId:a.branch_id});if(sensitive) requireSensitiveCorrection(p,{branchId:a.branch_id});
  const h=await this.head(tx,a.id,owner.business_date);if(!h||h.id!==id) throw stale();return h;
 }
 async count(token:string,raw:unknown) {
  const input=closingInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   let branchId:string;
   return this.core.operation(tx,p,input.operationId,'CASH_COUNT',input,'treasury.close',async()=>{const [a]=await this.treasury.lockAccounts(tx,p,[input.accountId]);requireRecord(p,'treasury.close',{branchId:a.branch_id});if(a.type!=='CASH') throw invalid();branchId=a.branch_id;return [{branchId}];},async()=>{
    this.core.date(input.on);const old=await this.head(tx,input.accountId,input.on);if((old?.revision??0)!==input.expectedRevision) throw stale();if(old?.action==='COUNTED') throw new SafeError('VALIDATION_ERROR','closing.reopenFirst',false,409);
    // A new older count would make later count context ambiguous; reopen later dates first.
    await this.assertOpen(tx,input.accountId,input.on);
    const expected=(await tx.query<{amount:string}>('select treasury_balance_on($1,$2)::text as amount',[input.accountId,input.on])).rows[0].amount;
    const id=randomUUID(),revision=(old?.revision??0)+1;return (await tx.query<{id:string;revision:number;expected:string;counted:string;difference:string}>("insert into daily_closings(id,account_id,business_date,revision,action,expected,counted,supersedes_id,reason,actor_id,operation_id) values($1,$2,$3,$4,'COUNTED',$5,$6,$7,$8,$9,$10) returning id,revision,expected::text,counted::text,difference::text",[id,input.accountId,input.on,revision,expected,input.countedAmount,old?.id??null,input.reason,p.account.id,input.operationId])).rows[0];
   });
  });
 }
 async reopen(token:string,id:string,raw:unknown) {
  const input=reopenInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   let h:Head;return this.core.operation(tx,p,input.operationId,'CASH_REOPEN',{id,...input},'finance.correct',async()=>{h=await this.lockHead(tx,p,id,true);return [{branchId:h.branch_id}];},async()=>{
    if(h.revision!==input.expectedRevision) throw stale();if(h.action!=='COUNTED') throw invalid();
    const next=randomUUID();await tx.query("insert into daily_closings(id,account_id,business_date,revision,action,expected,counted,supersedes_id,reason,actor_id,operation_id) values($1,$2,$3,$4,'REOPENED',$5,$6,$7,$8,$9,$10)",[next,h.account_id,h.business_date,h.revision+1,h.expected,h.counted,h.id,input.reason,p.account.id,input.operationId]);return {id:next,revision:h.revision+1};
   },async()=>{requireCapability(p,'treasury.close');const owner=(await tx.query<{branch_id:string}>('select a.branch_id from daily_closings c join treasury_accounts a on a.id=c.account_id where c.id=$1',[id])).rows[0];if(!owner) throw denied();requireSensitiveCorrection(p,{branchId:owner.branch_id});});
  });
 }
 async adjust(token:string,id:string,raw:unknown) {
  const input=closingAdjustmentInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   let h:Head;return this.core.operation(tx,p,input.operationId,'CASH_DIFFERENCE_ADJUSTMENT',{id,...input},'finance.correct',async()=>{h=await this.lockHead(tx,p,id,true);return [{branchId:h.branch_id}];},async()=>{
    if(h.revision!==input.expectedRevision) throw stale();if(h.action!=='COUNTED'||h.difference==='0'||input.effectiveOn!==cairoIsoDate()||input.effectiveOn<h.business_date) throw invalid();
    const amount=signedAmountSchema.parse(h.difference);await this.assertOpen(tx,h.account_id,input.effectiveOn,h.id);
    const adjustmentId=randomUUID();await tx.query('insert into closing_adjustments(id,closing_id,account_id,amount,effective_on,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8)',[adjustmentId,h.id,h.account_id,amount,input.effectiveOn,input.reason,p.account.id,input.operationId]);
    await tx.query("insert into treasury_movements(id,account_id,kind,closing_adjustment_id,amount,effective_on,reason,actor_id) values($1,$2,'CLOSING_ADJUSTMENT',$3,$4,$5,$6,$7)",[randomUUID(),h.account_id,adjustmentId,amount,input.effectiveOn,input.reason,p.account.id]);return {id:adjustmentId,amount};
   },async()=>{requireCapability(p,'treasury.close');const owner=(await tx.query<{branch_id:string}>('select a.branch_id from daily_closings c join treasury_accounts a on a.id=c.account_id where c.id=$1',[id])).rows[0];if(!owner) throw denied();requireSensitiveCorrection(p,{branchId:owner.branch_id});});
  });
 }
 async list(token:string,raw:unknown):Promise<DailyClosing[]> {
  const q=closingQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'finance.read');if(p.account.kind!=='SYSTEM'&&p.scope.mode!=='BRANCH') throw denied();if(q.branchId) requireBranch(p,q.branchId);
   return (await tx.query<DailyClosing>(`select c.id,c.account_id as "accountId",a.code as "accountCode",a.branch_id as "branchId",c.business_date::text as "on",c.revision,not exists(select 1 from daily_closings successor where successor.supersedes_id=c.id) as "isCurrent",c.action,c.expected::text,c.counted::text,c.difference::text,c.reason,u.username_normalized as actor,
     j.id as "adjustmentId",j.effective_on::text as "adjustmentDate" from daily_closings c join treasury_accounts a on a.id=c.account_id join accounts u on u.id=c.actor_id left join closing_adjustments j on j.closing_id=c.id
     where ($1::boolean or a.branch_id=any($2::uuid[])) and ($3::uuid is null or a.branch_id=$3) and ($4::uuid is null or a.id=$4) order by c.business_date desc,a.code,c.revision desc limit $5 offset $6`,[p.account.kind==='SYSTEM',p.scope.branchIds,q.branchId??null,q.accountId??null,q.limit,q.offset])).rows;
  });
 }
}
