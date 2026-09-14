import { randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import { cairoIsoDate } from '@nursery/domain';
import {
 employeeProfileInputSchema,employeeProfileStatusInputSchema,employeeLoginInputSchema,salaryChangeInputSchema,payrollPeriodInputSchema,payrollAdjustmentInputSchema,payrollAdvanceInputSchema,payrollSettlementInputSchema,payrollQuerySchema,
 type Capability,type EmployeePayrollHistory,type PayrollAdvance,type PayrollOptions,type PayrollPage,type PayrollPeriodDetail,type PayrollReceiptData,type PayrollRosterItem,type PayrollSettlement
} from '@nursery/contracts';
import { SafeError } from '../../errors.js';
import type { LicensingService } from '../licensing/service.js';
import { denied,requireBranch,requireCapability,requireRecord,type Policy } from '../organization/policy.js';
import { FinancialCore,invalid,type FinanceResource } from './core.js';
import type { SpendingService } from './spending.js';
import type { LockedAccount,TreasuryService } from './treasury.js';

type PeriodRow={id:string;employee_id:string;employee_code:string;employee_name:string;account_id:string|null;account_status:string|null;active:boolean;month:string;paying_branch_id:string;branch_code:string;paying_account_id:string;account_code:string;method:'CASH'|'BANK'|'WALLET';basic_salary:string;additions:string;deductions:string;advances:string;remaining:string;settlement_id:string|null;settled_amount:string|null;settled_on:string|null};
const monthDate=(month:string)=>`${month}-01`;
const currentMonth=()=>cairoIsoDate().slice(0,7);
const resource=(branchId:string):FinanceResource=>({branchId});

export class PayrollService {
 constructor(readonly core:FinancialCore,readonly treasury:TreasuryService,readonly spending:SpendingService,readonly licensing:LicensingService) {}
 private async enabled(tx:Transaction) {
  if(!(await tx.query("select 1 from module_settings where module_key='PAYROLL' and enabled")).rowCount) throw new SafeError('MODULE_DISABLED','payroll.disabled',false,403);
 }
 private reader(p:Policy,branchId?:string) {
  requireCapability(p,'finance.read');if(p.account.kind!=='SYSTEM'&&p.scope.mode!=='BRANCH') throw denied();if(branchId) requireBranch(p,branchId);
 }
 private async salaryOwner(tx:Transaction,p:Policy,employeeId:string,capability:Capability,lock=true) {
  if(lock&&!(await tx.query('select id from employee_profiles where id=$1 for update',[employeeId])).rowCount) throw denied();
  const row=(await tx.query<{branch_id:string;active:boolean}>(`select h.paying_branch_id as branch_id,e.active from employee_profile_states e join lateral (select paying_branch_id from salary_history where employee_id=e.id order by effective_month desc limit 1) h on true where e.id=$1`,[employeeId])).rows[0];
  if(!row) throw denied();requireRecord(p,capability,resource(row.branch_id));return row;
 }
 private async lockPeriod(tx:Transaction,p:Policy,id:string,capability:'payroll.manage'|'payroll.pay'|'finance.read') {
  if(!(await tx.query('select id from payroll_periods where id=$1 for update',[id])).rowCount) throw denied();
  const row=(await tx.query<PeriodRow>(`select p.id,p.employee_id,p.employee_code,p.employee_name,e.account_id,a.status as account_status,e.active,to_char(p.month,'YYYY-MM') as month,p.paying_branch_id,b.code as branch_code,p.paying_account_id,t.code as account_code,t.type as method,p.basic_salary::text,p.additions::text,p.deductions::text,p.advances::text,p.remaining::text,p.settlement_id,p.settled_amount::text,p.settled_on::text from payroll_period_balances p join employee_profile_states e on e.id=p.employee_id left join accounts a on a.id=e.account_id join branches b on b.id=p.paying_branch_id join treasury_accounts t on t.id=p.paying_account_id where p.id=$1`,[id])).rows[0];
  if(!row) throw denied();requireRecord(p,capability,resource(row.paying_branch_id));return row;
 }
 private item(row:PeriodRow):PayrollRosterItem {
  return {employeeId:row.employee_id,employeeCode:row.employee_code,fullName:row.employee_name,accountId:row.account_id,accountStatus:row.account_status,active:row.active,periodId:row.id,month:row.month,branchId:row.paying_branch_id,branchCode:row.branch_code,accountIdSnapshot:row.paying_account_id,accountCode:row.account_code,method:row.method,basicSalary:row.basic_salary,additions:row.additions,deductions:row.deductions,advances:row.advances,remaining:row.settlement_id?'0':row.remaining,state:row.settlement_id?'SETTLED':'UNPAID',settlementId:row.settlement_id,settledAmount:row.settled_amount,settledOn:row.settled_on};
 }
 async options(token:string):Promise<PayrollOptions> {
  return this.core.children.withPolicy(token,async(tx,p)=>{
   this.reader(p);const modules=Object.fromEntries((await tx.query<{module_key:string;enabled:boolean}>("select module_key,enabled from module_settings where module_key in ('FINANCE','PAYROLL')")).rows.map(r=>[r.module_key,r.enabled]));
   const enabled=Boolean(modules.FINANCE&&modules.PAYROLL);return {modules:{finance:Boolean(modules.FINANCE),payroll:Boolean(modules.PAYROLL)},branches:(await tx.query<{id:string;code:string;name:string}>('select id,code,name from branches where ($1::boolean or id=any($2::uuid[])) order by code',[p.account.kind==='SYSTEM',p.scope.branchIds])).rows,accounts:(await tx.query<PayrollOptions['accounts'][number]>('select id,branch_id as "branchId",code,name,type from treasury_accounts where ($1::boolean or branch_id=any($2::uuid[])) order by code',[p.account.kind==='SYSTEM',p.scope.branchIds])).rows,canManage:enabled&&p.account.capabilities.includes('payroll.manage'),canPay:enabled&&p.account.capabilities.includes('payroll.pay'),canProvisionLogin:enabled&&p.account.capabilities.includes('payroll.manage')&&p.account.capabilities.includes('users.manage_staff')};
  });
 }
 async createProfile(token:string,raw:unknown) {
  const input=employeeProfileInputSchema.parse(raw);
  return this.core.children.withPolicy(token,(tx,p)=>this.createProfileInTransaction(tx,p,input));
 }
 // Shared by the payroll screen and bulk employee imports; the caller owns the license/policy locks and transaction.
 async createProfileInTransaction(tx:Transaction,p:Policy,raw:unknown) {
  const input=employeeProfileInputSchema.parse(raw);let accountId:string|null=null;let temporaryPassword:string|null=null;
  await this.enabled(tx);
  return this.core.operation(tx,p,input.operationId,'EMPLOYEE_PROFILE_CREATE',input,'payroll.manage',async()=>{
    requireRecord(p,'payroll.manage',resource(input.payingBranchId));if(input.loginUsername){requireCapability(p,'users.manage_staff');await tx.query('select singleton from license_limits where singleton for update');}const [account]=await this.treasury.lockAccounts(tx,p,[input.payingAccountId]);if(account.branch_id!==input.payingBranchId)throw invalid();return [resource(input.payingBranchId)];
   },async()=>{
    if(input.loginUsername){const created=await this.licensing.provisionInTransaction(tx,p,'users.manage_staff','STAFF','EMPLOYEE',{username:input.loginUsername});accountId=created.id;temporaryPassword=created.temporaryPassword;}
    const id=randomUUID();await tx.query('insert into employee_profiles(id,employee_code,full_name,account_id,actor_id,operation_id) values($1,$2,$3,$4,$5,$6)',[id,input.employeeCode,input.fullName,accountId,p.account.id,input.operationId]);
    await tx.query('insert into salary_history(id,employee_id,effective_month,basic_salary,paying_branch_id,paying_account_id,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[randomUUID(),id,monthDate(input.effectiveMonth),input.basicSalary,input.payingBranchId,input.payingAccountId,'Initial agreed salary',p.account.id,input.operationId]);
    return {id,accountId,temporaryPassword};
   },async()=>{if(input.loginUsername)requireCapability(p,'users.manage_staff');},true,result=>({...result,temporaryPassword:null}));
 }
 async profileStatus(token:string,id:string,raw:unknown) {
  const input=employeeProfileStatusInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);return this.core.operation(tx,p,input.operationId,'EMPLOYEE_PROFILE_STATUS',{id,...input},'payroll.manage',async()=>{const owner=await this.salaryOwner(tx,p,id,'payroll.manage');if(owner.active===input.active)throw invalid();return [resource(owner.branch_id)];},async()=>{const eventId=randomUUID();await tx.query('insert into employee_profile_status_events(id,employee_id,active,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6)',[eventId,id,input.active,input.reason,p.account.id,input.operationId]);return {id,eventId,active:input.active};});});
 }
 async provisionLogin(token:string,id:string,raw:unknown) {
  const input=employeeLoginInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);return this.core.operation(tx,p,input.operationId,'EMPLOYEE_LOGIN_CREATE',{id,...input},'payroll.manage',async()=>{
   requireCapability(p,'users.manage_staff');await tx.query('select singleton from license_limits where singleton for update');const owner=await this.salaryOwner(tx,p,id,'payroll.manage');if((await tx.query('select account_id from employee_profile_states where id=$1',[id])).rows[0].account_id)throw invalid();return [resource(owner.branch_id)];
  },async()=>{const login=await this.licensing.provisionInTransaction(tx,p,'users.manage_staff','STAFF','EMPLOYEE',{username:input.username});await tx.query('insert into employee_profile_login_links(id,employee_id,account_id,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6)',[randomUUID(),id,login.id,input.reason,p.account.id,input.operationId]);return {id,accountId:login.id,temporaryPassword:login.temporaryPassword as string|null};},async()=>{requireCapability(p,'users.manage_staff');},true,result=>({...result,temporaryPassword:null}));});
 }
 async changeSalary(token:string,id:string,raw:unknown) {
  const input=salaryChangeInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);return this.core.operation(tx,p,input.operationId,'EMPLOYEE_SALARY_CHANGE',{id,...input},'payroll.manage',async()=>{
   const owner=await this.salaryOwner(tx,p,id,'payroll.manage');if(input.effectiveMonth<=currentMonth())throw invalid();requireRecord(p,'payroll.manage',resource(input.payingBranchId));const [account]=await this.treasury.lockAccounts(tx,p,[input.payingAccountId]);if(account.branch_id!==input.payingBranchId)throw invalid();return [resource(owner.branch_id),resource(input.payingBranchId)];
  },async()=>{const historyId=randomUUID();await tx.query('insert into salary_history(id,employee_id,effective_month,basic_salary,paying_branch_id,paying_account_id,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[historyId,id,monthDate(input.effectiveMonth),input.basicSalary,input.payingBranchId,input.payingAccountId,input.reason,p.account.id,input.operationId]);return {id:historyId};});});
 }
 async prepare(token:string,raw:unknown) {
  const input=payrollPeriodInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);let config!:{employee_code:string;full_name:string;active:boolean;basic_salary:string;paying_branch_id:string;paying_account_id:string};return this.core.operation(tx,p,input.operationId,'PAYROLL_PERIOD_CREATE',input,'payroll.manage',async()=>{
   if(input.month>currentMonth())throw invalid();if(!(await tx.query('select id from employee_profiles where id=$1 for update',[input.employeeId])).rowCount)throw denied();config=(await tx.query<typeof config>(`select e.employee_code,e.full_name,e.active,h.basic_salary::text,h.paying_branch_id,h.paying_account_id from employee_profile_states e join lateral (select basic_salary,paying_branch_id,paying_account_id from salary_history where employee_id=e.id and effective_month<=$2 order by effective_month desc limit 1) h on true where e.id=$1`,[input.employeeId,monthDate(input.month)])).rows[0];if(!config||!config.active)throw invalid();requireRecord(p,'payroll.manage',resource(config.paying_branch_id));const [account]=await this.treasury.lockAccounts(tx,p,[config.paying_account_id]);if(account.branch_id!==config.paying_branch_id)throw invalid();return [resource(config.paying_branch_id)];
  },async()=>{const id=randomUUID();await tx.query('insert into payroll_periods(id,employee_id,month,employee_code,employee_name,paying_branch_id,paying_account_id,basic_salary,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,input.employeeId,monthDate(input.month),config.employee_code,config.full_name,config.paying_branch_id,config.paying_account_id,config.basic_salary,p.account.id,input.operationId]);return {id};});});
 }
 async adjust(token:string,id:string,raw:unknown) {
  const input=payrollAdjustmentInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);return this.core.operation(tx,p,input.operationId,'PAYROLL_ADJUSTMENT',{id,...input},'payroll.manage',async()=>{const period=await this.lockPeriod(tx,p,id,'payroll.manage');if(period.month!==currentMonth()||period.settlement_id)throw invalid();return [resource(period.paying_branch_id)];},async()=>{const adjustmentId=randomUUID();await tx.query('insert into payroll_adjustments(id,period_id,kind,amount,reason,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7)',[adjustmentId,id,input.kind,input.amount,input.reason,p.account.id,input.operationId]);return {id:adjustmentId};});});
 }
 async advance(token:string,id:string,raw:unknown) {
  const input=payrollAdvanceInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);let period:PeriodRow;let account:LockedAccount;return this.core.operation(tx,p,input.operationId,'PAYROLL_ADVANCE',{id,...input},'payroll.pay',async()=>{
   period=await this.lockPeriod(tx,p,id,'payroll.pay');if(period.month!==currentMonth()||period.settlement_id||!input.paidOn.startsWith(period.month))throw invalid();this.core.date(input.paidOn);[account]=await this.treasury.lockAccounts(tx,p,[period.paying_account_id]);if(account.branch_id!==period.paying_branch_id||account.type!==period.method||input.paidOn<account.opened_on)throw invalid();await this.core.cashDateOpen(tx,[account.id],input.paidOn);await this.spending.funded(tx,account.id,input.amount);return [resource(period.paying_branch_id)];
  },async()=>{const advanceId=randomUUID();await tx.query('insert into payroll_advances(id,period_id,branch_id,account_id,amount,paid_on,method,reason,external_reference,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[advanceId,id,period.paying_branch_id,account.id,input.amount,input.paidOn,account.type,input.reason,input.externalReference,p.account.id,input.operationId]);await tx.query("insert into treasury_movements(id,account_id,kind,payroll_advance_id,amount,effective_on,reason,actor_id) values($1,$2,'PAYROLL_ADVANCE',$3,$4,$5,$6,$7)",[randomUUID(),account.id,advanceId,(-BigInt(input.amount)).toString(),input.paidOn,input.reason,p.account.id]);return {id:advanceId};});});
 }
 async settle(token:string,id:string,raw:unknown) {
  const input=payrollSettlementInputSchema.parse(raw);return this.core.children.withPolicy(token,async(tx,p)=>{await this.enabled(tx);let period:PeriodRow;let account:LockedAccount|null=null;return this.core.operation(tx,p,input.operationId,'PAYROLL_SETTLEMENT',{id,...input},'payroll.pay',async()=>{
   period=await this.lockPeriod(tx,p,id,'payroll.pay');if(period.settlement_id||period.month>currentMonth())throw invalid();if(input.amount!==period.remaining)throw new SafeError('STALE_VERSION','payroll.amountChanged',false,409);this.core.date(input.settledOn);if(input.settledOn<monthDate(period.month))throw invalid();if(BigInt(period.remaining)>0n){[account]=await this.treasury.lockAccounts(tx,p,[period.paying_account_id]);if(account.branch_id!==period.paying_branch_id||account.type!==period.method||input.settledOn<account.opened_on)throw invalid();await this.core.cashDateOpen(tx,[account.id],input.settledOn);await this.spending.funded(tx,account.id,period.remaining);}return [resource(period.paying_branch_id)];
  },async()=>{const settlementId=randomUUID(),noCash=period.remaining==='0';await tx.query('insert into payroll_final_settlements(id,period_id,branch_id,account_id,amount,settled_on,method,reason,external_reference,actor_id,operation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[settlementId,id,period.paying_branch_id,noCash?null:account!.id,period.remaining,input.settledOn,noCash?null:account!.type,input.reason,input.externalReference,p.account.id,input.operationId]);if(!noCash)await tx.query("insert into treasury_movements(id,account_id,kind,payroll_settlement_id,amount,effective_on,reason,actor_id) values($1,$2,'PAYROLL_SETTLEMENT',$3,$4,$5,$6,$7)",[randomUUID(),account!.id,settlementId,(-BigInt(period.remaining)).toString(),input.settledOn,input.reason,p.account.id]);return {id:settlementId,amount:period.remaining,noCash};});});
 }
 private rosterSql() {return `select e.id as employee_id,e.employee_code,e.full_name as employee_name,e.account_id,login.status as account_status,e.active,$1::text as month,p.id,coalesce(p.paying_branch_id,h.paying_branch_id) as paying_branch_id,b.code as branch_code,coalesce(p.paying_account_id,h.paying_account_id) as paying_account_id,t.code as account_code,t.type as method,coalesce(p.basic_salary,h.basic_salary)::text as basic_salary,coalesce(p.additions,0)::text as additions,coalesce(p.deductions,0)::text as deductions,coalesce(p.advances,0)::text as advances,coalesce(p.remaining,h.basic_salary)::text as remaining,p.settlement_id,p.settled_amount::text,p.settled_on::text from employee_profile_states e join lateral (select basic_salary,paying_branch_id,paying_account_id from salary_history where employee_id=e.id and effective_month<=$2 order by effective_month desc limit 1) h on true left join payroll_period_balances p on p.employee_id=e.id and p.month=$2 left join accounts login on login.id=e.account_id join branches b on b.id=coalesce(p.paying_branch_id,h.paying_branch_id) join treasury_accounts t on t.id=coalesce(p.paying_account_id,h.paying_account_id) where ($3::boolean or coalesce(p.paying_branch_id,h.paying_branch_id)=any($4::uuid[])) and ($5::uuid is null or coalesce(p.paying_branch_id,h.paying_branch_id)=$5)`; }
 async roster(token:string,raw:unknown):Promise<PayrollPage> {
  const q=payrollQuerySchema.parse(raw);
  return this.core.children.withPolicy(token,async(tx,p)=>{
   this.reader(p,q.branchId);
   const values=[q.month,monthDate(q.month),p.account.kind==='SYSTEM',p.scope.branchIds,q.branchId??null],sql=this.rosterSql();
   // One SQL statement provides a consistent page and exact totals for the identical filtered scope.
   const result=(await tx.query<{rows:PeriodRow[];totalCount:number;totalSalary:string;totalAdditions:string;totalDeductions:string;totalAdvances:string;totalRemaining:string;totalSettled:string}>(`
    with scoped as materialized (${sql}), page as (select * from scoped order by employee_code,employee_id limit $6 offset $7)
    select coalesce((select jsonb_agg(to_jsonb(page) order by employee_code,employee_id) from page),'[]'::jsonb) as rows,
     count(*)::int as "totalCount",coalesce(sum(basic_salary::numeric),0)::text as "totalSalary",
     coalesce(sum(additions::numeric),0)::text as "totalAdditions",coalesce(sum(deductions::numeric),0)::text as "totalDeductions",
     coalesce(sum(advances::numeric),0)::text as "totalAdvances",
     coalesce(sum(remaining::numeric) filter(where id is not null and settlement_id is null),0)::text as "totalRemaining",
     coalesce(sum(settled_amount::numeric),0)::text as "totalSettled" from scoped`,[...values,q.limit,q.offset])).rows[0];
   const items=result.rows.map(row=>row.id?this.item(row):{
    employeeId:row.employee_id,employeeCode:row.employee_code,fullName:row.employee_name,accountId:row.account_id,accountStatus:row.account_status,active:row.active,
    periodId:null,month:q.month,branchId:row.paying_branch_id,branchCode:row.branch_code,accountIdSnapshot:row.paying_account_id,accountCode:row.account_code,method:row.method,
    basicSalary:row.basic_salary,additions:'0',deductions:'0',advances:'0',remaining:row.active?row.basic_salary:'0',state:'UNPREPARED' as const,settlementId:null,settledAmount:null,settledOn:null
   });
   return {items,totalCount:result.totalCount,totalSalary:result.totalSalary,totalAdditions:result.totalAdditions,totalDeductions:result.totalDeductions,totalAdvances:result.totalAdvances,totalRemaining:result.totalRemaining,totalSettled:result.totalSettled};
  });
 }
 async period(token:string,id:string):Promise<PayrollPeriodDetail> {
  return this.core.children.withPolicy(token,async(tx,p)=>{this.reader(p);const row=await this.lockPeriod(tx,p,id,'finance.read');const adjustments=(await tx.query<PayrollPeriodDetail['adjustments'][number]>('select j.id,j.kind,j.amount::text,j.reason,a.username_normalized as actor from payroll_adjustments j join accounts a on a.id=j.actor_id where j.period_id=$1 order by j.created_at,j.id',[id])).rows;const advances=(await tx.query<PayrollAdvance>('select v.id,v.amount::text,v.paid_on::text as "paidOn",v.reason,v.external_reference as "externalReference",t.code as "accountCode",v.method,a.username_normalized as actor from payroll_advances v join treasury_accounts t on t.id=v.account_id join accounts a on a.id=v.actor_id where v.period_id=$1 order by v.paid_on,v.id',[id])).rows;const settlement=(await tx.query<PayrollSettlement>('select s.id,s.amount::text,s.settled_on::text as "settledOn",s.reason,s.external_reference as "externalReference",t.code as "accountCode",s.method,s.amount=0 as "noCash",a.username_normalized as actor from payroll_final_settlements s join payroll_periods p on p.id=s.period_id join treasury_accounts t on t.id=p.paying_account_id join accounts a on a.id=s.actor_id where s.period_id=$1',[id])).rows[0]??null;return {period:this.item(row),adjustments,advances,settlement};});
 }
 async employee(token:string,id:string):Promise<EmployeePayrollHistory> {
  return this.core.children.withPolicy(token,async(tx,p)=>{this.reader(p);const employee=(await tx.query<EmployeePayrollHistory['employee']>('select id,employee_code as "employeeCode",full_name as "fullName",account_id as "accountId",active from employee_profile_states where id=$1',[id])).rows[0];if(!employee)throw denied();const salaryHistory=(await tx.query<EmployeePayrollHistory['salaryHistory'][number]>('select h.id,to_char(h.effective_month,\'YYYY-MM\') as "effectiveMonth",h.basic_salary::text as "basicSalary",h.paying_branch_id as "branchId",b.code as "branchCode",h.paying_account_id as "accountId",t.code as "accountCode",h.reason,a.username_normalized as actor from salary_history h join branches b on b.id=h.paying_branch_id join treasury_accounts t on t.id=h.paying_account_id join accounts a on a.id=h.actor_id where h.employee_id=$1 and ($2::boolean or h.paying_branch_id=any($3::uuid[])) order by h.effective_month,h.id',[id,p.account.kind==='SYSTEM',p.scope.branchIds])).rows;const periodRows=(await tx.query<PeriodRow>(`select p.id,p.employee_id,p.employee_code,p.employee_name,e.account_id,a.status as account_status,e.active,to_char(p.month,'YYYY-MM') as month,p.paying_branch_id,b.code as branch_code,p.paying_account_id,t.code as account_code,t.type as method,p.basic_salary::text,p.additions::text,p.deductions::text,p.advances::text,p.remaining::text,p.settlement_id,p.settled_amount::text,p.settled_on::text from payroll_period_balances p join employee_profile_states e on e.id=p.employee_id left join accounts a on a.id=e.account_id join branches b on b.id=p.paying_branch_id join treasury_accounts t on t.id=p.paying_account_id where p.employee_id=$1 and ($2::boolean or p.paying_branch_id=any($3::uuid[])) order by p.month desc,p.id`,[id,p.account.kind==='SYSTEM',p.scope.branchIds])).rows;if(!salaryHistory.length&&!periodRows.length)throw denied();return {employee,salaryHistory,periods:periodRows.map(row=>this.item(row))};});
 }
 async receiptData(token:string,id:string):Promise<PayrollReceiptData> {
  const detail=await this.period(token,id);if(!detail.settlement)throw invalid();const total=(BigInt(detail.period.advances)+BigInt(detail.settlement.amount)).toString();return {employeeCode:detail.period.employeeCode,employeeName:detail.period.fullName,month:detail.period.month,branchCode:detail.period.branchCode,accountCode:detail.period.accountCode,method:detail.settlement.method,basicSalary:detail.period.basicSalary,additions:detail.period.additions,deductions:detail.period.deductions,advances:detail.period.advances,finalPaid:detail.settlement.amount,totalCashOutflow:total,settledOn:detail.settlement.settledOn,noCash:detail.settlement.noCash,adjustments:detail.adjustments.map(({kind,amount,reason})=>({kind,amount,reason})),advanceLines:detail.advances.map(({amount,paidOn,reason})=>({amount,paidOn,reason}))};
 }
}
