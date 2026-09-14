import { randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import { treasuryAccountInputSchema,treasuryDefaultInputSchema,financeQuerySchema,type FinanceOptions,type TreasuryAccount } from '@nursery/contracts';
import { denied,requireCapability,requireBranch,requireRecord,stale,type Policy } from '../organization/policy.js';
import { FinancialCore,invalid } from './core.js';

export type LockedAccount={id:string;branch_id:string;code:string;type:TreasuryAccount['type'];opened_on:string};
export class TreasuryService {
  constructor(readonly core:FinancialCore) {}
  async lockAccounts(tx:Transaction,p:Policy,ids:string[]):Promise<LockedAccount[]> {
    const unique=[...new Set(ids)].sort();
    const rows=(await tx.query<LockedAccount>('select id,branch_id,code,type,opened_on::text from treasury_accounts where id=any($1::uuid[]) order by id for update',[unique])).rows;
    if(rows.length!==unique.length) throw denied();
    for(const account of rows) requireBranch(p,account.branch_id);
    return rows;
  }
  // Internal source-specific posting only; callers own the authenticated transaction and account locks.
  async postReceiptInTransaction(tx:Transaction,p:Policy,receiptId:string) {
    requireCapability(p,'payments.record');
    const receipt=(await tx.query<{branch_id:string;account_id:string;lines:{childId:string;classroomId:string|null}[]}>('select branch_id,account_id,lines from receipts where id=$1',[receiptId])).rows[0];
    if(!receipt || !receipt.lines.length) throw denied();
    for(const line of receipt.lines) requireRecord(p,'payments.record',{branchId:receipt.branch_id,classroomId:line.classroomId??undefined,childId:line.childId});
    await this.lockAccounts(tx,p,[receipt.account_id]);
    const posted=await tx.query(`insert into treasury_movements(id,account_id,kind,receipt_id,amount,effective_on,reason,actor_id)
      select $1,account_id,'RECEIPT',id,amount,collected_on,'External receipt',$2 from receipts where id=$3`,[randomUUID(),p.account.id,receiptId]);
    if(posted.rowCount!==1) throw invalid();
  }
  async options(token:string):Promise<FinanceOptions> {
    return this.core.children.withPolicy(token,async(tx,p)=>{
      requireCapability(p,'finance.read');
      if(p.account.kind!=='SYSTEM' && p.scope.mode!=='BRANCH') throw denied();
      return {branches:(await tx.query<{id:string;code:string;name:string}>('select id,code,name from branches where ($1::boolean or id=any($2::uuid[])) order by code limit 100',[p.account.kind==='SYSTEM',p.scope.branchIds])).rows,canManage:p.account.capabilities.includes('treasury.manage') && Boolean((await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount)};
    });
  }
  async createAccount(token:string,raw:unknown) {
    const input=treasuryAccountInputSchema.parse(raw);
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'ACCOUNT_CREATE',input,'treasury.manage',async()=>{
      this.core.branch(p,'treasury.manage',input.branchId);
      if(!(await tx.query('select id from branches where id=$1 for update',[input.branchId])).rowCount) throw denied();
      return [{branchId:input.branchId}];
    },async()=>{
      this.core.date(input.openedOn);
      const mapping=(await tx.query('select account_id from branch_treasury_defaults where branch_id=$1',[input.branchId])).rows[0];
      if(!mapping && input.type!=='CASH') throw invalid();
      const id=randomUUID();
      await tx.query('insert into treasury_accounts(id,branch_id,code,name,type,opened_on) values($1,$2,$3,$4,$5,$6)',[id,input.branchId,input.code,input.name,input.type,input.openedOn]);
      await tx.query("insert into treasury_movements(id,account_id,kind,amount,effective_on,reason,actor_id) values($1,$2,'OPENING_BALANCE',$3,$4,$5,$6)",[randomUUID(),id,input.openingAmount,input.openedOn,input.reason,p.account.id]);
      if(!mapping) await tx.query('insert into branch_treasury_defaults(branch_id,account_id,version) values($1,$2,1)',[input.branchId,id]);
      return {id};
    }));
  }
  async setDefault(token:string,branchId:string,raw:unknown) {
    const input=treasuryDefaultInputSchema.parse(raw);
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'ACCOUNT_DEFAULT',{branchId,...input},'treasury.manage',async()=>{
      this.core.branch(p,'treasury.manage',branchId); await tx.query('select id from branches where id=$1 for update',[branchId]);
      return [{branchId}];
    },async()=>{
      const [a]=await this.lockAccounts(tx,p,[input.accountId]); if(a.branch_id!==branchId||a.type!=='CASH') throw invalid();
      const result=await tx.query('update branch_treasury_defaults set account_id=$1,version=version+1 where branch_id=$2 and version=$3 returning version',[a.id,branchId,input.expectedVersion]);
      if(!result.rowCount) throw stale(); return {version:result.rows[0].version as number};
    }));
  }
  async accounts(token:string,raw:unknown) {
    const q=financeQuerySchema.parse(raw);
    return this.core.children.withPolicy(token,async(tx,p)=>{
      requireCapability(p,'finance.read'); if(p.account.kind!=='SYSTEM'&&p.scope.mode!=='BRANCH') throw denied(); if(q.branchId) requireBranch(p,q.branchId);
      return (await tx.query<TreasuryAccount>(`select a.id,a.branch_id as "branchId",a.code,a.name,a.type,a.opened_on::text as "openedOn",b.balance::text,
        d.account_id=a.id as "isDefault",d.version as "defaultVersion" from treasury_accounts a join treasury_balances b on b.id=a.id join branch_treasury_defaults d on d.branch_id=a.branch_id
        where ($1::boolean or a.branch_id=any($2::uuid[])) and ($3::uuid is null or a.branch_id=$3) order by a.code limit $4 offset $5`,[p.account.kind==='SYSTEM',p.scope.branchIds,q.branchId??null,q.limit,q.offset])).rows;
    });
  }
  async movements(token:string,accountId:string,raw:unknown) {
    const q=financeQuerySchema.omit({branchId:true}).parse(raw);
    return this.core.children.withPolicy(token,async(tx,p)=>{
      const a=(await tx.query<{branch_id:string}>('select branch_id from treasury_accounts where id=$1',[accountId])).rows[0];
      if(!a) throw denied(); this.core.branch(p,'finance.read',a.branch_id);
      return (await tx.query<{id:string;kind:string;receiptId:string|null;amount:string;effectiveOn:string;reason:string}>('select id,kind,receipt_id as "receiptId",amount::text,effective_on::text as "effectiveOn",reason from treasury_movements where account_id=$1 order by effective_on,id limit $2 offset $3',[accountId,q.limit,q.offset])).rows;
    });
  }
}
