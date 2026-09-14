import { childFixture } from './children.js';
import { cairoIsoDate } from '@nursery/domain';
import type { Capability,CollectionInput } from '@nursery/contracts';
import type { Database } from '@nursery/db';

// Reusable PostgreSQL reconciliation, independent of service projections.
export async function reconcileFinance(database:Database) {
 const rows=(await database.pool.query<{problem:string}>(`
 select 'schedule' as problem from obligations o where o.amount<>(select coalesce(sum(i.amount),0) from installments i where i.obligation_id=o.id)
 union all select 'receipt-allocation' from receipts r where r.kind='PAYMENT' and r.amount<>(select coalesce(sum(a.amount),0) from receipt_allocations a where a.receipt_id=r.id)
 union all select 'credit-receipt' from receipts r where r.kind='CREDIT' and r.amount<>(select coalesce(sum(c.amount),0) from credits c where c.receipt_id=r.id)
 union all select 'receipt-cash' from receipts r where r.amount<>(select coalesce(sum(m.amount),0) from treasury_movements m where m.receipt_id=r.id)
 union all select 'opening' from treasury_accounts a where 1<>(select count(*) from treasury_movements m where m.account_id=a.id and m.kind='OPENING_BALANCE')
 union all select 'negative-due' from installment_balances where remaining<0
 union all select 'negative-credit' from credit_balances where remaining<0
 union all select 'branch-mismatch' from receipt_allocations a join receipts r on r.id=a.receipt_id join installments i on i.id=a.installment_id join obligations o on o.id=i.obligation_id where r.branch_id<>o.branch_id
 union all select 'missing-operation' from receipts r left join financial_operations f on f.actor_id=r.actor_id and f.operation_id=r.operation_id where f.operation_id is null
 union all select 'expense-cash' from expense_settlements s where s.amount<>(select -coalesce(sum(m.amount),0) from treasury_movements m where m.expense_settlement_id=s.id)
 union all select 'expense-source' from expense_settlements s join expenses e on e.id=s.expense_id where s.amount<>e.amount or s.branch_id<>e.branch_id
 union all select 'transfer-conservation' from account_transfers t where 2<>(select count(*) from treasury_movements m where m.transfer_id=t.id) or 0<>(select coalesce(sum(m.amount),0) from treasury_movements m where m.transfer_id=t.id)
 union all select 'closing-adjustment-cash' from closing_adjustments j where j.amount<>(select coalesce(sum(m.amount),0) from treasury_movements m where m.closing_adjustment_id=j.id)
 union all select 'closing-adjustment-source' from closing_adjustments j join daily_closings c on c.id=j.closing_id where j.amount<>c.difference or j.account_id<>c.account_id
 `)).rows;
 return rows.map(r=>r.problem);
}
export async function financeFixture(https=true) {
 const f=await childFixture(https);
 try {
  const core=f.app.financialCore,ledger=f.app.ledger,payments=f.app.payments,treasury=f.app.treasury;
  async function account(code:string,branchId=f.a.id,type:'CASH'|'BANK'|'WALLET'='CASH',openingAmount='0') {
   return treasury.createAccount(f.root.token,{operationId:crypto.randomUUID(),branchId,code,name:`Account ${code}`,type,openingAmount,openedOn:'2026-01-01',reason:'Explicit counted opening'});
  }
  const cashA=await account('A-CASH'),cashB=await account('B-CASH',f.b.id),bankA=await account('A-BANK',f.a.id,'BANK');
  const tuition=await ledger.category(f.root.token,{operationId:crypto.randomUUID(),code:'TUITION',name:'Tuition',kind:'TUITION'});
  const bus=await ledger.category(f.root.token,{operationId:crypto.randomUUID(),code:'BUS',name:'Bus',kind:'BUS'});
  async function child(code:string,branchId=f.a.id,classroomId=branchId===f.b.id?f.classes[2].id:f.classes[0].id) {
   const raw=f.family(code,branchId,classroomId);raw.children[0].links[0].permissions.finance=true;
   const family=await f.children.onboard(f.root.token,raw);return {...family,childId:family.childIds[0]};
  }
  async function charge(childId:string,amount='10000',categoryId=tuition.id,amounts=[amount]) {
   return ledger.createObligation(f.root.token,{operationId:crypto.randomUUID(),childId,categoryId,amount,description:'Test obligation',sourceReference:crypto.randomUUID(),issuedOn:'2026-01-01',serviceFrom:null,serviceUntil:null,installments:amounts.map(amount=>({dueOn:cairoIsoDate(),amount}))});
  }
  function collect(installmentId:string,amount='10000',branchId=f.a.id,accountId=cashA.id):CollectionInput {
   return {operationId:crypto.randomUUID(),collectedOn:cairoIsoDate(),payerName:'Synthetic payer',externalReference:'',groups:[{branchId,accountId,method:accountId===bankA.id?'BANK':'CASH',amount,allocations:[{installmentId,amount}]}]};
  }
  async function financeStaff(branchIds:string[],classroomIds:string[]=[],mode:'BRANCH'|'CLASSROOM'='BRANCH',capabilities:Capability[]=['finance.read','payments.record','billing.manage','treasury.manage','finance.correct']) {
   const user=await f.account();const role=await f.app.organization.save(f.root.token,'roles',{name:`Finance ${crypto.randomUUID()}`,capabilities});
   await f.app.organization.assign(f.root.token,user.id,{expectedVersion:1,roleIds:[role.id],branchIds,classroomIds,scopeMode:mode});return {...user,...await f.app.auth.login(user.username,user.password)};
  }
  return {...f,core,ledger,payments,treasury,cashA,cashB,bankA,tuition,bus,treasuryAccount:account,child,charge,collect,financeStaff};
 } catch(error) {await f.close();throw error;}
}
