import { cairoIsoDate } from '@nursery/domain';
import type { Database,Transaction } from './index.js';

export async function emitDueReminders(tx:Transaction,today=cairoIsoDate(),ids:string[]|null=null,deliveryKey='INITIAL',actorId:string|null=null) {
 const result=await tx.query(`with due as (
   select b.id,o.child_id,o.branch_id,o.classroom_id from installment_balances b join obligations o on o.id=b.obligation_id
   where b.remaining>0 and b.due_on<$1::date and ($2::uuid[] is null or b.id=any($2::uuid[]))
 ),recipients as (
   select d.*,l.guardian_id as recipient_id from due d join children c on c.id=d.child_id
   join guardian_child_links l on l.child_id=c.id join accounts a on a.id=l.guardian_id
   where c.status='ACTIVE' and l.active and l.can_read and l.can_finance and l.can_notify and a.status in ('ACTIVE','BLOCKED')
   union all
   select d.*,a.id from due d cross join accounts a where a.status='ACTIVE' and not a.must_change_password and
   (a.kind='SYSTEM' or (a.kind='STAFF'
     and exists(select 1 from account_roles ar join role_capabilities rc on rc.role_id=ar.role_id where ar.account_id=a.id and rc.capability_key='finance.read')
     and exists(select 1 from account_branches ab where ab.account_id=a.id and ab.branch_id=d.branch_id)
     and (a.scope_mode='BRANCH' or exists(select 1 from teacher_classrooms tc where tc.account_id=a.id and tc.classroom_id=d.classroom_id))))
 ) insert into finance_reminders(id,installment_id,recipient_id,child_id,delivery_key,business_date,actor_id)
 select gen_random_uuid(),r.id,r.recipient_id,r.child_id,$3,$1,$4 from recipients r
 where not exists(select 1 from finance_reminders n where n.installment_id=r.id and n.recipient_id=r.recipient_id and n.delivery_key=$3)
 order by r.id,r.recipient_id limit 200 on conflict(installment_id,recipient_id,delivery_key) do nothing returning id`,[today,ids,deliveryKey,actorId]);
 return {notices:result.rowCount??0};
}
export async function runReminderBatch(database:Database,today=cairoIsoDate()) {
 return database.transaction(async tx=>{
  // Match administration's installation/policy/link order. Jobs never change account status, seats or money.
  for(const lock of [7190501,7190401,7190601]) await tx.query('select pg_advisory_xact_lock_shared($1)',[lock]);
  if(!(await tx.query("select 1 from module_settings where module_key='FINANCE' and enabled")).rowCount) return {notices:0};
  return emitDueReminders(tx,today);
 });
}
