import { afterEach,describe,expect,it } from 'vitest';
import { cairoIsoDate } from '@nursery/domain';
import { reportKinds } from '@nursery/contracts';
import ExcelJS from 'exceljs';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { financeFixture } from '../helpers/finance.js';

describe('Phase 20 management reports and private exports on PostgreSQL',()=>{
 let f:Awaited<ReturnType<typeof financeFixture>>;
 afterEach(async()=>{await f?.close();});
 it('reconciles A26 payroll cash with canonical source rows and keeps a branch export private',async()=>{
  f=await financeFixture();const account=await f.treasuryAccount('REP-PAY',f.a.id,'CASH','600000');
  const employee=await f.app.payroll.createProfile(f.root.token,{operationId:crypto.randomUUID(),employeeCode:'R-A26',fullName:'Report payroll',basicSalary:'500000',effectiveMonth:cairoIsoDate().slice(0,7),payingBranchId:f.a.id,payingAccountId:account.id,loginUsername:null});
  const period=await f.app.payroll.prepare(f.root.token,{operationId:crypto.randomUUID(),employeeId:employee.id,month:cairoIsoDate().slice(0,7)});
  await f.app.payroll.advance(f.root.token,period.id,{operationId:crypto.randomUUID(),amount:'100000',paidOn:cairoIsoDate(),reason:'Advance',externalReference:''});
  await f.app.payroll.adjust(f.root.token,period.id,{operationId:crypto.randomUUID(),kind:'DEDUCTION',amount:'30000',reason:'Deduction'});
  await f.app.payroll.settle(f.root.token,period.id,{operationId:crypto.randomUUID(),amount:'370000',settledOn:cairoIsoDate(),reason:'Final',externalReference:''});
  const report=await f.app.reports.report(f.root.token,{kind:'PAYROLL',from:cairoIsoDate(),to:cairoIsoDate(),branchId:f.a.id,limit:10,offset:0});
  expect(report.totals.amount).toBe('-470000');expect(report.rows).toHaveLength(2);
  const cash=await f.app.reports.report(f.root.token,{kind:'CASH_RESULT',from:cairoIsoDate(),to:cairoIsoDate(),branchId:f.a.id,limit:10,offset:0});expect(cash.totals.amount).toBe('-470000');expect(cash.rows.map(row=>row.category)).toContain('PAYROLL_ADVANCE');
  const scoped=await f.financeStaff([f.a.id],[], 'BRANCH',['finance.read']);
  const input={operationId:crypto.randomUUID(),kind:'PAYROLL',from:cairoIsoDate(),to:cairoIsoDate(),branchId:f.a.id,format:'XLSX'};
  const created=await f.app.reports.createExport(scoped.token,input);
  expect((await f.app.reports.createExport(scoped.token,input)).id).toBe(created.id);
  await expect(f.app.reports.createExport(scoped.token,{...input,format:'PDF'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  expect(await f.app.reports.runBatch(f.database)).toEqual({processed:1});
  const file=await f.app.reports.download(scoped.token,created.id);expect(file.pending).toBe(false);if(!file.pending) {const book=new ExcelJS.Workbook();await book.xlsx.load(file.bytes as never);const sheet=book.getWorksheet('Report')!;expect(sheet.rowCount).toBe(9);expect(sheet.getCell('D5').value).toBe(-4700);expect(sheet.getCell('A7').value).toBe('Date');expect([sheet.getCell('D8').value,sheet.getCell('D9').value].sort((a,b)=>Number(a)-Number(b))).toEqual([-3700,-1000]);expect(sheet.getCell('B3').value).toEqual(new Date(`${cairoIsoDate()}T00:00:00Z`));}
  const other=await f.financeStaff([f.b.id],[], 'BRANCH',['finance.read']);await expect(f.app.reports.download(other.token,created.id)).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('uses the same scoped predicate for collection rows and aggregate, avoiding branch leakage',async()=>{
  f=await financeFixture();const childA=await f.child('REP-A'),childB=await f.child('REP-B',f.b.id);const a=await f.charge(childA.childId,'150000'),b=await f.charge(childB.childId,'90000');await f.app.payments.collect(f.root.token,f.collect(a.installmentIds[0],'150000'));await f.app.payments.collect(f.root.token,f.collect(b.installmentIds[0],'90000',f.b.id,f.cashB.id));
  const actor=await f.financeStaff([f.a.id],[],'BRANCH',['finance.read']);const page=await f.app.reports.report(actor.token,{kind:'COLLECTIONS',from:cairoIsoDate(),to:cairoIsoDate(),limit:50,offset:0});expect(page.totalCount).toBe(1);expect(page.totals.amount).toBe('150000');expect(page.rows[0].branchId).toBe(f.a.id);
 });
 it('executes every retained report projection with bounded pagination',async()=>{
  f=await financeFixture();for(const kind of reportKinds) {try {const page=await f.app.reports.report(f.root.token,{kind,from:cairoIsoDate(),to:cairoIsoDate(),limit:1,offset:0});expect(page.kind).toBe(kind);expect(page.rows.length).toBeLessThanOrEqual(1);} catch(error) {throw new Error(`${kind}: ${String(error)}`);}}
 });
 it('A21/A24 reconciles paid costs/refunds/corrections/transfers and keeps classroom contributions explicit',async()=>{
  f=await financeFixture();const today=cairoIsoDate(),a=await f.child('A21-A'),b=await f.child('A21-B',f.a.id,f.classes[1].id),ca=await f.charge(a.childId,'15000'),cb=await f.charge(b.childId,'7000');
  await f.payments.collect(f.root.token,{operationId:crypto.randomUUID(),collectedOn:today,payerName:'Scoped family',externalReference:'',groups:[{branchId:f.a.id,accountId:f.cashA.id,method:'CASH',amount:'22000',allocations:[{installmentId:ca.installmentIds[0],amount:'15000'},{installmentId:cb.installmentIds[0],amount:'7000'}]}]});
  await f.database.pool.query('insert into sensitive_grants(account_id,sensitive_financial_edit) values($1,true)',[f.root.account.id]);
  const credit=await f.payments.receiveCredit(f.root.token,{operationId:crypto.randomUUID(),childId:a.childId,accountId:f.cashA.id,method:'CASH',amount:'3000',collectedOn:today,payerName:'Credit payer',externalReference:'',reason:'Separate credit',confirmedCredit:true});
  const origin=(await f.database.pool.query('select id,credit_id from credit_origins where receipt_id=$1',[credit.receiptId])).rows[0];await f.app.corrections.refund(f.root.token,{operationId:crypto.randomUUID(),creditId:origin.credit_id,creditOriginId:origin.id,accountId:f.cashA.id,method:'CASH',amount:'1000',refundedOn:today,reason:'Actual refund',externalReference:'',alternativeAccountConfirmed:false});
  const category=await f.app.spending.category(f.root.token,{operationId:crypto.randomUUID(),code:'REP-COST',name:'Supplies'});
  for(const classroomId of [null,f.classes[0].id]) {const expense=await f.app.spending.create(f.root.token,{operationId:crypto.randomUUID(),branchId:f.a.id,classroomId,categoryId:category.id,amount:'2000',dueOn:today,note:'Confirmed operating cost'});await f.app.spending.pay(f.root.token,expense.id,{operationId:crypto.randomUUID(),accountId:f.cashA.id,method:'CASH',paidOn:today,externalReference:'',reason:'Actual payment'});}
  await f.app.spending.create(f.root.token,{operationId:crypto.randomUUID(),branchId:f.a.id,classroomId:null,categoryId:category.id,amount:'9000',dueOn:today,note:'Unpaid cost'});
  await f.app.spending.transfer(f.root.token,{operationId:crypto.randomUUID(),sourceAccountId:f.cashA.id,destinationAccountId:f.bankA.id,amount:'500',effectiveOn:today,reason:'Internal transfer',externalReference:''});
  const q={from:today,to:today,branchId:f.a.id,limit:1,offset:0};expect((await f.app.reports.report(f.root.token,{...q,kind:'CASH_RESULT'})).totals.amount).toBe('20000');expect((await f.app.reports.report(f.root.token,{...q,kind:'SPENDING'})).totals.amount).toBe('-4000');expect((await f.app.reports.report(f.root.token,{...q,kind:'PENDING_EXPENSES'})).totals.amount).toBe('9000');expect((await f.app.reports.report(f.root.token,{...q,kind:'TRANSFERS'})).totals.amount).toBe('0');expect((await f.app.reports.report(f.root.token,{...q,kind:'UNATTRIBUTED_SPENDING'})).totals.amount).toBe('-2000');
  const actor=await f.financeStaff([f.a.id],[f.classes[0].id],'CLASSROOM',['finance.read']);const scoped=await f.app.reports.report(actor.token,{...q,kind:'COLLECTIONS'});expect(scoped.totalCount).toBe(2);expect(scoped.totals.amount).toBe('18000');expect(scoped.rows.every(r=>r.classroomId===f.classes[0].id)).toBe(true);expect((await f.app.reports.report(actor.token,{...q,kind:'REFUNDS'})).totals.amount).toBe('-1000');expect((await f.app.reports.report(actor.token,{...q,kind:'CASH_RESULT'})).totals.amount).toBe('15000');
 });
 it('measures populated cash/debt/payroll queries against real canonical domain-created sources',async()=>{
  f=await financeFixture();const child=await f.child('MEASURE');for(let n=0;n<100;n++){const charge=await f.charge(child.childId,'100');if(n<80)await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'100'));}
  const extra=await f.ledger.category(f.root.token,{operationId:crypto.randomUUID(),code:'EXTRA-REP',name:'Other income',kind:'ADDITIONAL'}),charge=await f.charge(child.childId,'123',extra.id);await f.payments.collect(f.root.token,f.collect(charge.installmentIds[0],'123'));expect((await f.app.reports.report(f.root.token,{kind:'OTHER_INCOME',from:cairoIsoDate(),to:cairoIsoDate()})).totals.amount).toBe('123');
  const employee=await f.app.payroll.createProfile(f.root.token,{operationId:crypto.randomUUID(),employeeCode:'MEASURE',fullName:'Measured payroll',basicSalary:'1000',effectiveMonth:cairoIsoDate().slice(0,7),payingBranchId:f.a.id,payingAccountId:f.cashA.id,loginUsername:null}),period=await f.app.payroll.prepare(f.root.token,{operationId:crypto.randomUUID(),employeeId:employee.id,month:cairoIsoDate().slice(0,7)});await f.app.payroll.advance(f.root.token,period.id,{operationId:crypto.randomUUID(),amount:'100',paidOn:cairoIsoDate(),reason:'Measured actual advance',externalReference:''});
  await f.database.pool.query('analyze');const plans:Record<string,unknown>={fixture:{children:1,obligations:101,receipts:81,treasuryMovements:85,payrollPeriods:1,payrollAdvances:1}};
  for(const kind of ['CASH_RESULT','COLLECTIONS','OUTSTANDING','ACCOUNTS','PAYROLL','UNPAID_PAYROLL'] as const)plans[kind]=await f.children.withPolicy(f.root.token,(tx,p)=>f.app.reports.engine.explain(tx,p,{kind,from:'2026-01-01',to:cairoIsoDate(),branchId:f.a.id,limit:20,offset:0}));
  await mkdir(resolve('output/phase20'),{recursive:true});await writeFile(resolve('output/phase20/populated-query-plans.json'),JSON.stringify(plans,null,2));
 },60000);
});
