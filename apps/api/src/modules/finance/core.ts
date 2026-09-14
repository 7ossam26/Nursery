import { createHash,randomUUID } from 'node:crypto';
import type { Transaction } from '@nursery/db';
import type { Capability } from '@nursery/contracts';
import { cairoIsoDate } from '@nursery/domain';
import { SafeError } from '../../errors.js';
import { denied,requireCapability,requireRecord,type Policy } from '../organization/policy.js';
import type { ChildService } from '../children/service.js';

export const invalid = () => new SafeError('VALIDATION_ERROR','finance.invalid',false,409);
export type FinanceResource = { branchId: string;classroomId?: string;childId?: string };
export function financeScope(p: Policy,capability: Capability,alias: string) {
  requireCapability(p,capability);
  return { sql:`($1::boolean or ${alias}.branch_id=any($2::uuid[])) and ($3::boolean or ${alias}.classroom_id=any($4::uuid[]))`,values:[p.account.kind==='SYSTEM',p.scope.branchIds,p.account.kind==='SYSTEM'||p.scope.mode==='BRANCH',p.scope.classroomIds] };
}
export class FinancialCore {
  constructor(readonly children: ChildService) {}
  async enabled(tx: Transaction) {
    if (!(await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount) throw new SafeError('MODULE_DISABLED','finance.disabled',false,403);
  }
  date(value: string) { if(value>cairoIsoDate()) throw invalid(); }
  branch(p: Policy,capability: Capability,branchId: string) { requireRecord(p,capability,{branchId}); }
  async operation<T>(tx: Transaction,p: Policy,operationId: string,action: string,input: unknown,capability: Capability,authorize:()=>Promise<FinanceResource[]>,work:()=>Promise<T>): Promise<T> {
    await this.enabled(tx); requireCapability(p,capability);
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`finance/${p.account.id}/${operationId}`]);
    const canonical=(v:unknown):unknown=>Array.isArray(v) ? v.map(canonical) : v && typeof v==='object' ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])) : v;
    const hash=createHash('sha256').update(JSON.stringify(canonical({action,input}))).digest('hex');
    const old=(await tx.query<{request_hash:string;result:T;resources:FinanceResource[]}>('select request_hash,result,resources from financial_operations where actor_id=$1 and operation_id=$2',[p.account.id,operationId])).rows[0];
    if(old) {
      for(const resource of old.resources) requireRecord(p,capability,resource);
      if(old.request_hash!==hash) throw new SafeError('IDEMPOTENCY_CONFLICT','finance.operationConflict',false,409);
      return old.result;
    }
    const resources=await authorize(); const result=await work();
    await tx.query('insert into financial_audit_events(id,actor_id,operation_id,action,details) values($1,$2,$3,$4,$5)',[randomUUID(),p.account.id,operationId,action,JSON.stringify({input,result})]);
    await tx.query('insert into financial_operations(actor_id,operation_id,request_hash,action,result,resources) values($1,$2,$3,$4,$5,$6)',[p.account.id,operationId,hash,action,JSON.stringify(result),JSON.stringify(resources)]);
    return result;
  }
  async operationStatus(token:string,id:string) {
    return this.children.withPolicy(token,async(tx,p)=>{
      requireCapability(p,'finance.read');
      const row=(await tx.query<{ action:string;result:unknown;resources:FinanceResource[] }>('select action,result,resources from financial_operations where actor_id=$1 and operation_id=$2',[p.account.id,id])).rows[0];
      if(!row) return {status:'NOT_FOUND' as const};
      for(const resource of row.resources) requireRecord(p,'finance.read',resource);
      return {status:'COMMITTED' as const,action:row.action,result:row.result};
    });
  }
  async lockChildren(tx:Transaction,ids:string[]) {
    const ordered=[...new Set(ids)].sort();
    const rows=await tx.query('select id from children where id=any($1::uuid[]) order by id for update',[ordered]);
    if(rows.rowCount!==ordered.length) throw denied();
  }
}
