import type { Transaction } from '@nursery/db';
import { homeworkReportingRule } from '@nursery/contracts';
import type { Policy } from '../organization/policy.js';
// Original assignment scope is additional to the child gate used by LearningService.
export function homeworkScope(p: Policy) {
  return { sql: '($3::boolean or (a.branch_id=any($4::uuid[]) and ($5::boolean or a.classroom_id=any($6::uuid[]))))',
    values: [p.account.kind==='SYSTEM' || p.account.kind==='GUARDIAN',p.scope.branchIds,p.scope.mode==='BRANCH',p.scope.classroomIds] };
}
export async function homeworkReporting(tx: Transaction,p: Policy,childId: string,date: string,override?: { assignmentId: string; outcome: string }) {
  const scope = homeworkScope(p);
  const rows = (await tx.query<{ id: string; due: boolean; outcome: string | null }>(`select a.id,a.due_on=$2 as due,
    (select o.status->>'outcome' from homework_outcomes o where o.assignment_id=a.id and o.child_id=$1 and o.effective_on<=$2 order by o.revision desc limit 1) as outcome
    from homework_assignments a join homework_recipients r on r.assignment_id=a.id where r.child_id=$1 and ${scope.sql}
      and a.assigned_on<=$2 and (a.due_on=$2 or (a.assigned_on=$2 and a.due_on>$2))`,[childId,date,...scope.values])).rows;
  if (override) for (const row of rows) if (row.id===override.assignmentId) row.outcome=override.outcome;
  const noDay = (await tx.query<{ outcome: string }>(`select cs.outcome from homework_no_days n join learning_events e on e.id=n.event_id join checkpoint_statuses cs on cs.definition_id=e.definition_id and cs.id=e.status_id join daily_slots s on s.id=e.slot_id join daily_snapshots a on a.id=s.snapshot_id where n.child_id=$1 and n.business_date=$2 and ${scope.sql}`,[childId,date,...scope.values])).rows[0];
  const result=homeworkReportingRule(rows.filter((r) => r.due).map((r) => r.outcome),rows.filter((r) => !r.due).length,Boolean(noDay));
  if (!rows.length && noDay?.outcome==='EXCUSED') result.outcome='EXCUSED';
  return result;
}
