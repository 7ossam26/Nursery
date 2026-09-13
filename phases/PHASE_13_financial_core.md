# Phase 13 — Financial records, transactions, and treasury core

Status: implementation not started in the delivered plan. Current execution status belongs in [PROJECT_STATE.md](../docs/PROJECT_STATE.md).

## Model and purpose

Select **Astra**, **High reasoning** (closest available UI setting) before starting. Exact money, transactional allocation, idempotency, and audit integrity demand the strongest review. This is a workload recommendation, not a guaranteed token estimate. See [model/context guidance](../docs/MODEL_AND_CONTEXT_GUIDE.md).

Establish one trustworthy financial service layer before building billing and collection workflows.

## Prerequisites and context

Prerequisites: [Phase 12](../phases/PHASE_12_parent_hub_notifications.md)

The supported execution order is 01 through 25. Dependency links identify the closest technical prerequisites; do not skip earlier phases just because every earlier number is not repeated here.

Requirements: R10–R12.

Always read [AGENTS.md](../AGENTS.md), [PROJECT_STATE.md](../docs/PROJECT_STATE.md), and [HANDOFF.md](../docs/HANDOFF.md). Then read relevant sections of:

- [FINANCE_RULES.md](../docs/FINANCE_RULES.md)
- [API_AND_DATA_CONTRACTS.md](../docs/API_AND_DATA_CONTRACTS.md)
- [ACCESS_AND_LICENSING.md](../docs/ACCESS_AND_LICENSING.md)
- [TESTING_AND_ACCEPTANCE.md](../docs/TESTING_AND_ACCEPTANCE.md)

## Implementation scope and checkpoints

1. Implement exact piastre utilities and JSON amount contracts, account/fee categories, obligations/installments, receipt/allocation records, credits, immutable treasury movements, operation idempotency, and audit schemas incrementally.

2. Implement PaymentService and TreasuryService transaction boundaries with stable lock ordering, row-level balance validation, payload-hash idempotency conflicts, and durable results. Charge creation must never post cash.

3. Create coded branch-owned treasury accounts and a default branch mapping, with explicit opening balances. Represent cash/bank/wallet destinations accurately without duplicating movements.

4. Implement canonical balance/remaining projections and reusable authorization for finance read, collect, and sensitive edits. Use capability plus Superadmin sensitive grant for correction actions.

5. Expose only the minimum tested API and account configuration screen needed by subsequent phases. Establish receipt number/reference and print-data contracts. Do not add a mutable paid-total field or fake paid checkbox.

6. Provide real PostgreSQL financial factories and reconciliation helpers used by later services; support cross-branch family receipt allocation as an explicit atomic grouped operation.

## Acceptance gate

- A18/A19: response loss/retry and concurrent collectors create no duplicate receipt or excess allocation.
- A01: scopes apply to balances, movement lists, and receipt records.
- A14: exact arithmetic preserves every piastre; JSON never serializes unsafe floating-point amounts.
- Rollback after a simulated intermediate failure leaves no partial receipt, movement, audit result, or allocation.
- Run the applicable established build/type/lint gate for changed packages. Record exact commands/results and migration implications. Do not repeat unrelated suites without a concrete risk or required gate.
- Update state/handoff after verification. Do not continue automatically into the next phase.

## Boundary

Outside this phase: Recurring billing scheduler, full collection UI, payroll, branch debt transfer, and optional accountancy integrations.

When an upstream defect prevents this phase, fix the narrow prerequisite and record the reason. A product change requires an explicit decision entry; do not silently expand scope.

## Required handoff

Document lock order, service APIs, canonical balance formula, receipt reference format, and transaction test evidence.

Include changed files, migration status, actual checks, unresolved issues, and the next executable action. Use the repository state files, not assumed chat memory.

## Copy-and-paste Codex prompt

The model is selected in Codex; text inside this prompt cannot change it.

~~~text
Implement Phase 13: Financial records, transactions, and treasury core.

Read AGENTS.md, docs/PROJECT_STATE.md, docs/HANDOFF.md, and phases/PHASE_13_financial_core.md completely. Read only the reference documents/sections listed in this phase plus code needed for its scope. Inspect the repository and current diff before editing; the planning files do not prove earlier phases were implemented.

Check the prerequisites against actual evidence. Outline a small sequence of implementation checkpoints, then execute this phase's scope and acceptance checks. Reuse existing contracts, components, services, and tests. Preserve unrelated user changes. Apply documented defaults in docs/DECISIONS.md; ask only if a material conflict cannot be resolved from the requirements and actual code.

Implement real working behavior for this phase. Do not add fake success paths, duplicate financial formulas, permissive authorization fallbacks, or features from later phases. Keep all applicable AGENTS.md invariants. Add focused tests for consequential rules and use real PostgreSQL for transaction/concurrency checks. Do not deploy to a live nursery or introduce subagents as a side effect.

At each meaningful checkpoint, update docs/PROJECT_STATE.md with actual progress and evidence. Before a context boundary, finish a safe checkpoint and update docs/HANDOFF.md with precise files, commands/results, unresolved work, and the next action; a phase may span multiple sessions. Never claim the phase is complete simply because context is running low.

When the phase's gate is satisfied, mark it complete with evidence and stop. Report what changed, actual verification, remaining limitations, and the next phase. If blocked, preserve completed work and describe the concrete blocker without marking checks passed.
~~~

