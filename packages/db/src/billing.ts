import { randomUUID,createHash } from 'node:crypto';
import type { Transaction,Database } from './index.js';
import type { AgreementTerms,BillingAllocation,Child,CatchupPreview } from '@nursery/contracts';
import { monthlyDue,nextMonth,cairoIsoDate,subscriptionAccessStatus } from '@nursery/domain';
import { postObligation } from './obligations.js';
export type AgreementRow={id:string;actor_id:string;status:'DRAFT'|'APPROVED';version:number;terms:AgreementTerms;allocations:BillingAllocation[];first_allocations:BillingAllocation[]|null;next_period:string|null;ended_on:string|null};
export const agreementProjection='id,actor_id,status,version,terms,allocations,first_allocations,next_period::text,ended_on::text';
// Caller holds license/policy locks. Children precede agreement locks, matching collections and lifecycle edits.
export async function lockAgreement(tx:Transaction,id:string) {
 await tx.query('select c.id from children c join billing_children b on b.child_id=c.id where b.agreement_id=$1 order by c.id for update of c',[id]);
 return (await tx.query<AgreementRow>(`select ${agreementProjection} from billing_agreements where id=$1 for update`,[id])).rows[0];
}
async function periodShares(tx:Transaction,a:AgreementRow,period:string) {
 if(period===a.terms.firstPeriod&&a.first_allocations) return a.first_allocations;
 return (await tx.query<{allocations:BillingAllocation[]}>('select allocations from agreement_versions where agreement_id=$1 and effective_from<=$2 order by effective_from desc limit 1',[a.id,period])).rows[0]?.allocations??a.allocations;
}
async function eligible(tx:Transaction,a:AgreementRow,period:string) {
 const effective=period<a.terms.startsOn?a.terms.startsOn:period;
 if((a.terms.endsOn&&effective>a.terms.endsOn)||(a.ended_on&&effective>=a.ended_on)) return [];
 if((await tx.query('select 1 from billing_pauses where agreement_id=$1 and $2 between from_period and until_period',[a.id,period])).rowCount) return [];
 const archived=(await tx.query<{child_id:string}>('select child_id from child_status_history where child_id=any($1::uuid[]) and new_status=\'ARCHIVED\' and effective_on<=$2',[a.terms.childIds,effective])).rows.map(r=>r.child_id);
 return (await periodShares(tx,a,period)).filter(s=>!archived.includes(s.childId));
}
async function disabledPeriod(tx:Transaction,a:AgreementRow,period:string) {
 const date=period<a.terms.startsOn?a.terms.startsOn:period;
 // Conservatively require review if finance was disabled on the eligibility date,
 // including a disable/re-enable on the same Cairo day.
 return Boolean((await tx.query(`select 1 from module_settings_history d where d.module_key='FINANCE' and not d.new_enabled and (d.created_at at time zone 'Africa/Cairo')::date<=$1
 and not exists(select 1 from module_settings_history e where e.module_key='FINANCE' and e.new_enabled and e.created_at>d.created_at and (e.created_at at time zone 'Africa/Cairo')::date<$1) limit 1`,[date])).rowCount);
}
export async function issueBillingPeriod(tx:Transaction,a:AgreementRow,period:string,shares:BillingAllocation[],issuedOn:string) {
 const ids:string[]=[];
 for(const share of shares) {
  const child=(await tx.query<Child>('select id,code,full_name as "fullName",branch_id as "branchId",classroom_id as "classroomId" from children where id=$1',[share.childId])).rows[0];
  const monthly=a.terms.mode==='MONTHLY';
  const posted=await postObligation(tx,a.actor_id,child,{operationId:randomUUID(),childId:child.id,categoryId:a.terms.categoryId,amount:share.amount,description:a.terms.description,sourceReference:`billing/${a.id}/${period}`,issuedOn,
   serviceFrom:monthly?period:a.terms.serviceFrom,serviceUntil:monthly?monthlyDue(period,31):a.terms.serviceUntil,
   installments:monthly?[{dueOn:monthlyDue(period,a.terms.dueDay!),amount:share.amount}]:share.installments});
  await tx.query('insert into recurrence_occurrences(agreement_id,child_id,service_period_start,category_id,obligation_id) values($1,$2,$3,$4,$5)',[a.id,child.id,period,a.terms.categoryId,posted.id]);ids.push(posted.id);
 }
 return ids;
}
export async function generateAgreement(tx:Transaction,a:AgreementRow,today:string,first=false) {
 if(a.status!=='APPROVED'||!a.next_period) return 0;
 let period=a.next_period,count=0;
 // A bounded transaction advances at most 24 calendar periods, including skips.
 while(count<24&&(period<=today||first)) {
  first=false;
  const shares=await eligible(tx,a,period),disabled=await disabledPeriod(tx,a,period);
  const state=!shares.length?'SKIPPED':disabled?'DISABLED':'GENERATED';
  if(state==='GENERATED') await issueBillingPeriod(tx,a,period,shares,today);
  await tx.query('insert into billing_periods(agreement_id,period,state) values($1,$2,$3)',[a.id,period,state]);
  period=nextMonth(period);count++;
 }
 await tx.query('update billing_agreements set next_period=$2 where id=$1',[a.id,period]);
 return count;
}
export async function billingCatchupPreview(tx:Transaction,a:AgreementRow):Promise<CatchupPreview> {
 const pending=(await tx.query<{period:string}>("select period::text from billing_periods where agreement_id=$1 and state='DISABLED' order by period limit 24",[a.id])).rows;
 const periods=[];
 for(const row of pending) periods.push({period:row.period,allocations:await eligible(tx,a,row.period)});
 const previewHash=createHash('sha256').update(JSON.stringify({id:a.id,version:a.version,periods})).digest('hex');
 return {previewHash,periods};
}
// Trusted installation job: approved terms are its authority, never a serialized user policy.
export async function runBillingBatch(database:Database,today=cairoIsoDate()) {
 const ids=(await database.pool.query<{id:string}>("select id from billing_agreements where status='APPROVED' and next_period<=$1 order by next_period,id limit 50",[today])).rows;
 let periods=0;
 for(const {id} of ids) periods+=await database.transaction(async tx=>{
  await tx.query('select pg_advisory_xact_lock_shared(7190501)');
  await tx.query('select pg_advisory_xact_lock_shared(7190401)');
  const license=(await tx.query<{valid_until:string;grace_days:number}>('select valid_until::text,grace_days from license_limits where singleton')).rows[0];
  if(!license||subscriptionAccessStatus(cairoIsoDate(),license.valid_until,license.grace_days)==='SUSPENDED') return 0;
  if(!(await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount) return 0;
  const a=await lockAgreement(tx,id);if(!a) return 0;
  return generateAgreement(tx,a,today);
 });
 return {agreements:ids.length,periods};
}
