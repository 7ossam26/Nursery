import { randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import { collectionInputSchema,creditReceiptInputSchema,applyCreditInputSchema,financeQuerySchema,type Receipt,type PaymentResult,type CollectionInput } from '@nursery/contracts';
import { denied,requireCapability,requireRecord,requireBranch,type Policy } from '../organization/policy.js';
import { requireGuardianChild,resolveChild,requireChild } from '../children/policy.js';
import { FinancialCore,invalid } from './core.js';
import { LedgerService,type DueItem } from './ledger.js';
import { TreasuryService,type LockedAccount } from './treasury.js';

const receiptColumns=`r.id,r.reference,r.branch_id as "branchId",r.branch_code as "branchCode",r.account_id as "accountId",r.account_code as "accountCode",r.method,r.collected_on::text as "collectedOn",r.payer_name as "payerName",r.external_reference as "externalReference",r.amount::text,r.kind,r.lines`;
export class PaymentService {
  constructor(readonly core:FinancialCore,readonly ledger:LedgerService,readonly treasury:TreasuryService) {}
  private resources(rows:DueItem[]) {return rows.map(r=>({branchId:r.branch_id,classroomId:r.classroom_id??undefined,childId:r.child_id}));}
  private destination(account:LockedAccount,branchId:string,method:string,date:string) {if(account.branch_id!==branchId||account.type!==method||date<account.opened_on) throw invalid();}
  private async receipt(tx:Transaction,p:Policy,input:{operationId:string;collectedOn:string;payerName:string;externalReference:string},account:LockedAccount,amount:string,kind:Receipt['kind'],lines:Receipt['lines']) {
    const id=randomUUID();const branch=(await tx.query<{code:string}>('select code from branches where id=$1',[account.branch_id])).rows[0];
    const reference=(await tx.query<{reference:string}>("select 'FIN-'||lpad(n::text,greatest(12,length(n::text)),'0') as reference from (select nextval('financial_receipt_number') n) s")).rows[0].reference;
    await tx.query(`insert into receipts(id,reference,actor_id,operation_id,branch_id,branch_code,account_id,account_code,method,collected_on,payer_name,external_reference,amount,kind,lines)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,reference,p.account.id,input.operationId,account.branch_id,branch.code,account.id,account.code,account.type,input.collectedOn,input.payerName,input.externalReference,amount,kind,JSON.stringify(lines)]);
    for(const childId of [...new Set(lines.map(l=>l.childId))].sort()) await tx.query("insert into financial_events(id,receipt_id,child_id,branch_id,kind) values($1,$2,$3,$4,'RECEIPT_RECORDED')",[randomUUID(),id,childId,account.branch_id]);
    return id;
  }
  async collect(token:string,raw:unknown):Promise<PaymentResult> {
    const input=collectionInputSchema.parse(raw);let dues:DueItem[];let accounts:LockedAccount[];
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'COLLECT',input,'payments.record',async()=>{
      dues=await this.ledger.lockDue(tx,p,input.groups.flatMap(g=>g.allocations.map(a=>a.installmentId)));
      accounts=await this.treasury.lockAccounts(tx,p,input.groups.map(g=>g.accountId));return this.resources(dues);
    },async()=>{
      this.core.date(input.collectedOn);const receiptIds:string[]=[];
      // Validate every leg before inserting any; database rollback still covers every intermediate write.
      for(const g of input.groups) this.validateGroup(g,input.collectedOn,dues,accounts);
      for(const g of [...input.groups].sort((a,b)=>a.branchId.localeCompare(b.branchId))) {
        const lines=g.allocations.map(a=>{const d=dues.find(d=>d.id===a.installmentId)!;return {childId:d.child_id,childCode:d.child_code,childName:d.child_name,classroomId:d.classroom_id,installmentId:d.id,categoryName:d.category_name,amount:a.amount};});
        const id=await this.receipt(tx,p,input,accounts.find(a=>a.id===g.accountId)!,g.amount,'PAYMENT',lines);receiptIds.push(id);
        for(const allocation of g.allocations) await tx.query('insert into receipt_allocations(id,receipt_id,installment_id,amount) values($1,$2,$3,$4)',[randomUUID(),id,allocation.installmentId,allocation.amount]);
        await this.treasury.postReceiptInTransaction(tx,p,id);
      }
      return {operationId:input.operationId,receiptIds};
    }));
  }
  private validateGroup(g:CollectionInput['groups'][number],date:string,dues:DueItem[],accounts:LockedAccount[]) {
    this.destination(accounts.find(a=>a.id===g.accountId)!,g.branchId,g.method,date);
    if(g.allocations.reduce((sum,a)=>sum+BigInt(a.amount),0n)!==BigInt(g.amount)) throw invalid();
    for(const a of g.allocations) {const due=dues.find(d=>d.id===a.installmentId)!;if(due.branch_id!==g.branchId) throw invalid();this.ledger.validateAllocation(due,a.amount,date);}
  }
  async receiveCredit(token:string,raw:unknown) {
    const input=creditReceiptInputSchema.parse(raw);let account:LockedAccount;let child:Awaited<ReturnType<typeof resolveChild>>;
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'CREDIT_RECEIPT',input,'payments.record',async()=>{
      child=await resolveChild(tx,input.childId,true);requireChild(p,'payments.record',child);
      [account]=await this.treasury.lockAccounts(tx,p,[input.accountId]);return [{branchId:child.branchId,classroomId:child.classroomId??undefined,childId:child.id}];
    },async()=>{
      this.core.date(input.collectedOn);this.destination(account,child.branchId,input.method,input.collectedOn);
      const receiptId=await this.receipt(tx,p,input,account,input.amount,'CREDIT',[{childId:child.id,childCode:child.code,childName:child.fullName,classroomId:child.classroomId,installmentId:null,categoryName:'CREDIT',amount:input.amount}]);
      const creditId=randomUUID();await tx.query('insert into credits(id,child_id,branch_id,receipt_id,amount,reason,created_on) values($1,$2,$3,$4,$5,$6,$7)',[creditId,child.id,child.branchId,receiptId,input.amount,input.reason,input.collectedOn]);
      await this.treasury.postReceiptInTransaction(tx,p,receiptId);return {receiptId,creditId};
    }));
  }
  async applyCredit(token:string,raw:unknown) {
    const input=applyCreditInputSchema.parse(raw);let dues:DueItem[];let credit:{child_id:string;branch_id:string;created_on:string;remaining:string};
    return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'CREDIT_APPLY',input,'payments.record',async()=>{
      const witness=(await tx.query<{child_id:string}>('select child_id from credits where id=$1',[input.creditId])).rows[0];if(!witness) throw denied();
      dues=await this.ledger.lockDue(tx,p,input.allocations.map(a=>a.installmentId),'payments.record',[witness.child_id]);
      await tx.query('select id from credits where id=$1 for update',[input.creditId]);
      credit=(await tx.query<typeof credit>('select c.child_id,c.branch_id,c.created_on::text,b.remaining::text from credits c join credit_balances b on b.id=c.id where c.id=$1',[input.creditId])).rows[0];
      requireBranch(p,credit.branch_id);return this.resources(dues);
    },async()=>{
      this.core.date(input.appliedOn);if(input.appliedOn<credit.created_on || input.allocations.reduce((s,a)=>s+BigInt(a.amount),0n)>BigInt(credit.remaining)) throw invalid();
      for(const a of input.allocations) {const d=dues.find(d=>d.id===a.installmentId)!;if(d.child_id!==credit.child_id||d.branch_id!==credit.branch_id) throw invalid();this.ledger.validateAllocation(d,a.amount,input.appliedOn);}
      const allocationIds:string[]=[];
      for(const a of input.allocations) {const id=randomUUID();allocationIds.push(id);await tx.query('insert into credit_allocations(id,credit_id,installment_id,amount,applied_on) values($1,$2,$3,$4,$5)',[id,input.creditId,a.installmentId,a.amount,input.appliedOn]);}
      return {allocationIds};
    }));
  }
  private async authorizeReceipt(tx:Transaction,p:Policy,r:Receipt) {
    if(p.account.kind==='GUARDIAN') {
      await this.core.enabled(tx);
      for(const id of [...new Set(r.lines.map(l=>l.childId))].sort()) {await requireGuardianChild(tx,p,id,'read');await requireGuardianChild(tx,p,id,'finance');}
    } else {
      requireCapability(p,'finance.read');
      for(const line of r.lines) requireRecord(p,'finance.read',{branchId:r.branchId,classroomId:line.classroomId??undefined,childId:line.childId});
    }
  }
  async getReceipt(token:string,id:string):Promise<Receipt> {
    return this.core.children.withPolicy(token,async(tx,p)=>{const r=(await tx.query<Receipt>(`select ${receiptColumns} from receipts r where r.id=$1`,[id])).rows[0];if(!r) throw denied();await this.authorizeReceipt(tx,p,r);return r;});
  }
  async receipts(token:string,raw:unknown) {
    const q=financeQuerySchema.parse(raw);
    return this.core.children.withPolicy(token,async(tx,p)=>{
      requireCapability(p,'finance.read');if(q.branchId) requireBranch(p,q.branchId);
      return (await tx.query<Receipt>(`select ${receiptColumns} from receipts r where ($1::boolean or r.branch_id=any($2::uuid[]))
        and ($3::boolean or not exists(select 1 from jsonb_array_elements(r.lines) l where l->>'classroomId' is null or not ((l->>'classroomId')::uuid=any($4::uuid[]))))
        and ($5::uuid is null or r.branch_id=$5) order by r.collected_on desc,r.reference desc limit $6 offset $7`,[p.account.kind==='SYSTEM',p.scope.branchIds,p.account.kind==='SYSTEM'||p.scope.mode==='BRANCH',p.scope.classroomIds,q.branchId??null,q.limit,q.offset])).rows;
    });
  }
}
