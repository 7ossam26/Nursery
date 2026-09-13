# Phase 19 — Employee financials and monthly payroll

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. Payroll uses simple business rules but must avoid double-paying advances and final salary. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Record employee salary, month-specific adjustments, advances, and one full final payment.

## Prerequisites and context

Prerequisites: [Phase 18](../phases/PHASE_18_bus_trips_activities.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R15, U18.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement employee financial profiles independent of optional login accounts, salary history, and monthly salary snapshots with an explicit paying branch/account (D27). Operational branch assignments never split salary or rewrite historic payroll automatically. Use existing employee-slot provisioning when a login is requested.

2. Create month-scoped additions/bonuses, deductions/penalties, and paid advances with reason/actor and appropriate financial permissions. Lock the monthly balance for aggregate validation.

3. Enforce advances plus deductions/penalties at or below the basic salary even when bonuses exist. Salary changes apply to appropriate future periods; settled payroll is not silently recalculated.

4. Post an advance treasury outflow immediately and calculate final payable as salary plus additions minus deductions minus advances. Final payout must equal the entire remaining payable and occur once.

5. Handle zero remaining payable with an explicit no-cash settlement record; retain prior unpaid months separately with no automatic carry or deletion. Do not allow advances or deductions that would invalidate an already settled month.

6. Build employee financial detail, current payroll roster, month history, and salary receipt/export data. Payroll creates its own expense sources so staff cannot duplicate the same salary as a manual expense.

## Acceptance gate

- A26: 5,000 salary, 1,000 advance, 300 deduction yields 3,700 final and 4,700 total cash outflow.
- A27: two concurrent adjustments cannot jointly exceed the monthly cap.
- A28: repeated payout/response loss creates one settlement; old unpaid months remain separately payable.
- A01/A05: payroll visibility respects finance permissions and branch attribution, and profile deactivation does not free login slots.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Employee attendance, timesheets, partial final payment, auto carry-forward, taxation, and social insurance.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record payroll formula, adjustment cutoff, zero-payable behavior, profile/login distinction, and reconciliation evidence.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 19: Employee financials and monthly payroll.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_19_employee_payroll.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~
