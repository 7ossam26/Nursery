import { it,expect } from 'vitest';
import { employeeProfileInputSchema,payrollAdjustmentInputSchema,payrollSettlementInputSchema,payrollMonthSchema } from './payroll.js';

it('payroll contracts reject imprecise money, invalid months and writable derived fields',()=>{
 const operationId=crypto.randomUUID(),input={operationId,amount:'0',settledOn:'2026-09-14',reason:'Explicit zero close',externalReference:''};expect(payrollSettlementInputSchema.parse(input)).toEqual(input);
 for(const amount of [5000,'1.1','01','1e3','-1','9223372036854775808'])expect(payrollSettlementInputSchema.safeParse({...input,amount}).success).toBe(false);
 for(const month of ['0000-01','2026-00','2026-13','26-09','2026-09-01'])expect(payrollMonthSchema.safeParse(month).success).toBe(false);
 expect(payrollAdjustmentInputSchema.safeParse({operationId,kind:'DEDUCTION',amount:'0',reason:'No zero deduction'}).success).toBe(false);
 for(const extra of [{paidTotal:'0'},{accountId:crypto.randomUUID()},{method:'CASH'},{actor:crypto.randomUUID()}])expect(payrollSettlementInputSchema.safeParse({...input,...extra}).success).toBe(false);
 const profile={operationId,employeeCode:'e_1',fullName:'Employee',basicSalary:'500000',effectiveMonth:'2026-09',payingBranchId:crypto.randomUUID(),payingAccountId:crypto.randomUUID(),loginUsername:null};expect(employeeProfileInputSchema.parse(profile).employeeCode).toBe('E_1');expect(employeeProfileInputSchema.safeParse({...profile,password:'Caller credential forbidden'}).success).toBe(false);
});
