# Phase 16 — Expenses, transfers, refunds, and daily closing

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Sol**, **High reasoning** (closest available UI setting) before starting. Established financial primitives can support these workflows, but accounting effects need careful checking. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Track actual spending and auditable financial changes without corrupting treasury totals.

## Prerequisites and context

Prerequisites: [Phase 15](../phases/PHASE_15_collections_receipts_access_blocks.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R12.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement pending expenses with branch/category/optional classroom, due date, note/documents, approval state, and actual disbursement. Apply optional nursery expense approval thresholds explicitly.

2. Implement internal treasury transfers as paired atomic movements and present them separately from income/operating expense. Validate authority over both source and destination accounts.

3. Implement sensitive financial correction/reversal/replacement, credit creation/application, and actual refund workflows with reasons, available amount validation, actor entitlement, and original source references.

4. Implement daily cash closing with expected/counted/difference, explicit authorized shortage/surplus adjustment, and controlled reopen/current-date correction paths. Never silently rewrite a closed count.

5. Build usable expense/account/closing pages with audit history and clear warnings about cash effects. Reuse collection idempotency and private document services.

6. Ensure tuition reductions after payment produce credit unless an actual refund is separately recorded. Preserve historical branch/account attribution for refunds and corrections.

## Acceptance gate

- A23: pending expense leaves cash unchanged, and actual payment posts one outflow.
- A24: account transfer conserves total cash and is excluded from income/expense.
- A25: refunds cannot exceed refundable amounts; sensitive denial, closed-date edits, and reversal projections preserve totals.
- A18/A37: retry-safe disbursements and secure expense document access use the shared services.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Tax ledgers, bank reconciliation integrations, arbitrary deletion of settled records, and automated external transfers.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Record cash closing rules, reversal/credit/refund semantics, approval thresholds, and reconciliation examples.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 16: Expenses, transfers, refunds, and daily closing.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_16_expenses_corrections_closing.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

