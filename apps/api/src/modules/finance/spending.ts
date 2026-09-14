import { randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import { expenseInputSchema,expenseCategoryInputSchema,expenseActionInputSchema,expensePaymentInputSchema,expenseSettingsInputSchema,expenseQuerySchema,transferInputSchema,financeQuerySchema,type Expense,type ExpensePage,type ExpenseSettings,type SpendingOptions } from '@nursery/contracts';
import { requireCapability,requireRecord,requireBranch,queryScope,denied,stale,type Policy } from '../organization/policy.js';
import { FinancialCore,financeScope,invalid,type FinanceResource } from './core.js';
import { TreasuryService } from './treasury.js';
import { SafeError } from '../../errors.js';

type LockedExpense={id:string;branch_id:string;classroom_id:string|null;amount:string;state:Expense['state']};
const resource=(e:LockedExpense):FinanceResource=>({branchId:e.branch_id,classroomId:e.classroom_id??undefined});
export class SpendingService {
 constructor(readonly core:FinancialCore,readonly treasury:TreasuryService) {}
 async settings(tx:Transaction,lock=false):Promise<ExpenseSettings> {
  return (await tx.query<ExpenseSettings>(`select approval_threshold::text as "approvalThreshold",approving_capability as "approvingCapability",version from expense_settings where singleton${lock?' for share':''}`)).rows[0];
 }
 async lockExpense(tx:Transaction,p:Policy,id:string,capability:'expenses.manage'|'expenses.pay'|'finance.read'):Promise<LockedExpense> {
  if(!(await tx.query('select id from expenses where id=$1 for update',[id])).rowCount) throw denied();
  const e=(await tx.query<LockedExpense>('select id,branch_id,classroom_id,amount::text,state from expense_states where id=$1',[id])).rows[0];
  requireRecord(p,capability,resource(e));return e;
 }
 async configure(token:string,raw:unknown) {
  const input=expenseSettingsInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   await tx.query('select singleton from expense_settings where singleton for update');
   const authorize=async()=>{
   // Shared nursery settings cannot be controlled by a classroom-scoped user.
   requireRecord(p,'modules.manage',{branchId:p.scope.branchIds[0]??''});return [];
   };
   return this.core.operation(tx,p,input.operationId,'EXPENSE_SETTINGS',input,'modules.manage',authorize,async()=>{
   const cap=(await tx.query<{reserved:boolean}>('select reserved from capabilities where key=$1',[input.approvingCapability])).rows[0];
   if(!cap||cap.reserved) throw invalid();
   const result=await tx.query('update expense_settings set approval_threshold=$1,approving_capability=$2,version=version+1 where singleton and version=$3 returning version',[input.approvalThreshold,input.approvingCapability,input.expectedVersion]);
   if(!result.rowCount) throw stale();return {version:result.rows[0].version as number};
   },async()=>{await authorize();});
  });
 }
 async options(token:string):Promise<SpendingOptions> {
  return this.core.children.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'finance.read');const scope=queryScope(p,'finance.read','classroom'),settings=await this.settings(tx);
   const enabled=Boolean((await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount);
   const can=(cap:'expenses.manage'|'expenses.pay'|'treasury.manage'|'modules.manage')=>enabled&&p.account.capabilities.includes(cap);
   const branchMode=p.account.kind==='SYSTEM'||p.scope.mode==='BRANCH';
   return {settings,branches:(await tx.query<{id:string;code:string;name:string}>('select id,code,name from branches where ($1::boolean or id=any($2::uuid[])) order by code limit 100',[p.account.kind==='SYSTEM',p.scope.branchIds])).rows,
    classrooms:(await tx.query<{id:string;branchId:string;name:string}>(`select c.id,c.branch_id as "branchId",c.name from classrooms c where ${scope.sql} order by c.code limit 100`,scope.values)).rows,
    categories:(await tx.query<{id:string;code:string;name:string}>('select id,code,name from expense_categories order by code limit 100')).rows,
    accounts:(await tx.query<SpendingOptions['accounts'][number]>('select id,branch_id as "branchId",code,name,type from treasury_accounts where ($1::boolean or branch_id=any($2::uuid[])) order by code limit 100',[p.account.kind==='SYSTEM',p.scope.branchIds])).rows,
    canManage:can('expenses.manage'),canPay:can('expenses.pay'),canApprove:enabled&&p.account.capabilities.includes(settings.approvingCapability),canConfigure:branchMode&&can('modules.manage'),canTransfer:branchMode&&can('treasury.manage')};
  });
 }
 async category(token:string,raw:unknown) {
  const input=expenseCategoryInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   const authorize=async()=>{if(p.account.kind!=='SYSTEM'&&p.scope.mode!=='BRANCH') throw denied();return [];};
   return this.core.operation(tx,p,input.operationId,'EXPENSE_CATEGORY',input,'expenses.manage',authorize,async()=>{const id=randomUUID();await tx.query('insert into expense_categories(id,code,name) values($1,$2,$3)',[id,input.code,input.name]);return {id};},async()=>{await authorize();});
  });
 }
 async create(token:string,raw:unknown) {
  const input=expenseInputSchema.parse(raw);
  return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'EXPENSE_CREATE',input,'expenses.manage',async()=>{
   const r={branchId:input.branchId,classroomId:input.classroomId??undefined};requireRecord(p,'expenses.manage',r);
   if(input.classroomId&&!(await tx.query('select 1 from classrooms where id=$1 and branch_id=$2',[input.classroomId,input.branchId])).rowCount) throw invalid();return [r];
  },async()=>{
   const category=(await tx.query<{name:string}>('select name from expense_categories where id=$1',[input.categoryId])).rows[0];if(!category) throw invalid();
   const id=randomUUID();await tx.query('insert into expenses(id,branch_id,classroom_id,category_id,category_name,amount,due_on,note,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,input.branchId,input.classroomId,input.categoryId,category.name,input.amount,input.dueOn,input.note,p.account.id,input.operationId]);return {id};
  }));
 }
 async act(token:string,id:string,action:'APPROVED'|'CANCELLED',raw:unknown) {
  const input=expenseActionInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   const settings=await this.settings(tx,true);const capability=action==='APPROVED'?settings.approvingCapability:'expenses.manage';let e:LockedExpense;
   const authorize=async()=>{
    // Approval capability may be configured, but original expense scope is always enforced.
    if(!(await tx.query('select id from expenses where id=$1 for update',[id])).rowCount) throw denied();
    e=(await tx.query<LockedExpense>('select id,branch_id,classroom_id,amount::text,state from expense_states where id=$1',[id])).rows[0];requireRecord(p,capability,resource(e));return [resource(e)];
   };
   return this.core.operation(tx,p,input.operationId,`EXPENSE_${action}`,{id,...input},capability,authorize,async()=>{
    if(e.state==='PAID'||e.state==='CANCELLED'||action==='APPROVED'&&e.state==='APPROVED') throw invalid();
    const eventId=randomUUID();await tx.query('insert into expense_approval_events(id,expense_id,kind,approving_capability,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7)',[eventId,id,action,action==='APPROVED'?capability:null,input.reason,p.account.id,input.operationId]);return {id:eventId};
   });
  });
 }
 async pay(token:string,id:string,raw:unknown) {
  const input=expensePaymentInputSchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   // All expense writers lock settings -> actor operation -> expense -> sorted accounts.
   const settings=await this.settings(tx,true);let e:LockedExpense;
   return this.core.operation(tx,p,input.operationId,'EXPENSE_PAY',{id,...input},'expenses.pay',async()=>{e=await this.lockExpense(tx,p,id,'expenses.pay');return [resource(e)];},async()=>{
    if(e.state==='PAID'||e.state==='CANCELLED') throw invalid();
    if(settings.approvalThreshold!=='0'&&BigInt(e.amount)>BigInt(settings.approvalThreshold)&&!(await tx.query("select 1 from expense_approval_events where expense_id=$1 and kind='APPROVED' and approving_capability=$2",[id,settings.approvingCapability])).rowCount) throw new SafeError('VALIDATION_ERROR','spending.approvalRequired',false,409);
    this.core.date(input.paidOn);const [a]=await this.treasury.lockAccounts(tx,p,[input.accountId]);
    if(a.branch_id!==e.branch_id||a.type!==input.method||input.paidOn<a.opened_on) throw invalid();await this.core.cashDateOpen(tx,[a.id],input.paidOn);await this.funded(tx,a.id,e.amount);
    const settlementId=randomUUID();await tx.query('insert into expense_settlements(id,expense_id,branch_id,account_id,amount,method,paid_on,reason,external_reference,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[settlementId,id,e.branch_id,a.id,e.amount,input.method,input.paidOn,input.reason,input.externalReference,p.account.id,input.operationId]);
    await tx.query("insert into treasury_movements(id,account_id,kind,expense_settlement_id,amount,effective_on,reason,actor_id) values($1,$2,'EXPENSE',$3,$4,$5,$6,$7)",[randomUUID(),a.id,settlementId,(-BigInt(e.amount)).toString(),input.paidOn,input.reason,p.account.id]);return {settlementId};
   });
  });
 }
 async funded(tx:Transaction,accountId:string,amount:string) {
  const b=(await tx.query<{balance:string}>('select balance::text from treasury_balances where id=$1',[accountId])).rows[0];if(!b||BigInt(b.balance)<BigInt(amount)) throw new SafeError('VALIDATION_ERROR','spending.insufficientFunds',false,409);
 }
 async transfer(token:string,raw:unknown) {
  const input=transferInputSchema.parse(raw);
  return this.core.children.withPolicy(token,(tx,p)=>this.core.operation(tx,p,input.operationId,'ACCOUNT_TRANSFER',input,'treasury.manage',async()=>{
   const accounts=await this.treasury.lockAccounts(tx,p,[input.sourceAccountId,input.destinationAccountId]);
   for(const a of accounts) requireRecord(p,'treasury.manage',{branchId:a.branch_id});return accounts.map(a=>({branchId:a.branch_id}));
  },async()=>{
   this.core.date(input.effectiveOn);const accounts=await this.treasury.lockAccounts(tx,p,[input.sourceAccountId,input.destinationAccountId]);if(accounts.some(a=>input.effectiveOn<a.opened_on)) throw invalid();
   await this.core.cashDateOpen(tx,[input.sourceAccountId,input.destinationAccountId],input.effectiveOn);await this.funded(tx,input.sourceAccountId,input.amount);const id=randomUUID();
   await tx.query('insert into account_transfers(id,source_account_id,destination_account_id,amount,effective_on,reason,external_reference,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,input.sourceAccountId,input.destinationAccountId,input.amount,input.effectiveOn,input.reason,input.externalReference,p.account.id,input.operationId]);
   for(const [accountId,leg,amount] of [[input.sourceAccountId,'SOURCE',(-BigInt(input.amount)).toString()],[input.destinationAccountId,'DESTINATION',input.amount]]) await tx.query("insert into treasury_movements(id,account_id,kind,transfer_id,transfer_leg,amount,effective_on,reason,actor_id) values($1,$2,'TRANSFER',$3,$4,$5,$6,$7,$8)",[randomUUID(),accountId,id,leg,amount,input.effectiveOn,input.reason,p.account.id]);return {id};
  }));
 }
 async list(token:string,raw:unknown):Promise<ExpensePage> {
  const q=expenseQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   const s=financeScope(p,'finance.read','e');if(q.branchId) requireBranch(p,q.branchId);
   const where=`${s.sql} and ($5::uuid is null or e.branch_id=$5) and ($6::uuid is null or e.classroom_id=$6) and ($7::text is null or e.state=$7)`;
   const values=[...s.values,q.branchId??null,q.classroomId??null,q.state??null];
   const totals=(await tx.query<{totalPending:string;totalPaid:string;totalCount:number}>(`select coalesce(sum(amount) filter(where state in ('PENDING','APPROVED')),0)::text as "totalPending",coalesce(sum(paid_amount) filter(where state in ('PAID','CORRECTED')),0)::text as "totalPaid",count(*)::int as "totalCount" from expense_states e where ${where}`,values)).rows[0];
   const items=(await tx.query<Expense>(`select id,branch_id as "branchId",classroom_id as "classroomId",category_id as "categoryId",category_name as "categoryName",amount::text,paid_amount::text as "paidAmount",due_on::text as "dueOn",note,state,settlement_id as "settlementId",account_id as "accountId",method,paid_on::text as "paidOn",correction_id as "correctionId",correction_reason as "correctionReason" from expense_states e where ${where} order by due_on,id limit $8 offset $9`,[...values,q.limit,q.offset])).rows;return {...totals,items};
  });
 }
 async history(token:string,id:string) {
  return this.core.children.withPolicy(token,async(tx,p)=>{
   await this.lockExpense(tx,p,id,'finance.read');
   const events=(await tx.query<{id:string;kind:string;reason:string;actor:string}>('select v.id,v.kind,v.reason,a.username_normalized as actor from expense_approval_events v join accounts a on a.id=v.actor_id where expense_id=$1 order by v.created_at,v.id',[id])).rows;
   const settlements=(await tx.query<{id:string;amount:string;paidOn:string;method:string;accountCode:string;reason:string;actor:string}>('select s.id,s.amount::text,s.paid_on::text as "paidOn",s.method,t.code as "accountCode",s.reason,a.username_normalized as actor from expense_settlements s join treasury_accounts t on t.id=s.account_id join accounts a on a.id=s.actor_id where expense_id=$1',[id])).rows;
   const corrections=(await tx.query<{id:string;action:string;effectiveOn:string;reason:string;actor:string;replacementAmount:string|null;replacementAccountCode:string|null}>('select c.id,c.action,c.effective_on::text as "effectiveOn",c.reason,a.username_normalized as actor,d.replacement_amount::text as "replacementAmount",t.code as "replacementAccountCode" from expense_corrections d join financial_corrections c on c.id=d.correction_id join accounts a on a.id=c.actor_id left join treasury_accounts t on t.id=d.replacement_account_id join expense_settlements s on s.id=d.original_settlement_id where s.expense_id=$1',[id])).rows;return {events,settlements,corrections};
  });
 }
 async transfers(token:string,raw:unknown) {
  const q=financeQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   requireCapability(p,'finance.read');if(p.account.kind!=='SYSTEM'&&p.scope.mode!=='BRANCH') throw denied();if(q.branchId) requireRecord(p,'finance.read',{branchId:q.branchId});
   return (await tx.query<{id:string;sourceCode:string;destinationCode:string;amount:string;effectiveOn:string;reason:string}>(`select t.id,s.code as "sourceCode",d.code as "destinationCode",t.amount::text,t.effective_on::text as "effectiveOn",t.reason from account_transfers t join treasury_accounts s on s.id=t.source_account_id join treasury_accounts d on d.id=t.destination_account_id
    where ($1::boolean or (s.branch_id=any($2::uuid[]) and d.branch_id=any($2::uuid[]))) and ($3::uuid is null or s.branch_id=$3 or d.branch_id=$3) order by t.effective_on desc,t.id limit $4 offset $5`,[p.account.kind==='SYSTEM',p.scope.branchIds,q.branchId??null,q.limit,q.offset])).rows;
  });
 }
}
