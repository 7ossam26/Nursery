import { z } from 'zod';
import { accountTypeSchema,amountSchema,positiveAmountSchema } from './finance.js';
import { usernameSchema } from './identity.js';

const uuid=z.uuid().transform(v=>v.toLowerCase());
const reason=z.string().trim().min(1).max(500);
export const payrollMonthSchema=z.string().regex(/^(?:[1-9]\d{3})-(0[1-9]|1[0-2])$/);
export const employeeProfileInputSchema=z.object({operationId:uuid,employeeCode:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,32}$/),fullName:z.string().trim().min(1).max(160),basicSalary:positiveAmountSchema,effectiveMonth:payrollMonthSchema,payingBranchId:uuid,payingAccountId:uuid,loginUsername:usernameSchema.nullable()}).strict();
export const employeeProfileStatusInputSchema=z.object({operationId:uuid,active:z.boolean(),reason}).strict();
export const employeeLoginInputSchema=z.object({operationId:uuid,username:usernameSchema,reason}).strict();
export const salaryChangeInputSchema=z.object({operationId:uuid,effectiveMonth:payrollMonthSchema,basicSalary:positiveAmountSchema,payingBranchId:uuid,payingAccountId:uuid,reason}).strict();
export const payrollPeriodInputSchema=z.object({operationId:uuid,employeeId:uuid,month:payrollMonthSchema}).strict();
export const payrollAdjustmentInputSchema=z.object({operationId:uuid,kind:z.enum(['ADDITION','DEDUCTION','PENALTY']),amount:positiveAmountSchema,reason}).strict();
export const payrollAdvanceInputSchema=z.object({operationId:uuid,amount:positiveAmountSchema,paidOn:z.iso.date(),reason,externalReference:z.string().trim().max(120)}).strict();
export const payrollSettlementInputSchema=z.object({operationId:uuid,amount:amountSchema,settledOn:z.iso.date(),reason,externalReference:z.string().trim().max(120)}).strict();
export const payrollQuerySchema=z.object({month:payrollMonthSchema,branchId:uuid.optional(),limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)}).strict();

export type PayrollOptions={modules:{payroll:boolean;finance:boolean};branches:{id:string;code:string;name:string}[];accounts:{id:string;branchId:string;code:string;name:string;type:z.infer<typeof accountTypeSchema>}[];canManage:boolean;canPay:boolean;canProvisionLogin:boolean};
export type PayrollRosterItem={employeeId:string;employeeCode:string;fullName:string;accountId:string|null;accountStatus:string|null;active:boolean;periodId:string|null;month:string;branchId:string;branchCode:string;accountIdSnapshot:string;accountCode:string;method:z.infer<typeof accountTypeSchema>;basicSalary:string;additions:string;deductions:string;advances:string;remaining:string;state:'UNPREPARED'|'UNPAID'|'SETTLED';settlementId:string|null;settledAmount:string|null;settledOn:string|null};
export type PayrollPage={items:PayrollRosterItem[];totalCount:number;totalSalary:string;totalAdditions:string;totalDeductions:string;totalAdvances:string;totalRemaining:string;totalSettled:string};
export type PayrollAdjustment={id:string;kind:'ADDITION'|'DEDUCTION'|'PENALTY';amount:string;reason:string;actor:string};
export type PayrollAdvance={id:string;amount:string;paidOn:string;reason:string;externalReference:string;accountCode:string;method:z.infer<typeof accountTypeSchema>;actor:string};
export type PayrollSettlement={id:string;amount:string;settledOn:string;reason:string;externalReference:string;accountCode:string;method:z.infer<typeof accountTypeSchema>|null;noCash:boolean;actor:string};
export type PayrollPeriodDetail={period:PayrollRosterItem;adjustments:PayrollAdjustment[];advances:PayrollAdvance[];settlement:PayrollSettlement|null};
export type EmployeePayrollHistory={employee:{id:string;employeeCode:string;fullName:string;accountId:string|null;active:boolean};salaryHistory:{id:string;effectiveMonth:string;basicSalary:string;branchId:string;branchCode:string;accountId:string;accountCode:string;reason:string;actor:string}[];periods:PayrollRosterItem[]};
export type PayrollReceiptData={employeeCode:string;employeeName:string;month:string;branchCode:string;accountCode:string;method:z.infer<typeof accountTypeSchema>|null;basicSalary:string;additions:string;deductions:string;advances:string;finalPaid:string;totalCashOutflow:string;settledOn:string;noCash:boolean;adjustments:{kind:'ADDITION'|'DEDUCTION'|'PENALTY';amount:string;reason:string}[];advanceLines:{amount:string;paidOn:string;reason:string}[]};
