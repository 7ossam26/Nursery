# Phase 17 — Child branch transfer and outstanding debt ownership

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Transferring partly paid debt while collections continue is a critical concurrency and attribution problem. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Move a child and only their remaining debt to a new branch while preserving all historical payments.

## Prerequisites and context

Prerequisites: [Phase 16](../phases/PHASE_16_expenses_corrections_closing.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R13, U17.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement transfer preview with source/destination/classroom, effective date, open due items, current amount, and permission checks over both branches. Revalidate at commit; preview is not an authority to use stale balances.

2. Implement one idempotent transfer service coordinating child/classroom history, receivable ownership, agreement future ownership, and audit. Lock against concurrent collection and recurrence using the established lock ordering.

3. Move outstanding portions and preserve their original debt references and due dates. Never clone the original full obligation, erase a source receipt, or create cash at transfer.

4. Define and record the effective period rule explicitly: existing current-period occurrence retains its identity and only its outstanding ownership moves; later occurrences use the child's committed destination. Handle effective dates and worker retries consistently.

5. Build clear transfer histories and branch receivable-in/out views. Parents see the permitted child's continuous finance history; destination staff see authorized transferred information rather than unrestricted source-branch records.

6. Handle existing bus/event/payroll-independent links conservatively; notify later transport/event services of the branch change without creating duplicate fees or assuming the child joins a new trip.

## Acceptance gate

- A21: 4,000 charge with 1,500 collected in A transfers only 2,500; B receives no cash until collection.
- A22: concurrent payment/transfer and recurrence/transfer yield a consistent single ordering with no lost debt.
- A01/A02: old/new teacher scopes and source/destination manager visibility update correctly.
- Repeated transfer request returns the original transfer; nursery total debt and historic treasury totals remain unchanged.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Cash transfer between treasuries, repricing historic sibling allocations, and automatic transfer between independent nurseries.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record lock ordering, ownership data model, current/future period rule, and the complete worked transfer evidence.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 17: Child branch transfer and outstanding debt ownership.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_17_child_branch_debt_transfer.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

